import type { Anomaly } from '../../verification/domain/verification.types.js';
import { expectedVegetation, type PhenologyExpectation } from './phenology.js';
import {
  detectVegetationChange,
  isReliablePoint,
  type NdviPoint,
  type VegetationChange,
} from './vegetation-change.js';

/** Observación utilizable elegida como evidencia primaria de la verificación. */
export interface CurrentObservation {
  evidenceId: string;
  observationId: string;
  sceneId: string;
  acquiredAt: Date;
  ndviMean: number;
  ndviMedian: number | null;
  ndviMin: number | null;
  ndviMax: number | null;
  ndviStd: number | null;
  vegetationPct: number | null;
  vegetatedAreaHa: number | null;
  analyzedAreaHa: number | null;
  cloudCoverPct: number | null;
  validFraction: number | null;
  quality: string | null;
}

export interface ExcludedObservation {
  evidenceId: string;
  sceneId: string | null;
  cloudCoverPct: number | null;
  reason: string | null;
}

export interface AssessmentInput {
  verificationId: string;
  now: Date;
  assetTypeCode: string;
  metadata: Record<string, unknown>;
  declaredHa: number;
  current: CurrentObservation | null;
  excluded: ExcludedObservation[];
  /** Serie de observaciones utilizables anteriores (sin la actual). */
  history: NdviPoint[];
  newestUsableAt: Date | null;
  windowDays: number;
}

export interface AssessmentMetric {
  key: string;
  value: number;
  unit: string | null;
}

export interface VegetationAssessment {
  detectedQuantity: number | null;
  /** 0 cuando la verificación debe ser no concluyente (sin observación o sin vegetación esperable). */
  primaryEvidenceCount: number;
  newestEvidenceAt: Date | null;
  vegetationChangePct: number | null;
  phenology: PhenologyExpectation;
  change: VegetationChange | null;
  anomalies: Anomaly[];
  metrics: AssessmentMetric[];
}

/** Por debajo de esta proporción de la superficie declarada se informa caída de superficie. */
export const AREA_DROP_THRESHOLD = 0.92;

const fmt = (n: number, d = 2) => n.toLocaleString('es-AR', { maximumFractionDigits: d });

/**
 * Evaluación determinística de una verificación de vegetación: cobertura sobre la superficie
 * declarada, cambio contra la serie, fenología esperada y calidad de la observación. Pura: la
 * usan el pipeline y el seed, con el mismo resultado para los mismos datos.
 */
