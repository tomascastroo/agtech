import { matchRatio } from '../../../scoring/domain/scoring.math.js';
import type { ScoringInput } from '../../../scoring/domain/scoring.types.js';
import type { CrossCheckResult } from './cross-checks.service.js';
import type { PipelineContext, StrategyOutcome } from './pipeline-context.js';

const DEFAULT_MAX_EVIDENCE_AGE_HOURS = 72;

/** Póliza de seguro vigente cargada para el activo o su establecimiento. */
function hasValidInsurance(ctx: PipelineContext): boolean {
  const today = ctx.now.toISOString().slice(0, 10);
  return ctx.documents.some(
    (d) =>
      d.type === 'INSURANCE_POLICY' &&
      (d.status === 'VALID' || d.status === 'PENDING_REVIEW') &&
      (!d.expiresAt || d.expiresAt >= today),
  );
}

/** Traduce el contexto del pipeline al modelo de entrada (puro) del motor de scoring. */
export function buildScoringInput(
  ctx: PipelineContext,
  outcome: StrategyOutcome,
  cross: CrossCheckResult,
): ScoringInput {
  return {
    now: ctx.now,
    asset: {
      declaredQuantity: ctx.asset.declaredQuantity,
      unit: ctx.asset.unit,
      mobility: ctx.assetType.mobility,
      tenure: ctx.establishment.tenure,
    },
    detection: {
      detectedQuantity: outcome.detectedQuantity,
      countBasis: outcome.countBasis ?? 'CENSUS',
      confidence: outcome.confidence,
      evidenceCount: outcome.primaryEvidenceCount,
      averageQuality: outcome.averageQuality,
    },
    freshness: {
      newestEvidenceAt: outcome.newestEvidenceAt,
      maxEvidenceAgeHours: ctx.monitoring?.maxEvidenceAgeHours ?? DEFAULT_MAX_EVIDENCE_AGE_HOURS,
    },
    documents: {
      requirements: ctx.assetType.requiredDocuments,
      documents: ctx.documents.map((d) => ({
        type: d.type,
        status: d.status,
        expiresAt: d.expiresAt,
      })),
    },
    history: {
      previous: ctx.history.map((h) => ({
        completedAt: h.completedAt,
        matchRatio: matchRatio(h.declaredQuantity, h.detectedQuantity),
        finalScore: h.finalScore,
      })),
    },
    location: { verified: cross.location.verified, distanceM: cross.location.distanceM },
    registry: {
      status: cross.registry.status,
      registeredQuantity: cross.registry.registeredQuantity,
      declaredOnEstablishment: cross.registry.declaredOnEstablishment,
    },
    risk: {
      openAlerts: ctx.openAlerts.map((a) => ({ severity: a.severity })),
      activeDevices: outcome.activeDevices,
      expectedDevices: outcome.expectedDevices,
      monitoringEnabled: ctx.monitoring?.enabled ?? false,
      insured: hasValidInsurance(ctx),
    },
    anomalies: [...outcome.anomalies, ...cross.anomalies],
  };
}
