import 'reflect-metadata';
import { Queue } from 'bullmq';
import { pino } from 'pino';
import { DataSource } from 'typeorm';
import { QUEUE_PREFIX, QUEUES, redisConnection } from '../common/queues/queues.js';
import { loadAppConfig } from '../config/app-config.js';
import { bootstrapDatabase } from './bootstrap-database.js';
import { typeOrmOptions } from './typeorm-options.js';

const logger = pino({ name: 'reset-demo', level: process.env.LOG_LEVEL ?? 'info' });

/**
 * SOLO DESARROLLO: elimina el esquema completo, vacía las colas de verificación e informes y
 * vuelve a cargar la cartera demo. Se niega a ejecutarse en producción y exige --yes.
 */
async function main() {
  const config = loadAppConfig();
  if (config.env.NODE_ENV === 'production')
    throw new Error('reset-demo no puede ejecutarse en producción');
  if (!process.argv.includes('--yes')) {
    throw new Error('Operación destructiva: ejecute con --yes para confirmar');
  }
  const dataSource = new DataSource({ ...typeOrmOptions(config.env), logging: ['error'] });
  await dataSource.initialize();
  await dataSource.query('DROP SCHEMA IF EXISTS public CASCADE');
  await dataSource.query('CREATE SCHEMA public');
  await dataSource.destroy();
  for (const name of [QUEUES.VERIFICATION, QUEUES.REPORTS]) {
    const queue = new Queue(name, {
      prefix: QUEUE_PREFIX,
      connection: redisConnection(config.env.REDIS_URL),
    });
    await queue.obliterate({ force: true });
    await queue.close();
  }
  logger.info('Esquema y colas eliminados; recargando datos demo');
  await bootstrapDatabase();
}

main().catch((error: unknown) => {
  logger.error({ err: error }, 'Error al reiniciar la demo');
  process.exit(1);
});
