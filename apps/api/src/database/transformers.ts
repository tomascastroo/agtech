import type { ValueTransformer } from 'typeorm';

/** PostgreSQL devuelve NUMERIC como string; lo convertimos a number en la frontera. */
export const numericTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};
