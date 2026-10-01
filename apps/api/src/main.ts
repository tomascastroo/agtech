import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap/configure-app.js';
import { loadAppConfig } from './config/app-config.js';
import { ObjectStorage } from './modules/storage/object-storage.js';

async function bootstrap() {
  const config = loadAppConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  configureApp(app, config);
  app.enableShutdownHooks();

  try {
    await app.get(ObjectStorage).ensureBucket();
  } catch (error) {
    logger.warn({ err: error }, 'No fue posible verificar el bucket de almacenamiento');
  }

  await app.listen(config.env.PORT, '0.0.0.0');
  logger.log(`API escuchando en el puerto ${config.env.PORT}`);
}

await bootstrap();
