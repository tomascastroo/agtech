/**
 * Cobertura monetaria: animales verificables × peso × precio de referencia × factor de calidad,
 * comparado contra la deuda y el monto de la garantía. Nunca inventa peso, precio ni valuación:
 * si falta un dato, la cobertura es NO DETERMINABLE y se dice qué falta.
 */
export interface ValuationParams {
  averageWeightKg: number | null;
  weightSource: string | null;
  pricePerKg: number | null;
  priceCurrency: string | null;
  priceSource: string | null;
  priceDate: Date | null;
  /** Factor 0..1 por categoría/estado (lo informa la entidad). */
  qualityFactor: number | null;
}

export interface CoverageInput {
  verifiableHeads: number | null;
  valuation: ValuationParams;
  debtAmount: number | null;
  guaranteeAmount: number | null;
  currency: string;
  now: Date;
  maxPriceAgeDays: number;
}

export interface CoverageResult {
  status: 'DETERMINADA' | 'NO_DETERMINABLE';
  missing: string[];
  warnings: string[];
  verifiableHeads: number | null;
  verifiableValue: number | null;
  currency: string;
  /** valor verificable / deuda (o monto de la garantía si no se informó la deuda). */
  ratio: number | null;
  ratioBasis: 'DEUDA' | 'MONTO_GARANTIA' | null;
  guaranteeRatio: number | null;
  formula: string | null;
}

export function computeCoverage(input: CoverageInput): CoverageResult {
  const v = input.valuation;
  const missing: string[] = [];
  const warnings: string[] = [];
  if (input.verifiableHeads === null) missing.push('animales verificables (sin evidencia física)');
  if (v.averageWeightKg === null) missing.push('peso promedio');
  if (v.pricePerKg === null) missing.push('precio de referencia por kg');
  if (v.qualityFactor === null) missing.push('factor de calidad');
  if (input.debtAmount === null && input.guaranteeAmount === null)
    missing.push('deuda o monto de la garantía');
  if (v.pricePerKg !== null && v.priceCurrency && v.priceCurrency !== input.currency)
    missing.push(`tipo de cambio (precio en ${v.priceCurrency}, garantía en ${input.currency})`);

  const empty: CoverageResult = {
    status: 'NO_DETERMINABLE',
    missing,
    warnings,
    verifiableHeads: input.verifiableHeads,
    verifiableValue: null,
    currency: input.currency,
    ratio: null,
    ratioBasis: null,
    guaranteeRatio: null,
    formula: null,
  };
  if (missing.length) return empty;

  if (v.priceDate) {
    const age = (input.now.getTime() - v.priceDate.getTime()) / 86_400_000;
    if (age > input.maxPriceAgeDays)
      warnings.push(
        `El precio de referencia tiene ${Math.floor(age)} días (máximo sugerido ${input.maxPriceAgeDays}).`,
      );
  } else warnings.push('El precio de referencia no tiene fecha.');
  if (!v.priceSource) warnings.push('El precio de referencia no tiene fuente.');
  if (!v.weightSource) warnings.push('El peso promedio no tiene fuente.');

  const heads = input.verifiableHeads!;
  const value =
    Math.round(heads * v.averageWeightKg! * v.pricePerKg! * v.qualityFactor! * 100) / 100;
  const base = input.debtAmount ?? input.guaranteeAmount!;
  const round2 = (x: number) => Math.round(x * 100) / 100;
  return {
    ...empty,
    status: 'DETERMINADA',
    verifiableValue: value,
    ratio: base > 0 ? round2(value / base) : null,
    ratioBasis: input.debtAmount !== null ? 'DEUDA' : 'MONTO_GARANTIA',
    guaranteeRatio: input.guaranteeAmount ? round2(value / input.guaranteeAmount) : null,
    formula:
      `${heads.toLocaleString('es-AR')} cabezas × ${v.averageWeightKg!.toLocaleString('es-AR')} kg × ` +
      `${v.pricePerKg!.toLocaleString('es-AR')} ${input.currency}/kg × ${v.qualityFactor!.toLocaleString('es-AR')}`,
  };
}
