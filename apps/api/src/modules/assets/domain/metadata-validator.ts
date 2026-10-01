import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';

export interface MetadataValidationResult {
  valid: boolean;
  errors: { field: string; message: string }[];
}

/**
 * Valida la metadata específica de cada tipo de activo contra el JSON Schema almacenado en
 * asset_types.metadata_schema. Agregar campos o tipos nuevos no requiere cambios de código.
 */
export class MetadataValidator {
  private readonly ajv = new Ajv({
    allErrors: true,
    strict: true,
    useDefaults: false,
    keywords: ['x-widget', 'x-unit', 'x-order'],
  });
  private readonly cache = new Map<string, ValidateFunction>();

  validate(
    cacheKey: string,
    schema: Record<string, unknown>,
    data: Record<string, unknown>,
  ): MetadataValidationResult {
    let validate = this.cache.get(cacheKey);
    if (!validate) {
      validate = this.ajv.compile({ ...schema, $async: false });
      this.cache.set(cacheKey, validate);
    }
    const valid = validate(data) as boolean;
    return { valid, errors: valid ? [] : (validate.errors ?? []).map(toFieldError) };
  }
}

function toFieldError(error: ErrorObject): { field: string; message: string } {
  const field =
    error.keyword === 'required'
      ? String((error.params as { missingProperty?: string }).missingProperty)
      : error.keyword === 'additionalProperties'
        ? String((error.params as { additionalProperty?: string }).additionalProperty)
        : error.instancePath.replace(/^\//, '') || '(raíz)';
  const messages: Record<string, string> = {
    required: 'Campo obligatorio',
    additionalProperties: 'Campo no permitido para este tipo de activo',
    type: 'Tipo de dato inválido',
    enum: 'Valor no permitido',
    minimum: 'Valor por debajo del mínimo',
    maximum: 'Valor por encima del máximo',
    pattern: 'Formato inválido',
    maxLength: 'Texto demasiado largo',
  };
  return { field, message: messages[error.keyword] ?? error.message ?? 'Valor inválido' };
}
