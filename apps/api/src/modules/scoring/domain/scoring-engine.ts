import type {
  Anomaly,
  RiskLevel,
  VerificationOutcome,
} from '../../verification/domain/verification.types.js';
import { ConsistencyComponent } from './components/consistency.component.js';
import { DocumentationComponent } from './components/documentation.component.js';
import { ExistenceComponent } from './components/existence.component.js';
import { HistoricalComponent } from './components/historical.component.js';
import { RiskComponent } from './components/risk.component.js';
import { ANOMALY_PENALTY, OUTCOME_THRESHOLDS, SCORING_MODEL_VERSION } from './scoring.config.js';
import { clamp, matchRatio, round } from './scoring.math.js';
import type {
  ScoreComponent,
  ScoreComponentResult,
  ScoringInput,
  ScoringOutput,
  ScoringWeights,
} from './scoring.types.js';

/**
 * Motor de scoring explicable.
 *
 *   score = Σ (peso_i × componente_i) − penalización por anomalías
 *
 * Cada componente devuelve su puntaje, una explicación y los factores que lo determinaron;
 * el resultado completo (componentes, pesos y versión del modelo) se persiste con la
 * verificación para que pueda auditarse y reproducirse.
 */
export class ScoringEngine {
  constructor(
    private readonly components: readonly ScoreComponent[] = [
      new DocumentationComponent(),
      new ExistenceComponent(),
      new HistoricalComponent(),
      new RiskComponent(),
      new ConsistencyComponent(),
    ],
    readonly modelVersion = SCORING_MODEL_VERSION,
  ) {}

  score(input: ScoringInput, weights: ScoringWeights): ScoringOutput {
    const results: ScoreComponentResult[] = this.components.map((component) => {
      const evaluation = component.evaluate(input);
      const score = round(clamp(evaluation.score, 0, 100));
      const weight = weights[component.key];
      return {
        key: component.key,
        label: component.label,
        ...evaluation,
        score,
        weight,
        contribution: round(score * weight, 2),
      };
    });

    const weightedScore = round(
      results.reduce((acc, r) => acc + r.score * r.weight, 0),
      2,
    );
    const riskPenalty = this.penalty(input.anomalies);
    const finalScore = round(clamp(weightedScore - riskPenalty, 0, 100));
    const ratio = matchRatio(input.asset.declaredQuantity, input.detection.detectedQuantity);
    const riskComponent = results.find((r) => r.key === 'risk')?.score ?? 0;

    return {
      modelVersion: this.modelVersion,
      finalScore,
      weightedScore,
      riskPenalty,
      matchRatio: ratio,
      confidence: this.confidence(input),
      outcome: this.outcome(input, finalScore, ratio),
      riskLevel: this.riskLevel(finalScore, riskComponent),
      weights,
      components: results,
    };
  }

  private penalty(anomalies: Anomaly[]): number {
    return anomalies.reduce((acc, a) => acc + ANOMALY_PENALTY[a.severity], 0);
  }

  private confidence({ detection }: ScoringInput): number {
    if (detection.evidenceCount === 0) return 0;
    if (detection.confidence !== null) return round(detection.confidence, 3);
    return round(0.5 * (detection.averageQuality ?? 0.5), 3);
  }

  private outcome(
    input: ScoringInput,
    finalScore: number,
    ratio: number | null,
  ): VerificationOutcome {
    if (input.detection.evidenceCount === 0) return 'INCONCLUSIVE';
    const critical = input.anomalies.some((a) => a.severity === 'CRITICAL');
    if (finalScore < OUTCOME_THRESHOLDS.rejectedBelow) return 'REJECTED';
    if (critical && ratio !== null && ratio < 0.7) return 'REJECTED';
    if (
      critical ||
      finalScore < OUTCOME_THRESHOLDS.observedBelow ||
      (ratio !== null && ratio < OUTCOME_THRESHOLDS.minimumMatchForVerified)
    ) {
      return 'OBSERVED';
    }
    return 'VERIFIED';
  }

  private riskLevel(finalScore: number, riskComponent: number): RiskLevel {
    if (finalScore >= 80 && riskComponent >= 75) return 'LOW';
    if (finalScore >= 60) return 'MEDIUM';
    return 'HIGH';
  }
}
