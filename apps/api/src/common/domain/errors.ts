/**
 * Errores de dominio. La capa de dominio/aplicación nunca lanza excepciones HTTP: el filtro
 * global traduce estos errores a respuestas HTTP.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    this.details = details;
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  constructor(resource: string, id?: string) {
    super(`${resource} no encontrado`, id ? { resource, id } : { resource });
  }
}

export class ValidationFailedError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
}

export class ConflictError extends DomainError {
  readonly code = 'CONFLICT';
}

export class InvalidStateError extends DomainError {
  readonly code = 'INVALID_STATE';
}

export class ForbiddenActionError extends DomainError {
  readonly code = 'FORBIDDEN';
}

export class AuthenticationError extends DomainError {
  readonly code = 'UNAUTHENTICATED';
}

export class ExternalServiceError extends DomainError {
  readonly code = 'EXTERNAL_SERVICE_ERROR';
}

export class CapabilityNotAvailableError extends DomainError {
  readonly code = 'CAPABILITY_NOT_AVAILABLE';
}
