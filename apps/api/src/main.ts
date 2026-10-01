import 'reflect-metadata';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/http/all-exceptions.filter.js';
import { COOKIE_NAMES, CSRF_HEADER } from './common/http/cookies.js';
import { loadAppConfig } from './config/app-config.js';
import { ObjectStorage } from './modules/storage/object-storage.js';

async function bootstrap() {
  const config = loadAppConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: '1mb' });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(cookieParser());
  app.enableCors({
    origin: [config.env.WEB_ORIGIN],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type', 'authorization', CSRF_HEADER, 'x-request-id'],
    exposedHeaders: ['x-request-id'],
  });
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  if (!config.isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('AgroGarantías API')
        .setDescription(
          'Verificación remota y recurrente de activos agropecuarios utilizados como garantía.',
        )
        .setVersion('0.1.0')
        .addBearerAuth()
        .addCookieAuth(COOKIE_NAMES.access)
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs/openapi.json' });
  }

  try {
    await app.get(ObjectStorage).ensureBucket();
  } catch (error) {
    logger.warn({ err: error }, 'No fue posible verificar el bucket de almacenamiento');
  }

  await app.listen(config.env.PORT, '0.0.0.0');
  logger.log(`API escuchando en el puerto ${config.env.PORT}`);
}

await bootstrap();
