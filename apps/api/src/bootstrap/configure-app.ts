import { RequestMethod, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AllExceptionsFilter } from '../common/http/all-exceptions.filter.js';
import { COOKIE_NAMES, CSRF_HEADER } from '../common/http/cookies.js';
import type { AppConfig } from '../config/app-config.js';

/** Configuración HTTP común a producción y tests (seguridad, validación, prefijos, OpenAPI). */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
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
}
