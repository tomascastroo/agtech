import type { ScoringOutput } from '../../../scoring/domain/scoring.types.js';

const UNIT_LABELS: Record<string, [string, string]> = {
  HEAD: ['cabeza', 'cabezas'],
  HECTARE: ['ha', 'ha'],
  TONNE: ['t', 't'],
  UNIT: ['unidad', 'unidades'],
  CUBIC_METER: ['m³', 'm³'],
};

const OUTCOME_TEXT: Record<string, string> = {
  VERIFIED: 'Activo verificado',
  OBSERVED: 'Verificación con observaciones',
  REJECTED: 'Verificación no satisfactoria',
  INCONCLUSIVE: 'Verificación no concluyente',
};

const RISK_TEXT: Record<string, string> = {
  LOW: 'riesgo bajo',
  MEDIUM: 'riesgo moderado',
  HIGH: 'riesgo alto',
};

export function unitLabel(unit: string, quantity: number): string {
  const [singular, plural] = UNIT_LABELS[unit] ?? ['', ''];
  return quantity === 1 ? singular : plural;
}

const n = (value: number, decimals = 0) =>
  value.toLocaleString('es-AR', { maximumFractionDigits: decimals });

/** Resumen en lenguaje natural del resultado, persistido junto con la verificación. */
export function buildSummary(input: {
  declared: number;
  detected: number | null;
  unit: string;
  evidenceCount: number;
  evidenceLabel: string;
  scoring: ScoringOutput;
}): string {
  const { scoring } = input;
  const parts = [`${OUTCOME_TEXT[scoring.outcome]}.`];
  if (
    scoring.outcome === 'INCONCLUSIVE' &&
    input.detected !== null &&
    scoring.matchRatio !== null
  ) {
    parts.push(
      `Se observaron al menos ${n(input.detected, 2)} de ${n(input.declared, 2)} ${unitLabel(input.unit, input.declared)} declaradas (cobertura ${n(scoring.matchRatio * 100, 1)} %) sobre ${input.evidenceCount} ${input.evidenceLabel}; la evidencia no cubre todo el rodeo.`,
    );
  } else if (scoring.outcome === 'INCONCLUSIVE' && input.evidenceCount === 0) {
    parts.push('No se registró evidencia utilizable.');
  } else if (input.detected !== null && scoring.matchRatio !== null) {
    parts.push(
      `Se verificaron ${n(input.detected, 2)} de ${n(input.declared, 2)} ${unitLabel(input.unit, input.declared)} declaradas (coincidencia ${n(scoring.matchRatio * 100, 1)} %) sobre ${input.evidenceCount} ${input.evidenceLabel}.`,
    );
  } else if (input.evidenceCount > 0) {
    parts.push(`Existencia respaldada por ${input.evidenceCount} ${input.evidenceLabel}.`);
  }
  parts.push(`Score ${scoring.finalScore}/100, ${RISK_TEXT[scoring.riskLevel]}.`);
  return parts.join(' ');
}
