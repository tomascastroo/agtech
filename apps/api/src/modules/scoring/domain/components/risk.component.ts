import { clamp, round } from '../scoring.math.js';
import type {
  ComponentEvaluation,
  ScoreComponent,
  ScoreFactor,
  ScoringInput,
} from '../scoring.types.js';

const ALERT_PENALTY = { CRITICAL: 20, WARNING: 7, INFO: 2 } as const;
const MAX_ALERT_PENALTY = 40;

/**
 * Riesgo, expresado como "control de riesgo": 100 = riesgo mínimo. Parte de 100 y descuenta
 * factores de exposición (movilidad, tenencia, alertas abiertas, cobertura de monitoreo).
 */
export class RiskComponent implements ScoreComponent {
  readonly key = 'risk' as const;
  readonly label = 'Riesgo';

  evaluate({ asset, risk, registry }: ScoringInput): ComponentEvaluation {
    const factors: ScoreFactor[] = [];
    let score = 100;
    const apply = (label: string, value: string, penalty: number) => {
      if (penalty <= 0) return;
      score -= penalty;
      factors.push({ label, value, impact: -round(penalty, 1) });
    };

    if (asset.mobility === 'HIGH') apply('Movilidad del activo', 'Semoviente', 15);
    if (asset.tenure === 'LEASED') apply('Tenencia del establecimiento', 'Arrendado', 10);
    if (asset.tenure === 'OTHER') apply('Tenencia del establecimiento', 'Otra / precaria', 15);
    if (risk.insured === false) apply('Seguro del activo', 'Sin póliza vigente', 7);

    const alertPenalty = Math.min(
      MAX_ALERT_PENALTY,
      risk.openAlerts.reduce((acc, alert) => acc + ALERT_PENALTY[alert.severity], 0),
    );
    apply('Alertas abiertas', String(risk.openAlerts.length), alertPenalty);

    if (!risk.monitoringEnabled) apply('Monitoreo recurrente', 'Desactivado', 10);
    if (risk.expectedDevices > 0) {
      const coverage = clamp(risk.activeDevices / risk.expectedDevices);
      apply(
        'Cobertura de dispositivos',
        `${risk.activeDevices} de ${risk.expectedDevices} operativos`,
        15 * (1 - coverage),
      );
    }
    if (registry.status === 'NOT_FOUND') apply('Registro oficial', 'Sin coincidencia', 10);
    if (registry.status === 'ERROR') apply('Registro oficial', 'No disponible', 5);

    const final = round(clamp(score, 0, 100));
    return {
      score: final,
      explanation:
        factors.length === 0
          ? 'Sin factores de riesgo relevantes.'
          : `Factores de exposición considerados: ${factors.map((f) => f.label.toLowerCase()).join(', ')}.`,
      factors,
    };
  }
}
