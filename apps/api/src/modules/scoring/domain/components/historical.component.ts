import { clamp, matchRatio, round, standardDeviation } from '../scoring.math.js';
import type { ComponentEvaluation, ScoreComponent, ScoringInput } from '../scoring.types.js';

const LOOKBACK_DAYS = 180;
/** Días de verificación necesarios para considerar el historial "completo" (≈ 3 meses semanal). */
const TARGET_VERIFICATION_DAYS = 12;
const DAY_MS = 86_400_000;

/**
 * Historial: profundidad (días distintos con verificación), estabilidad de la coincidencia a lo
 * largo del tiempo y desempeño previo. Varias verificaciones en un mismo día cuentan como una,
 * para que repetir verificaciones no infle artificialmente la confianza.
 */
export class HistoricalComponent implements ScoreComponent {
  readonly key = 'historical' as const;
  readonly label = 'Historial';

  evaluate({ history, now, asset, detection }: ScoringInput): ComponentEvaluation {
    const today = now.toISOString().slice(0, 10);
    const from = now.getTime() - LOOKBACK_DAYS * DAY_MS;
    const byDay = new Map<string, (typeof history.previous)[number]>();
    for (const run of [...history.previous].sort((a, b) => +a.completedAt - +b.completedAt)) {
      const day = run.completedAt.toISOString().slice(0, 10);
      if (run.completedAt.getTime() < from || day >= today) continue;
      byDay.set(day, run);
    }
    const runs = [...byDay.values()];
    const depth = clamp(runs.length / TARGET_VERIFICATION_DAYS);

    const currentRatio = matchRatio(asset.declaredQuantity, detection.detectedQuantity);
    const ratios = [...runs.map((r) => r.matchRatio), currentRatio].filter(
      (r): r is number => r !== null,
    );
    const stability = ratios.length >= 2 ? clamp(1 - standardDeviation(ratios) * 20) : 0.5;
    const trackRecord =
      runs.length > 0 ? runs.reduce((acc, r) => acc + r.finalScore, 0) / runs.length / 100 : 0.5;

    const score = round(100 * (0.4 * depth + 0.3 * stability + 0.3 * trackRecord));
    return {
      score,
      explanation:
        runs.length === 0
          ? 'Sin verificaciones previas: el historial se construye con el monitoreo recurrente.'
          : `${runs.length} días con verificación en los últimos ${LOOKBACK_DAYS} días; estabilidad ${round(stability * 100)} / 100.`,
      factors: [
        { label: 'Días con verificación', value: `${runs.length} de ${TARGET_VERIFICATION_DAYS}` },
        { label: 'Estabilidad de la coincidencia', value: `${round(stability * 100)} / 100` },
        {
          label: 'Score promedio previo',
          value: runs.length ? `${round(trackRecord * 100)} / 100` : 'Sin datos',
        },
      ],
    };
  }
}
