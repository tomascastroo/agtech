import { BadRequestException, type ArgumentsHost } from '@nestjs/common';
import { NotFoundError } from '../domain/errors.js';
import { ErrorReporter, type ErrorContext } from '../observability/error-reporter.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

class RecordingReporter extends ErrorReporter {
  readonly captured: { error: unknown; context: ErrorContext }[] = [];
  capture(error: unknown, context: ErrorContext): void {
    this.captured.push({ error, context });
  }
}

function host() {
  const response = { statusCode: 0, body: undefined as unknown };
  const res = {
    status(code: number) {
      response.statusCode = code;
      return this;
    },
    json(body: unknown) {
      response.body = body;
    },
  };
  const req = { id: 'req-1', originalUrl: '/api/assets' };
  const argumentsHost = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ArgumentsHost;
  return { argumentsHost, response };
}

describe('AllExceptionsFilter', () => {
  it('traduce errores de dominio sin reportarlos', () => {
    const reporter = new RecordingReporter();
    const { argumentsHost, response } = host();
    new AllExceptionsFilter(reporter).catch(new NotFoundError('Activo', 'x'), argumentsHost);
    expect(response.statusCode).toBe(404);
    expect(response.body).toMatchObject({ error: 'NOT_FOUND', requestId: 'req-1' });
    expect(reporter.captured).toHaveLength(0);
  });

  it('expone los campos inválidos de la validación', () => {
    const { argumentsHost, response } = host();
    new AllExceptionsFilter(new RecordingReporter()).catch(
      new BadRequestException(['declaredQuantity must be a positive number']),
      argumentsHost,
    );
    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({
      message: 'La solicitud contiene datos inválidos',
      details: { fields: ['declaredQuantity must be a positive number'] },
    });
  });

  it('reporta los errores no controlados sin filtrar detalles internos', () => {
    const reporter = new RecordingReporter();
    const { argumentsHost, response } = host();
    const failure = new Error('connection reset by peer at 10.0.0.12');
    new AllExceptionsFilter(reporter).catch(failure, argumentsHost);
    expect(response.statusCode).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('10.0.0.12');
    expect(reporter.captured).toEqual([
      { error: failure, context: { component: 'http', requestId: 'req-1', path: '/api/assets' } },
    ]);
  });
});
