import 'reflect-metadata';
import { pino } from 'pino';
import { bootstrapDatabase } from './bootstrap-database.js';

const logger = pino({ name: 'bootstrap', level: process.env.LOG_LEVEL ?? 'info' });

bootstrapDatabase().catch((error: unknown) => {
  logger.error({ err: error }, 'Error en el arranque');
  process.exit(1);
});
