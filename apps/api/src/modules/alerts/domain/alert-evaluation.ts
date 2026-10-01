import type { Anomaly } from '../../verification/domain/verification.types.js';
import type { AlertConditionType } from './alert.types.js';

export type EvaluationPhase = 'VERIFICATION' | 'MONITORING';

export interface AlertEvaluationContext {
  phase: EvaluationPhase;
  now: Date;
  asset: {
    id: string;
    name: string;
    assetTypeCode: string;
    declaredQuantity: number;
    unitLabel: string;
    establishmentName: string;
  };
  verification?: {
    runId: string;
    detectedQuantity: number | null;
    finalScore: number;
    previousDetectedQuantity: number | null;
    locationVerified: boolean | null;
    locationDistanceM: number | null;
    anomalies: Anomaly[];
    vegetationChangePct: number | null;
  };
  newestEvidenceAt: Date | null;
  /** Antigüedad máxima configurada para el activo; prevalece sobre el parámetro de la regla. */
  maxEvidenceAgeHours?: number | null;
  lastVerifiedAt: Date | null;
  documents: { id: string; title: string; expiresAt: string | null; status: string }[];
}

export interface AlertCandidate {
  title: string;
  description: string;
  context: Record<string, unknown>;
}

export interface AlertConditionEvaluator {
  readonly type: AlertConditionType;
  readonly phases: readonly EvaluationPhase[];
  evaluate(ctx: AlertEvaluationContext, params: Record<string, number>): AlertCandidate | null;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const fmt = (n: number, decimals = 0) =>
  n.toLocaleString('es-AR', { maximumFractionDigits: decimals, minimumFractionDigits: 0 });

/** Anomalías de comportamiento consideradas por la regla de score de anomalía. */
const BEHAVIORAL_ANOMALIES = new Set([
  'DUPLICATE_EVIDENCE',
  'REGISTRY_DISCREPANCY',
  'LOW_IMAGE_QUALITY',
  'DEVICE_NO_SIGNAL',
]);
const ANOMALY_WEIGHT = { CRITICAL: 1, WARNING: 0.35, INFO: 0.1 } as const;

export function anomalyScore(anomalies: Anomaly[]): number {
  const score = anomalies
    .filter((a) => BEHAVIORAL_ANOMALIES.has(a.code))
    .reduce((acc, a) => acc + ANOMALY_WEIGHT[a.severity], 0);
  return Math.min(1, Math.round(score * 100) / 100);
}

export const EVALUATORS: readonly AlertConditionEvaluator[] = [
  {
    type: 'QUANTITY_RATIO_BELOW',
    phases: ['VERIFICATION'],
    evaluate(ctx, { threshold = 0.9 }) {
      const detected = ctx.verification?.detectedQuantity ?? null;
      if (detected === null) return null;
      const ratio = detected / ctx.asset.declaredQuantity;
      if (ratio >= threshold) return null;
      return {
        title: 'Diferencia significativa entre cantidad declarada y detectada',
        description: `Se verificaron ${fmt(detected)} ${ctx.asset.unitLabel} sobre ${fmt(ctx.asset.declaredQuantity)} declaradas (${fmt(ratio * 100, 1)} %), por debajo del umbral de ${fmt(threshold * 100)} %.`,
        context: { detected, declared: ctx.asset.declaredQuantity, ratio, threshold },
      };
    },
  },
  {
    type: 'ACTIVITY_DROP',
    phases: ['VERIFICATION'],
    evaluate(ctx, { thresholdPct = 10 }) {
      const current = ctx.verification?.detectedQuantity ?? null;
      const previous = ctx.verification?.previousDetectedQuantity ?? null;
      if (current === null || previous === null || previous <= 0) return null;
      const dropPct = ((previous - current) / previous) * 100;
      if (dropPct <= thresholdPct) return null;
      return {
        title: 'Disminución de actividad ganadera',
        description: `La cantidad detectada bajó ${fmt(dropPct, 1)} % respecto de la verificación anterior (${fmt(previous)} → ${fmt(current)}).`,
        context: { previous, current, dropPct, thresholdPct },
      };
    },
  },
  {
    type: 'EVIDENCE_STALE',
    phases: ['VERIFICATION', 'MONITORING'],
    evaluate(ctx, params) {
      const maxAgeHours = ctx.maxEvidenceAgeHours ?? params.maxAgeHours ?? 72;
      const newest = ctx.newestEvidenceAt;
      // Activos en alta (nunca verificados) se cubren con NO_RECENT_VERIFICATION.
      if (!newest && !ctx.lastVerifiedAt) return null;
      const ageHours = newest ? (ctx.now.getTime() - newest.getTime()) / HOUR_MS : null;
      if (ageHours !== null && ageHours <= maxAgeHours) return null;
      return {
        title: 'Ausencia de imágenes recientes',
        description:
          ageHours === null
            ? 'El activo no tiene evidencia registrada.'
            : `La última evidencia tiene ${fmt(ageHours / 24, 1)} días de antigüedad (máximo configurado: ${fmt(maxAgeHours)} h).`,
        context: { newestEvidenceAt: newest?.toISOString() ?? null, maxAgeHours },
      };
    },
  },
  {
    type: 'LOCATION_MISMATCH',
    phases: ['VERIFICATION'],
    evaluate(ctx) {
      if (ctx.verification?.locationVerified !== false) return null;
      return {
        title: 'Evidencia fuera del establecimiento declarado',
        description: `Al menos una evidencia fue capturada a ${fmt(ctx.verification.locationDistanceM ?? 0)} m del límite de ${ctx.asset.establishmentName}.`,
        context: { distanceM: ctx.verification.locationDistanceM },
      };
    },
  },
  {
    type: 'ANOMALY_SCORE_ABOVE',
    phases: ['VERIFICATION'],
    evaluate(ctx, { threshold = 0.5 }) {
      const anomalies = ctx.verification?.anomalies ?? [];
      const score = anomalyScore(anomalies);
      if (score <= threshold) return null;
      const relevant = anomalies.filter((a) => BEHAVIORAL_ANOMALIES.has(a.code));
      return {
        title: 'Comportamiento anómalo detectado',
        description: relevant.map((a) => a.message).join(' '),
        context: { anomalyScore: score, anomalies: relevant.map((a) => a.code), threshold },
      };
    },
  },
  {
    type: 'VEGETATION_AREA_DROP',
    phases: ['VERIFICATION'],
    evaluate(ctx, { thresholdPct = 8 }) {
      const detected = ctx.verification?.detectedQuantity ?? null;
      if (detected === null) return null;
      const coverageDrop = (1 - detected / ctx.asset.declaredQuantity) * 100;
      const change = ctx.verification?.vegetationChangePct ?? null;
      const dropped = coverageDrop > thresholdPct || (change !== null && change < -thresholdPct);
      if (!dropped) return null;
      return {
        title: 'Cambio en la superficie cultivada',
        description: `La superficie con vegetación activa es de ${fmt(detected, 1)} ha sobre ${fmt(ctx.asset.declaredQuantity, 1)} ha declaradas (${fmt(coverageDrop, 1)} % menos).`,
        context: {
          detectedHa: detected,
          declaredHa: ctx.asset.declaredQuantity,
          coverageDropPct: coverageDrop,
          changeVsPreviousPct: change,
        },
      };
    },
  },
  {
    type: 'DOCUMENT_EXPIRING',
    phases: ['VERIFICATION', 'MONITORING'],
    evaluate(ctx, { withinDays = 30 }) {
      const limit = ctx.now.getTime() + withinDays * DAY_MS;
      const expiring = ctx.documents.filter(
        (d) =>
          d.status !== 'REJECTED' &&
          d.expiresAt &&
          new Date(`${d.expiresAt}T23:59:59Z`).getTime() <= limit,
      );
      if (expiring.length === 0) return null;
      const expired = expiring.filter((d) => new Date(`${d.expiresAt}T23:59:59Z`) < ctx.now);
      return {
        title: expired.length > 0 ? 'Documentación vencida' : 'Documentación próxima a vencer',
        description: expiring.map((d) => `${d.title} (vence ${d.expiresAt})`).join('; '),
        context: {
          documents: expiring.map((d) => ({ id: d.id, expiresAt: d.expiresAt })),
          withinDays,
        },
      };
    },
  },
  {
    type: 'NO_RECENT_VERIFICATION',
    phases: ['MONITORING'],
    evaluate(ctx, { maxDays = 15 }) {
      const last = ctx.lastVerifiedAt;
      const ageDays = last ? (ctx.now.getTime() - last.getTime()) / DAY_MS : null;
      if (ageDays !== null && ageDays <= maxDays) return null;
      return {
        title: 'Activo sin verificación reciente',
        description:
          ageDays === null
            ? 'El activo todavía no fue verificado.'
            : `La última verificación tiene ${fmt(ageDays)} días (máximo: ${fmt(maxDays)} días).`,
        context: { lastVerifiedAt: last?.toISOString() ?? null, maxDays },
      };
    },
  },
  {
    type: 'SCORE_BELOW',
    phases: ['VERIFICATION'],
    evaluate(ctx, { threshold = 60 }) {
      const score = ctx.verification?.finalScore;
      if (score === undefined || score >= threshold) return null;
      return {
        title: 'Score de verificación bajo',
        description: `El score de la verificación fue ${score}/100, por debajo del mínimo de ${threshold}.`,
        context: { score, threshold },
      };
    },
  },
];
