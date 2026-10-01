import { matchRatio, percent, round } from '../scoring.math.js';
import type { ComponentEvaluation, ScoreComponent, ScoringInput } from '../scoring.types.js';

const MAX_SCORE_WITHOUT_QUANTIFICATION = 60;

/** Existencia verificada: coincidencia entre lo declarado y lo detectado, ponderada por confianza. */
export class ExistenceComponent implements ScoreComponent {
  readonly key = 'existence' as const;
  readonly label = 'Existencia verificada';

  evaluate({ asset, detection }: ScoringInput): ComponentEvaluation {
    if (detection.evidenceCount === 0) {
      return {
        score: 0,
        explanation: 'No se registró evidencia utilizable para verificar la existencia del activo.',
        factors: [{ label: 'Evidencias analizadas', value: '0' }],
      };
    }
    const ratio = matchRatio(asset.declaredQuantity, detection.detectedQuantity);
    if (ratio === null) {
      const quality = detection.averageQuality ?? 0.5;
      const score = round(MAX_SCORE_WITHOUT_QUANTIFICATION * quality);
      return {
        score,
        explanation:
          'Existencia respaldada por evidencia visual sin cuantificación automática para este tipo de activo.',
        factors: [
          { label: 'Evidencias analizadas', value: String(detection.evidenceCount) },
          { label: 'Calidad promedio de imagen', value: percent(quality, 0) },
        ],
      };
    }
    const confidence = detection.confidence ?? 0;
    const score = round(100 * ratio * confidence);
    return {
      score,
      explanation: `Coincidencia de ${percent(ratio)} entre lo declarado y lo detectado, con confianza de detección de ${percent(confidence, 0)}.`,
      factors: [
        { label: 'Coincidencia declarado/detectado', value: percent(ratio) },
        { label: 'Confianza del modelo', value: percent(confidence, 0) },
        { label: 'Evidencias analizadas', value: String(detection.evidenceCount) },
      ],
    };
  }
}
