import 'reflect-metadata';
import { fileURLToPath } from 'node:url';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Queue } from 'bullmq';
import pg from 'pg';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/bootstrap/configure-app.js';
import { QUEUE_PREFIX, QUEUES, redisConnection } from '../../src/common/queues/queues.js';
import { loadAppConfig } from '../../src/config/app-config.js';
import { DemoSeeder } from '../../src/database/seed/seeder.js';
import { typeOrmOptions } from '../../src/database/typeorm-options.js';
import { S3ObjectStorage } from '../../src/modules/storage/s3-object-storage.js';
import { WorkerModule } from '../../src/worker.module.js';

/** Contraseña de los usuarios del seed en el entorno de pruebas (test/setup-env.ts). */
export const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? '';
export const USERS = {
  maria: 'maria.lopez@bancodelcampo.com.ar',
  analyst: 'federico.gimenez@bancodelcampo.com.ar',
  auditor: 'laura.benitez@bancodelcampo.com.ar',
  viewer: 'martin.sosa@bancodelcampo.com.ar',
  otherOrg: 'julian.herrera@pampaseguros.com.ar',
};

/** Base de datos de test recreada desde cero, migrada y con la cartera demo. */
export async function resetAndSeed(): Promise<void> {
  const config = loadAppConfig();
  const url = new URL(config.env.DATABASE_URL);
  const database = url.pathname.slice(1);
  const admin = new pg.Client({
    connectionString: config.env.DATABASE_URL.replace(`/${database}`, '/postgres'),
  });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
  if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${database}"`);
  await admin.end();

  const dataSource = new DataSource({ ...typeOrmOptions(config.env), logging: false });
  await dataSource.initialize();
  await dataSource.query('DROP SCHEMA IF EXISTS public CASCADE');
  await dataSource.query('CREATE SCHEMA public');
  await dataSource.runMigrations({ transaction: 'each' });

  const queue = new Queue(QUEUES.VERIFICATION, {
    prefix: QUEUE_PREFIX,
    connection: redisConnection(config.env.REDIS_URL),
  });
  await queue.obliterate({ force: true }).catch(() => undefined);
  for (const name of [QUEUES.REPORTS, QUEUES.MONITORING]) {
    const other = new Queue(name, {
      prefix: QUEUE_PREFIX,
      connection: redisConnection(config.env.REDIS_URL),
    });
    await other.obliterate({ force: true }).catch(() => undefined);
    await other.close();
  }
  await queue.close();

  const storage = new S3ObjectStorage(config);
  await storage.ensureBucket();
  await new DemoSeeder(dataSource, storage, {
    assetsDir: fileURLToPath(new URL('../../../../infra/seed-assets', import.meta.url)),
    demoPassword: DEMO_PASSWORD,
  }).run();
  await dataSource.destroy();
}

export interface TestContext {
  app: NestExpressApplication;
  worker: INestApplicationContext | null;
  dataSource: DataSource;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

export async function startTestApp(options: { withWorker: boolean }): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app, loadAppConfig());
  await app.init();
  const worker = options.withWorker
    ? await NestFactory.createApplicationContext(WorkerModule, { logger: false })
    : null;
  return {
    app,
    worker,
    dataSource: app.get(DataSource),
    http: () => request(app.getHttpServer()),
    close: async () => {
      await worker?.close();
      await app.close();
    },
  };
}

export interface Session {
  cookies: string[];
  csrf: string;
  accessToken: string;
  userId: string;
  organizationId: string;
}

export async function login(
  ctx: TestContext,
  email: string,
  password = DEMO_PASSWORD,
): Promise<Session> {
  const response = await ctx.http().post('/api/auth/login').send({ email, password }).expect(200);
  const cookies = ([] as string[]).concat(response.headers['set-cookie'] ?? []);
  const csrf = cookies
    .find((c) => c.startsWith('ag_csrf='))!
    .split(';')[0]!
    .split('=')[1]!;
  return {
    cookies: cookies.map((c) => c.split(';')[0]!),
    csrf,
    accessToken: response.body.accessToken as string,
    userId: response.body.user.id as string,
    organizationId: response.body.user.organizationId as string,
  };
}

/** Request autenticada por cookie con encabezado CSRF (como el navegador). */
export function as(ctx: TestContext, session: Session) {
  const withAuth = (req: request.Test) =>
    req.set('Cookie', session.cookies).set('x-csrf-token', session.csrf);
  return {
    get: (url: string) => withAuth(ctx.http().get(url)),
    post: (url: string) => withAuth(ctx.http().post(url)),
    patch: (url: string) => withAuth(ctx.http().patch(url)),
    put: (url: string) => withAuth(ctx.http().put(url)),
  };
}

export async function waitFor<T>(
  fn: () => Promise<T | null | undefined>,
  timeoutMs = 30_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Tiempo de espera agotado');
}

export async function assetIdByName(
  ctx: TestContext,
  session: Session,
  search: string,
): Promise<string> {
  const response = await as(ctx, session)
    .get(`/api/assets?search=${encodeURIComponent(search)}`)
    .expect(200);
  return response.body.items[0].id as string;
}

export async function fetchBytes(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Descarga fallida (${response.status})`);
  return Buffer.from((await response.arrayBuffer()) as ArrayBuffer);
}
