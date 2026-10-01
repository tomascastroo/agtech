/**
 * Detección de cambios sobre la serie NDVI de un activo: compara la observación actual con la
 * anterior utilizable y con una línea base (mediana de las observaciones de los últimos días).
 * Determinística y explicable: cada resultado expone los valores y umbrales usados.
 */

export interface NdviPoint {
  observedAt: Date;
  ndviMean: number;
  observationId?: string;
  evidenceId?: string | null;
  /** Solo las observaciones GOOD (nubosidad baja) sirven como referencia del cambio. */
  quality?: string | null;
}

/** Referencia confiable: sin calidad informada (series simuladas) o GOOD. */
export const isReliablePoint = (p: NdviPoint): boolean => !p.quality || p.quality === 'GOOD';

export interface ChangeRules {
  /** Caída relativa del NDVI (en %) a partir de la cual se considera significativa. */
  declinePct: number;
  /** Diferencia absoluta mínima de NDVI (evita alarmas por ruido con NDVI bajo). */
  minAbsDelta: number;
  /** Ventana de la línea base (días previos a la observación actual). */
  baselineDays: number;
}

export const DEFAULT_CHANGE_RULES: ChangeRules = {
  declinePct: 15,
  minAbsDelta: 0.08,
  baselineDays: 60,
};

export type ChangeDirection = 'DECLINE' | 'INCREASE' | 'STABLE' | 'UNKNOWN';

export interface VegetationChange {
  currentNdvi: number;
  previous: NdviPoint | null;
  deltaNdvi: number | null;
  changePct: number | null;
  baselineNdvi: number | null;
  baselineCount: number;
  baselineChangePct: number | null;
  direction: ChangeDirection;
  significant: boolean;
  rules: ChangeRules;
}

const DAY_MS = 86_400_000;
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const pct = (current: number, reference: number) =>
  reference === 0 ? null : round(((current - reference) / Math.abs(reference)) * 100, 2);

export function detectVegetationChange(
  current: NdviPoint,
  history: NdviPoint[],
  rules: ChangeRules = DEFAULT_CHANGE_RULES,
): VegetationChange {
  const before = history
    .filter((p) => isReliablePoint(p) && p.observedAt.getTime() < current.observedAt.getTime())
    .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  const previous = before.at(-1) ?? null;
  const windowStart = current.observedAt.getTime() - rules.baselineDays * DAY_MS;
  const baselinePoints = before.filter((p) => p.observedAt.getTime() >= windowStart);
  const baselineNdvi = baselinePoints.length
    ? round(median(baselinePoints.map((p) => p.ndviMean)), 4)
    : null;

  const deltaNdvi = previous ? round(current.ndviMean - previous.ndviMean, 4) : null;
  const changePct = previous ? pct(current.ndviMean, previous.ndviMean) : null;
  const baselineChangePct = baselineNdvi !== null ? pct(current.ndviMean, baselineNdvi) : null;

  const declineVsPrevious =
    deltaNdvi !== null &&
    changePct !== null &&
    changePct <= -rules.declinePct &&
    deltaNdvi <= -rules.minAbsDelta;
  const declineVsBaseline =
    baselineNdvi !== null &&
    baselineChangePct !== null &&
    baselineChangePct <= -rules.declinePct &&
    current.ndviMean - baselineNdvi <= -rules.minAbsDelta;
  const increase =
    deltaNdvi !== null &&
    changePct !== null &&
    changePct >= rules.declinePct &&
    deltaNdvi >= rules.minAbsDelta;

  let direction: ChangeDirection = 'UNKNOWN';
  if (declineVsPrevious || declineVsBaseline) direction = 'DECLINE';
  else if (increase) direction = 'INCREASE';
  else if (previous) direction = 'STABLE';

  return {
    currentNdvi: current.ndviMean,
    previous,
    deltaNdvi,
    changePct,
    baselineNdvi,
    baselineCount: baselinePoints.length,
    baselineChangePct,
    direction,
    significant: direction === 'DECLINE' || direction === 'INCREASE',
    rules,
  };
}
