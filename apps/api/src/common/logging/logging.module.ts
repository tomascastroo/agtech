import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Module, type DynamicModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfig } from '../../config/app-config.js';

const REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Logging estructurado (JSON) con pino. Cada request recibe un request-id (propagado desde
 * x-request-id si es válido) que se incluye en todos los logs y en la respuesta. Se redactan
 * credenciales y cookies. Preparado para enviarse a Datadog/Elastic/OpenTelemetry collector.
 */
@Module({})
export class LoggingModule {
  static forService(service: string): DynamicModule {
    return {
      module: LoggingModule,
      imports: [
        LoggerModule.forRootAsync({
          inject: [AppConfig],
          useFactory: (config: AppConfig) => ({
            pinoHttp: {
              level: config.env.LOG_LEVEL,
              base: { service, env: config.env.NODE_ENV },
              genReqId: (req: IncomingMessage, res: ServerResponse) => {
                const incoming = req.headers['x-request-id'];
                const id =
                  typeof incoming === 'string' && REQUEST_ID.test(incoming)
                    ? incoming
                    : randomUUID();
                res.setHeader('x-request-id', id);
                return id;
              },
              redact: {
                paths: [
                  'req.headers.authorization',
                  'req.headers.cookie',
                  'req.headers["x-csrf-token"]',
                  'res.headers["set-cookie"]',
                  '*.password',
                  '*.passwordHash',
                ],
                censor: '[REDACTED]',
              },
              autoLogging: {
                ignore: (req: IncomingMessage) => req.url?.startsWith('/health') ?? false,
              },
              customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) =>
                err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
              serializers: {
                req: (req: { id: string; method: string; url: string }) => ({
                  id: req.id,
                  method: req.method,
                  url: req.url,
                }),
                res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
              },
              transport:
                config.env.NODE_ENV === 'development'
                  ? {
                      target: 'pino-pretty',
                      options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' },
                    }
                  : undefined,
            },
          }),
        }),
      ],
    };
  }
}
