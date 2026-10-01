import { fileURLToPath } from 'node:url';
import { Queue } from 'bullmq';
import { pino } from 'pino';
import { DataSource } from 'typeorm';
import {
  QUEUE_PREFIX,
  QUEUES,
  redisConnection,
  type ReportJobData,
} from '../common/queues/queues.js';
import { loadAppConfig } from '../config/app-config.js';
import { S3ObjectStorage } from '../modules/storage/s3-object-storage.js';
import { DemoSeeder } from './seed/seeder.js';
import { typeOrmOptions } from './typeorm-options.js';

const logger = pino({ name: 'bootstrap', level: process.env.LOG_LEVEL ?? 'info' });

async function retry<T>(label: string, fn: () => Promise<T>, attempts = 20): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= attempts) throw error;
      logger.warn({ attempt, err: (error as Error).message }, `${label}: reintentando`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

/**
 * Arranque del entorno: aplica migraciones, asegura el bucket y, si la base está vacía,
 * carga el catálogo y la cartera demo. Es idempotente: puede ejecutarse en cada despliegue.
 */
export async function bootstrapDatabase(): Promise<void> {
  const config = loadAppConfig();
  const dataSource = new DataSource({ ...typeOrmOptions(config.env), logging: ['error'] });
  await retry('Conexión a PostgreSQL', () => dataSource.initialize());
  const applied = await dataSource.runMigrations({ transaction: 'each' });
  logger.info({ migrations: applied.map((m) => m.name) }, 'Migraciones aplicadas');

  const storage = new S3ObjectStorage(config);
  await retry('Almacenamiento de objetos', () => storage.ensureBucket());

  const [{ count }] = (await dataSource.query(
    'SELECT count(*)::int AS count FROM organizations',
  )) as { count: number }[];
  if (count > 0 && process.env.SEED_FORCE !== 'true') {
    logger.info('La base ya contiene datos: se omite el seed');
  } else if (!config.env.SEED_DEMO_PASSWORD) {
    logger.warn('SEED_DEMO_PASSWORD no definido: se omite la carga de datos demo');
  } else {
    const assetsDir =
      config.env.SEED_ASSETS_DIR ??
      fileURLToPath(new URL('../../../../infra/seed-assets', import.meta.url));
    const result = await new DemoSeeder(dataSource, storage, {
      assetsDir,
      demoPassword: config.env.SEED_DEMO_PASSWORD,
    }).run();
    const queue = new Queue<ReportJobData>(QUEUES.REPORTS, {
      prefix: QUEUE_PREFIX,
      connection: redisConnection(config.env.REDIS_URL),
    });
    for (const runId of result.latestRunIds) {
      await queue.add(
        'create-for-run',
        { kind: 'create-for-run', runId, organizationId: result.organizationId, requestedBy: null },
        {
          jobId: `report-run-${runId}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );
    }
    await queue.close();
    logger.info({ reports: result.latestRunIds.length }, 'Datos demo cargados; informes encolados');
  }
  await dataSource.destroy();
}
