import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { DomainError } from '../domain/errors.js';

const DOMAIN_STATUS: Record<string, number> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  VALIDATION_FAILED: HttpStatus.UNPROCESSABLE_ENTITY,
  CONFLICT: HttpStatus.CONFLICT,
  INVALID_STATE: HttpStatus.CONFLICT,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  EXTERNAL_SERVICE_ERROR: HttpStatus.BAD_GATEWAY,
  CAPABILITY_NOT_AVAILABLE: HttpStatus.NOT_IMPLEMENTED,
};

const PG_UNIQUE_VIOLATION = '23505';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
  requestId: string | null;
}

/** Manejo centralizado de errores: respuesta uniforme, sin filtrar detalles internos. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: string }>();
    const response = http.getResponse<Response>();
    const requestId = typeof request.id === 'string' ? request.id : null;
    const body = this.toBody(exception, requestId);

    if (body.statusCode >= 500) {
      this.logger.error(
        { err: exception, requestId, path: request.originalUrl },
        'Error no controlado',
      );
    }
    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, requestId: string | null): ErrorBody {
    if (exception instanceof DomainError) {
      return {
        statusCode: DOMAIN_STATUS[exception.code] ?? HttpStatus.BAD_REQUEST,
        error: exception.code,
        message: exception.message,
        details: exception.details,
        requestId,
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);
      return {
        statusCode: status,
        error: HttpStatus[status] ?? 'ERROR',
        message: Array.isArray(message) ? 'La solicitud contiene datos inválidos' : message,
        details: Array.isArray(message) ? { fields: message } : undefined,
        requestId,
      };
    }
    if (
      exception instanceof QueryFailedError &&
      (exception.driverError as { code?: string } | undefined)?.code === PG_UNIQUE_VIOLATION
    ) {
      return {
        statusCode: HttpStatus.CONFLICT,
        error: 'CONFLICT',
        message: 'El recurso ya existe o entra en conflicto con otro registro',
        requestId,
      };
    }
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'INTERNAL_ERROR',
      message: 'Ocurrió un error inesperado',
      requestId,
    };
  }
}
