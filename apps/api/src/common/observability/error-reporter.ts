import { Global, Injectable, Logger, Module } from '@nestjs/common';

export interface ErrorContext {
  /** Componente donde ocurrió el error (http, verification-worker, reports-worker…). */
  component: string;
  requestId?: string | null;
  path?: string;
  organizationId?: string;
  extra?: Record<string, unknown>;
}

/**
 * Puerto de error tracking. El adaptador por defecto emite un log estructurado de nivel error
 * (consumible por cualquier agregador). Un proveedor externo se integra implementando esta
 * clase y registrándola en ObservabilityModule; no hay ninguno configurado en el MVP.
 */
export abstract class ErrorReporter {
  abstract capture(error: unknown, context: ErrorContext): void;
}

@Injectable()
export class LogErrorReporter extends ErrorReporter {
  private readonly logger = new Logger('ErrorReporter');

  capture(error: unknown, context: ErrorContext): void {
    this.logger.error({ err: error, ...context }, 'Error reportado');
  }
}

@Global()
@Module({
  providers: [{ provide: ErrorReporter, useClass: LogErrorReporter }],
  exports: [ErrorReporter],
})
export class ObservabilityModule {}
