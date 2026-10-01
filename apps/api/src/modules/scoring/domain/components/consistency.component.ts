import { clamp, percent, round } from '../scoring.math.js';
import type {
  ComponentEvaluation,
  ScoreComponent,
  ScoreFactor,
  ScoringInput,
} from '../scoring.types.js';

const HOUR_MS = 3_600_000;
const FULLY_FRESH_HOURS = 6;
/** Sensibilidad a la diferencia con el registro oficial: 15 % de diferencia ≈ 0 puntos. */
const REGISTRY_SENSITIVITY = 6.5;

/**
 * Consistencia de la evidencia: actualidad, ubicación dentro del establecimiento y concordancia
 * con registros oficiales.
 */
export class ConsistencyComponent implements ScoreComponent {
  readonly key = 'consistency' as const;
  readonly label = 'Consistencia';

  evaluate({ freshness, location, registry, asset, now }: ScoringInput): ComponentEvaluation {
    const parts: { weight: number; score: number }[] = [];
    const factors: ScoreFactor[] = [];

    if (freshness.newestEvidenceAt) {
      const ageHours = (now.getTime() - freshness.newestEvidenceAt.getTime()) / HOUR_MS;
      const freshnessScore =
        ageHours <= FULLY_FRESH_HOURS
          ? 100
          : 100 * clamp(1 - ageHours / (freshness.maxEvidenceAgeHours * 2));
      parts.push({ weight: 0.4, score: freshnessScore });
      factors.push({ label: 'Antigüedad de la evidencia', value: `${round(ageHours, 1)} h` });
    } else {
      parts.push({ weight: 0.4, score: 0 });
      factors.push({ label: 'Antigüedad de la evidencia', value: 'Sin evidencia' });
    }

    const locationScore = location.verified === null ? 60 : location.verified ? 100 : 0;
    parts.push({ weight: 0.3, score: locationScore });
    factors.push({
      label: 'Ubicación de la evidencia',
      value:
        location.verified === null
          ? 'Sin georreferencia'
          : location.verified
            ? 'Dentro del establecimiento'
            : `Fuera del establecimiento (${round(location.distanceM ?? 0)} m)`,
    });

    if (registry.status !== 'NOT_APPLICABLE') {
      let registryScore = 50;
      let value = 'Sin coincidencia en el registro';
      if (registry.status === 'OK' && registry.registeredQuantity !== null) {
        const diff =
          Math.abs(registry.registeredQuantity - asset.declaredQuantity) / asset.declaredQuantity;
        registryScore = 100 * clamp(1 - diff * REGISTRY_SENSITIVITY);
        value = `Diferencia de ${percent(diff)} con el registro`;
      } else if (registry.status === 'ERROR') {
        value = 'Registro no disponible';
      }
      parts.push({ weight: 0.3, score: registryScore });
      factors.push({ label: 'Registro oficial', value });
    }

    const totalWeight = parts.reduce((acc, p) => acc + p.weight, 0);
    const score = round(parts.reduce((acc, p) => acc + p.weight * p.score, 0) / totalWeight);
    return {
      score,
      explanation:
        'Actualidad de la evidencia, georreferencia y concordancia con registros oficiales.',
      factors,
    };
  }
}
