'use client';

import { Checkbox, Field, FormRow, Input, Select } from '@/components/ui/Field';
import type { JsonSchema, JsonSchemaProperty } from '@/lib/api/types';

export type RawMetadata = Record<string, string | boolean>;

/** Propiedades del esquema en el orden declarado (x-order) o alfabético. */
export function orderedProperties(schema: JsonSchema): [string, JsonSchemaProperty][] {
  return Object.entries(schema.properties ?? {}).sort(
    ([a, pa], [b, pb]) => (pa['x-order'] ?? 999) - (pb['x-order'] ?? 999) || a.localeCompare(b),
  );
}

/** Valores iniciales del formulario a partir de la metadata persistida. */
export function toRawMetadata(schema: JsonSchema, data: Record<string, unknown> = {}): RawMetadata {
  const raw: RawMetadata = {};
  for (const [key, prop] of orderedProperties(schema)) {
    const value = data[key];
    if (prop.type === 'boolean') raw[key] = value === true;
    else raw[key] = value === undefined || value === null ? '' : String(value as string | number);
  }
  return raw;
}

/**
 * Valida y convierte los valores del formulario al tipo del esquema. La API vuelve a
 * validar con el mismo esquema (Ajv); esta validación sólo adelanta el error al usuario.
 */
export function parseMetadata(
  schema: JsonSchema,
  raw: RawMetadata,
): { data: Record<string, unknown>; errors: Record<string, string> } {
  const data: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  const required = new Set(schema.required ?? []);
  for (const [key, prop] of orderedProperties(schema)) {
    const value = raw[key];
    if (prop.type === 'boolean') {
      data[key] = value === true;
      continue;
    }
    const text = typeof value === 'string' ? value.trim() : '';
    if (text === '') {
      if (required.has(key)) errors[key] = 'Dato obligatorio';
      continue;
    }
    if (prop.type === 'integer' || prop.type === 'number') {
      const number = Number(text.replace(',', '.'));
      if (!Number.isFinite(number) || (prop.type === 'integer' && !Number.isInteger(number))) {
        errors[key] = prop.type === 'integer' ? 'Ingresá un número entero' : 'Ingresá un número';
        continue;
      }
      if (prop.minimum !== undefined && number < prop.minimum) {
        errors[key] = `Debe ser mayor o igual a ${prop.minimum}`;
        continue;
      }
      if (prop.maximum !== undefined && number > prop.maximum) {
        errors[key] = `Debe ser menor o igual a ${prop.maximum}`;
        continue;
      }
      data[key] = number;
      continue;
    }
    if (prop.enum && !prop.enum.includes(text)) {
      errors[key] = 'Seleccioná una opción válida';
      continue;
    }
    if (prop.maxLength !== undefined && text.length > prop.maxLength) {
      errors[key] = `Máximo ${prop.maxLength} caracteres`;
      continue;
    }
    if (prop.pattern && !new RegExp(prop.pattern).test(text)) {
      errors[key] = prop['x-widget'] === 'date' ? 'Fecha inválida' : 'Formato inválido';
      continue;
    }
    data[key] = text;
  }
  return { data, errors };
}

/** Formulario generado desde el JSON Schema del tipo de activo (AssetMetadata). */
export function MetadataForm({
  schema,
  value,
  onChange,
  errors = {},
}: {
  schema: JsonSchema;
  value: RawMetadata;
  onChange: (value: RawMetadata) => void;
  errors?: Record<string, string>;
}) {
  const required = new Set(schema.required ?? []);
  const properties = orderedProperties(schema);
  if (properties.length === 0) return null;
  const set = (key: string, next: string | boolean) => onChange({ ...value, [key]: next });

  return (
    <FormRow columns={2}>
      {properties.map(([key, prop]) => {
        const label = `${prop.title ?? key}${prop['x-unit'] ? ` (${prop['x-unit']})` : ''}`;
        if (prop.type === 'boolean') {
          return (
            <div key={key} style={{ alignSelf: 'end', paddingBottom: 8 }}>
              <Checkbox
                label={label}
                checked={value[key] === true}
                onChange={(e) => set(key, e.target.checked)}
              />
            </div>
          );
        }
        const text = typeof value[key] === 'string' ? (value[key] as string) : '';
        return (
          <Field key={key} label={label} required={required.has(key)} error={errors[key]}>
            {(props) =>
              prop.enum ? (
                <Select
                  {...props}
                  name={key}
                  value={text}
                  onChange={(e) => set(key, e.target.value)}
                >
                  <option value="">Seleccionar…</option>
                  {prop.enum.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  {...props}
                  name={key}
                  type={prop['x-widget'] === 'date' ? 'date' : 'text'}
                  inputMode={
                    prop.type === 'integer'
                      ? 'numeric'
                      : prop.type === 'number'
                        ? 'decimal'
                        : undefined
                  }
                  maxLength={prop.maxLength}
                  value={text}
                  onChange={(e) => set(key, e.target.value)}
                />
              )
            }
          </Field>
        );
      })}
    </FormRow>
  );
}
