import type { VerificationEvidenceEntity } from '../infrastructure/verification-evidence.entity.js';
import type { VerificationMetricEntity } from '../infrastructure/verification-metric.entity.js';
import type { VerificationResultEntity } from '../infrastructure/verification-result.entity.js';
import type { VerificationRunEntity } from '../infrastructure/verification-run.entity.js';
import type { HistoricalResultRow } from '../infrastructure/verification.repository.js';
import type { ExternalDataSnapshotEntity } from '../../external-data/infrastructure/external-data-snapshot.entity.js';
import { presentEvidence } from '../../evidence/presentation/evidence.presenter.js';

export function presentResult(result: VerificationResultEntity) {
  return {
    outcome: result.outcome,
    declaredQuantity: result.declaredQuantity,
    detectedQuantity: result.detectedQuantity,
    unit: result.unit,
    matchPercentage: result.matchPercentage,
    difference: result.difference,
    finalScore: result.finalScore,
    confidence: result.confidence,
    riskLevel: result.riskLevel,
    locationVerified: result.locationVerified,
    locationDistanceM: result.locationDistanceM,
    scoringModelVersion: result.scoringModelVersion,
    components: result.scoreComponents,
    weights: result.scoreWeights,
    riskPenalty: result.riskPenalty,
    anomalies: result.anomalies,
    summary: result.summary,
    createdAt: result.createdAt,
  };
}

export function presentRun(run: VerificationRunEntity) {
  return {
    id: run.id,
    status: run.status,
    trigger: run.trigger,
    assetId: run.assetId,
    asset: run.asset
      ? {
          id: run.asset.id,
          name: run.asset.name,
          unit: run.asset.unit,
          typeCode: run.asset.assetType?.code ?? null,
          typeName: run.asset.assetType?.name ?? null,
          establishmentName: run.asset.establishment?.name ?? null,
        }
      : null,
    requestedBy: run.requestedBy,
    requestedByProcess: run.requestedByProcess,
    attempts: run.attempts,
    pipelineVersion: run.pipelineVersion,
    failureReason: run.failureReason,
    queuedAt: run.queuedAt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    result: run.result ? presentResult(run.result) : null,
  };
}

export function presentRunDetail(
  run: VerificationRunEntity,
  metrics: VerificationMetricEntity[],
  snapshots: ExternalDataSnapshotEntity[],
  history: HistoricalResultRow[],
) {
  return {
    ...presentRun(run),
    inputSnapshot: run.inputSnapshot,
    metrics: metrics.map((m) => ({
      key: m.key,
      value: m.value,
      unit: m.unit,
      source: m.source,
      details: m.details,
    })),
    externalData: snapshots.map((s) => ({
      id: s.id,
      source: s.source,
      provider: s.provider,
      subjectRef: s.subjectRef,
      status: s.status,
      simulated: s.isSimulated,
      payload: s.payload,
      fetchedAt: s.fetchedAt,
    })),
    history: history.map((h) => ({
      verificationId: h.runId,
      completedAt: h.completedAt,
      declaredQuantity: h.declaredQuantity,
      detectedQuantity: h.detectedQuantity,
      finalScore: h.finalScore,
      outcome: h.outcome,
    })),
  };
}

export function presentEvidenceLink(link: VerificationEvidenceEntity, url: string | null) {
  return {
    role: link.role,
    detectedCount: link.detectedCount,
    confidence: link.confidence,
    exclusionReason: link.exclusionReason,
    analysis: link.analysis,
    aiModelVersionId: link.aiModelVersionId,
    evidence: link.evidence ? presentEvidence(link.evidence, url) : null,
  };
}
