import { SCORE_COMPONENT_KEYS, type ScoringWeights } from './scoring.types.js';

export const SCORING_MODEL_VERSION = 'agro-score/1.0.0';

/** Pesos por defecto. Cada organización puede ajustarlos (deben sumar 1). */
export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  documentation: 0.2,
  existence: 0.25,
  historical: 0.2,
  risk: 0.15,
  consistency: 0.2,
};

/** Penalización por anomalía detectada en la verificación (puntos sobre el score final). */
export const ANOMALY_PENALTY = { CRITICAL: 10, WARNING: 3, INFO: 0 } as const;

export const OUTCOME_THRESHOLDS = {
  rejectedBelow: 50,
  observedBelow: 70,
  minimumMatchForVerified: 0.9,
} as const;

export class InvalidScoringWeightsError extends Error {}

export function validateWeights(weights: Partial<Record<string, number>>): ScoringWeights {
  const result = {} as ScoringWeights;
  for (const key of SCORE_COMPONENT_KEYS) {
    const value = weights[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new InvalidScoringWeightsError(`Peso inválido para "${key}"`);
    }
    result[key] = value;
  }
  const extra = Object.keys(weights).filter(
    (key) => !(SCORE_COMPONENT_KEYS as readonly string[]).includes(key),
  );
  if (extra.length > 0) {
    throw new InvalidScoringWeightsError(`Componentes desconocidos: ${extra.join(', ')}`);
  }
  const total = Object.values(result).reduce((a, b) => a + b, 0);
  if (Math.abs(total - 1) > 0.001) {
    throw new InvalidScoringWeightsError('Los pesos deben sumar 1');
  }
  return result;
}

export function resolveWeights(override?: Partial<Record<string, number>>): ScoringWeights {
  return override ? validateWeights(override) : { ...DEFAULT_SCORING_WEIGHTS };
}
