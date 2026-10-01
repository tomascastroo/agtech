export const ASSET_STATUSES = [
  'DRAFT',
  'PENDING_VERIFICATION',
  'VERIFIED',
  'OBSERVED',
  'REJECTED',
] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const QUANTITY_UNITS = ['HEAD', 'HECTARE', 'TONNE', 'UNIT', 'CUBIC_METER'] as const;
export type QuantityUnit = (typeof QUANTITY_UNITS)[number];

export const ASSET_CATEGORIES = [
  'LIVESTOCK',
  'CROP',
  'PERENNIAL',
  'FORESTRY',
  'STORAGE',
  'MACHINERY',
  'INFRASTRUCTURE',
  'WATER',
  'OTHER',
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export const VERIFICATION_STRATEGIES = [
  'LIVESTOCK_COUNTING',
  'VEGETATION_AREA',
  'EVIDENCE_REVIEW',
] as const;
export type VerificationStrategyCode = (typeof VERIFICATION_STRATEGIES)[number];

export const CURRENCIES = ['USD', 'ARS'] as const;
export type Currency = (typeof CURRENCIES)[number];

export type Mobility = 'LOW' | 'HIGH';
export type GuaranteeStatus = 'ACTIVE' | 'RELEASED';