export function assessVegetation(input: AssessmentInput): VegetationAssessment {
  const { current, declaredHa } = input;
  const phenology = expectedVegetation(input.assetTypeCode, input.metadata, input.now);
  const anomalies: Anomaly[] = [];
  const metrics: AssessmentMetric[] = [];
  const metric = (key: string, value: number | null | undefined, unit: string | null = null) => {
    if (typeof value === 'number' && Number.isFinite(value)) metrics.push({ key, value, unit });
  };
  metric('scenes_excluded', input.excluded.length);

  if (!current) {
    anomalies.push({
      code: 'LOW_CONFIDENCE_OBSERVATION',
      severity: input.excluded.length > 0 ? 'WARNING' : 'INFO',
      message:
        input.excluded.length > 0
          ? `Sin observación satelital utilizable en los últimos ${input.windowDays} días: ${input.excluded.length} escena(s) descartadas por nubosidad o cobertura insuficiente sobre el lote.`
          : `No hay escenas Sentinel-2 que cubran el lote en los últimos ${input.windowDays} días.`,
      details: {
        verificationId: input.verificationId,
        evidenceIds: input.excluded.map((e) => e.evidenceId),
        metric: 'cloud_cover_pct',
        scenes: input.excluded,
        newestUsableObservationAt: input.newestUsableAt?.toISOString() ?? null,
      },
    });
    return {
      detectedQuantity: null,
      primaryEvidenceCount: 0,
      newestEvidenceAt: input.newestUsableAt,
      vegetationChangePct: null,
      phenology,
      change: null,
      anomalies,
      metrics,
    };
  }

  const change = detectVegetationChange(
    { observedAt: current.acquiredAt, ndviMean: current.ndviMean },
    input.history,
  );
  const vegetated = current.vegetatedAreaHa;
  const coverage = vegetated !== null && declaredHa > 0 ? vegetated / declaredHa : null;
  metric('ndvi_mean', current.ndviMean);
  metric('ndvi_median', current.ndviMedian);
  metric('ndvi_min', current.ndviMin);
  metric('ndvi_max', current.ndviMax);
  metric('ndvi_std', current.ndviStd);
  metric('vegetation_pct', current.vegetationPct, '%');
  metric('vegetated_area_ha', vegetated, 'HECTARE');
  metric('analyzed_area_ha', current.analyzedAreaHa, 'HECTARE');
  metric('cloud_cover_pct', current.cloudCoverPct, '%');
  metric('valid_fraction', current.validFraction);
  metric('ndvi_previous', change.previous?.ndviMean);
  metric('ndvi_delta', change.deltaNdvi);
  metric('ndvi_change_pct', change.changePct, '%');
  metric('ndvi_baseline', change.baselineNdvi);
  metric('ndvi_baseline_change_pct', change.baselineChangePct, '%');
  metric('series_points', input.history.length + 1);

  const reliable = isReliablePoint({ ...current, observedAt: current.acquiredAt });
  if (change.direction === 'DECLINE' && !reliable) {
    // Con nubosidad parcial (bruma, sombras no enmascaradas) el NDVI puede caer sin cambio real.
    anomalies.push({
      code: 'VEGETATION_CHANGE_UNCONFIRMED',
      severity: 'INFO',
      message: `Caída de NDVI no confirmada (${fmt(change.changePct ?? change.baselineChangePct ?? 0, 1)} %): la observación tiene nubosidad parcial sobre el lote (${fmt(current.cloudCoverPct ?? 0, 1)} %); se confirma con la próxima escena despejada.`,
      details: {
        verificationId: input.verificationId,
        evidenceId: current.evidenceId,
        metric: 'ndvi_mean',
        ndviMean: current.ndviMean,
        quality: current.quality,
        changePct: change.changePct,
        baselineChangePct: change.baselineChangePct,
      },
    });
  }
  if (change.direction === 'DECLINE' && reliable) {
    const reference = change.previous?.ndviMean ?? change.baselineNdvi ?? 0;
    const pct = change.changePct ?? change.baselineChangePct ?? 0;
    anomalies.push({
      code: 'VEGETATION_DECLINE',
      severity: phenology.vegetationExpected ? 'WARNING' : 'INFO',
      message:
        `Disminución significativa de actividad vegetal: NDVI ${fmt(reference)} → ${fmt(current.ndviMean)} (${fmt(pct, 1)} %).` +
        (phenology.vegetationExpected
          ? ''
          : ` ${phenology.reason} El descenso es compatible con la etapa declarada; confirmar con evidencia de campo.`),
      details: {
        verificationId: input.verificationId,
        evidenceId: current.evidenceId,
        observationId: current.observationId,
        sceneId: current.sceneId,
        observedAt: current.acquiredAt.toISOString(),
        metric: 'ndvi_mean',
        ndviMean: current.ndviMean,
        previousNdvi: change.previous?.ndviMean ?? null,
        previousObservedAt: change.previous?.observedAt.toISOString() ?? null,
        previousEvidenceId: change.previous?.evidenceId ?? null,
        deltaNdvi: change.deltaNdvi,
        changePct: change.changePct,
        baselineNdvi: change.baselineNdvi,
        baselineChangePct: change.baselineChangePct,
        baselinePoints: change.baselineCount,
        rules: change.rules,
        phenology,
      },
    });
  }

  if (!phenology.vegetationExpected) {
    anomalies.push({
      code: 'VEGETATION_NOT_EXPECTED',
      severity: 'INFO',
      message: `Verificación no concluyente: ${phenology.reason}`,
      details: {
        verificationId: input.verificationId,
        evidenceId: current.evidenceId,
        metric: 'vegetated_area_ha',
        vegetatedAreaHa: vegetated,
        phenology,
      },
    });
    return {
      detectedQuantity: null,
      primaryEvidenceCount: 0,
      newestEvidenceAt: current.acquiredAt,
      vegetationChangePct: change.changePct,
      phenology,
      change,
      anomalies,
      metrics,
    };
  }

  if (coverage !== null && coverage < AREA_DROP_THRESHOLD) {
    anomalies.push({
      code: 'VEGETATION_AREA_DROP',
      severity: 'WARNING',
      message: `La superficie con vegetación activa (${fmt(vegetated!)} ha) es inferior a la declarada (${fmt(declaredHa)} ha).`,
      details: {
        verificationId: input.verificationId,
        evidenceId: current.evidenceId,
        metric: 'vegetated_area_ha',
        detectedHa: vegetated,
        declaredHa,
        threshold: AREA_DROP_THRESHOLD,
      },
    });
  }
  if (vegetated !== null) {
    metric('detected_quantity', vegetated, 'HECTARE');
    metric('coverage_ratio', Math.round(coverage! * 10_000) / 10_000);
  }
  return {
    detectedQuantity: vegetated,
    primaryEvidenceCount: 1,
    newestEvidenceAt: current.acquiredAt,
    vegetationChangePct: change.changePct,
    phenology,
    change,
    anomalies,
    metrics,
  };
}
