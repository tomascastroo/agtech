export const ESTABLISHMENT_TYPES = [
  'CRIA',
  'INVERNADA',
  'CICLO_COMPLETO',
  'TAMBO',
  'FEEDLOT',
  'AGRICOLA',
  'MIXTO',
  'VITIVINICOLA',
  'FRUTICOLA',
  'FORESTAL',
] as const;
export type EstablishmentType = (typeof ESTABLISHMENT_TYPES)[number];

export const TENURE_TYPES = ['OWNED', 'LEASED', 'OTHER'] as const;
export type Tenure = (typeof TENURE_TYPES)[number];

export const LOCATION_KINDS = ['MAIN', 'PADDOCK', 'ZONE', 'INFRASTRUCTURE'] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

/** CUIT/CUIL argentino con dígito verificador (módulo 11). */
export function isValidCuit(value: string): boolean {
  const digits = value.replace(/-/g, '');
  if (!/^\d{11}$/.test(digits)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
  const mod = 11 - (sum % 11);
  const check = mod === 11 ? 0 : mod === 10 ? 9 : mod;
  return check === Number(digits[10]);
}

export const RENSPA_PATTERN = /^\d{2}\.\d{3}\.\d\.\d{5}\/\d{2}$/;
export const CUIT_PATTERN = /^\d{2}-\d{8}-\d$/;
