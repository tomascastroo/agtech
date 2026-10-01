import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue, UnrecoverableError } from 'bullmq';
import { DataSource } from 'typeorm';
import { QUEUES, type ReportJobData } from '../../../../common/queues/queues.js';
import { AlertEngineService } from '../../../alerts/application/alert-engine.service.js';
import { statusAfterVerification } from '../../../assets/domain/asset-status.js';
import { AssetEntity } from '../../../assets/infrastructure/asset.entity.js';
import { AuditService } from '../../../audit/application/audit.service.js';
import { AUDIT_ACTIONS } from '../../../audit/application/audit.types.js';
import { MonitoringConfigService } from '../../../monitoring/application/monitoring-config.service.js';
import { MonitoringEventsService } from '../../../monitoring/application/monitoring-events.service.js';
import { OrganizationsService } from '../../../organizations/application/organizations.service.js';
import { ScoringEngine } from '../../../scoring/domain/scoring-engine.js';
import type { ScoringOutput } from '../../../scoring/domain/scoring.types.js';
import type { VerificationStrategyCode } from '../../../assets/domain/asset.types.js';
import type { PipelineStep } from '../../domain/verification.types.js';
import type { VerificationEvidenceEntity } from '../../infrastructure/verification-evidence.entity.js';
import { VerificationRepository } from '../../infrastructure/verification.repository.js';
import { ContextLoader } from './context-loader.js';
import { CrossChecksService, type CrossCheckResult } from './cross-checks.service.js';
import type {
  MetricInput,
  PipelineContext,
  StrategyOutcome,
  VerificationStrategy,
} from './pipeline-context.js';
import { buildScoringInput } from './scoring-input.builder.js';
import { EvidenceReviewStrategy } from './strategies/evidence-review.strategy.js';
import { LivestockCountingStrategy } from './strategies/livestock-counting.strategy.js';
import { VegetationAreaStrategy } from './strategies/vegetation-area.strategy.js';
import { buildSummary, unitLabel } from './summary.js';

/**
 * Pipeline de verificación (se ejecuta en el worker):
 *   1. obtiene evidencias (cámaras, satélite, cargas manuales)
 *   2. procesa imágenes con visión computacional
 *   3. calcula métricas y cruza información (geocerca, registro oficial)
 *   4. calcula el score explicable
 *   5. persiste resultado inmutable y actualiza el activo (transacción)
 *   6. evalúa reglas de alerta
 *   7. solicita el informe de garantía
 * Cada paso es idempotente para tolerar reintentos.
 */
@Injectable()
export class VerificationPipeline {
  private readonly logger = new Logger(VerificationPipeline.name);
  private readonly scoring = new ScoringEngine();
  private readonly strategies: Record<VerificationStrategyCode, VerificationStrategy>;

  constructor(
    private readonly repository: VerificationRepository,
    private readonly contextLoader: ContextLoader,
    private readonly crossChecks: CrossChecksService,
    private readonly organizations: OrganizationsService,
    private readonly alerts: AlertEngineService,
    private readonly monitoringConfig: MonitoringConfigService,
    private readonly events: MonitoringEventsService,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
    @InjectQueue(QUEUES.REPORTS) private readonly reportsQueue: Queue<ReportJobData>,
    livestock: LivestockCountingStrategy,
    vegetation: VegetationAreaStrategy,
    review: EvidenceReviewStrategy,
  ) {
    this.strategies = {
      LIVESTOCK_COUNTING: livestock,
      VEGETATION_AREA: vegetation,
      EVIDENCE_REVIEW: review,
    };
  }

  async execute(
    runId: string,
    requestId?: string,
    onStep: (step: PipelineStep) => Promise<void> = async () => undefined,
  ): Promise<void> {
    const run = await this.repository.findRun(runId);
    if (!run) throw new UnrecoverableError(`Verificación ${runId} inexistente`);
    if (run.status === 'COMPLETED' || run.status === 'FAILED') return;
    await this.repository.markProcessing(runId);
    await onStep('EVIDENCE');

    const ctx = await this.contextLoader.load(run, requestId);
    const strategy = this.strategies[ctx.assetType.verificationStrategy];

    let links = await this.repository.evidenceLinks(runId);
    if (links.length === 0) {
      const acquired = await strategy.acquire(ctx);
      await this.repository.linkEvidence(
        acquired.map((a) => ({
          verificationRunId: runId,
          evidenceId: a.evidence.id,
          organizationId: run.organizationId,
          role: a.role,
          detectedCount: a.detectedCount ?? null,
          confidence: a.confidence ?? null,
          analysis: a.analysis ?? {},
          aiModelVersionId: a.aiModelVersionId ?? null,
        })),
      );
      links = await this.repository.evidenceLinks(runId);
    }

    await onStep('METRICS');
    const outcome = await strategy.analyze(ctx, links);
    await onStep('CROSS_CHECKS');
    const cross = await this.crossChecks.run(ctx, links);
    await onStep('SCORING');
    const weights = await this.organizations.scoringWeights(run.organizationId);
    const scoring = this.scoring.score(buildScoringInput(ctx, outcome, cross), weights);

    await this.persist(ctx, links, outcome, cross, scoring);
    this.logger.log(
      { runId, assetId: ctx.asset.id, score: scoring.finalScore, outcome: scoring.outcome },
      'Verificación completada',
    );

    await onStep('ALERTS');
    await this.alerts.evaluate(run.organizationId, {
      phase: 'VERIFICATION',
      now: ctx.now,
      asset: {
        id: ctx.asset.id,
        name: ctx.asset.name,
        assetTypeCode: ctx.assetType.code,
        declaredQuantity: ctx.asset.declaredQuantity,
        unitLabel: unitLabel(ctx.asset.unit, ctx.asset.declaredQuantity),
        establishmentName: ctx.establishment.name,
      },
      verification: {
        runId,
        detectedQuantity: outcome.detectedQuantity,
        finalScore: scoring.finalScore,
        previousDetectedQuantity: ctx.history.at(-1)?.detectedQuantity ?? null,
        locationVerified: cross.location.verified,
        locationDistanceM: cross.location.distanceM,
        anomalies: [...outcome.anomalies, ...cross.anomalies],
        vegetationChangePct: outcome.vegetationChangePct,
        evidenceIds: links.filter((l) => l.role === 'PRIMARY').map((l) => l.evidenceId),
      },
      newestEvidenceAt: outcome.newestEvidenceAt,
      maxEvidenceAgeHours: ctx.monitoring?.maxEvidenceAgeHours ?? null,
      lastVerifiedAt: ctx.now,
      documents: ctx.documents.map((d) => ({
        id: d.id,
        title: d.title,
        expiresAt: d.expiresAt,
        status: d.status,
      })),
    });

    await onStep('REPORT');
    await this.reportsQueue.add(
      'create-for-run',
      {
        kind: 'create-for-run',
        runId,
        organizationId: run.organizationId,
        requestedBy: run.requestedBy,
      },
      { jobId: `report-run-${runId}` },
    );
  }

  async fail(runId: string, reason: string): Promise<void> {
    const run = await this.repository.findRun(runId);
    if (!run || !(await this.repository.markFailed(runId, reason))) return;
    const previousStatus = (run.inputSnapshot as { previousAssetStatus?: string })
      .previousAssetStatus;
    if (previousStatus) {
      await this.dataSource
        .getRepository(AssetEntity)
        .update(
          { id: run.assetId, status: 'PENDING_VERIFICATION' },
          { status: previousStatus as AssetEntity['status'] },
        );
    }
    await this.audit.record({
      actor: { kind: 'system', organizationId: run.organizationId, process: 'verification-worker' },
      action: AUDIT_ACTIONS.VERIFICATION_FAILED,
      resourceType: 'verification_run',
      resourceId: runId,
      metadata: { reason },
    });
    await this.events.record({
      organizationId: run.organizationId,
      assetId: run.assetId,
      verificationRunId: runId,
      type: 'VERIFICATION_FAILED',
      severity: 'WARNING',
      message: `La verificación no pudo completarse: ${reason}`.slice(0, 255),
    });
  }

  private async persist(
    ctx: PipelineContext,
    links: VerificationEvidenceEntity[],
    outcome: StrategyOutcome,
    cross: CrossCheckResult,
    scoring: ScoringOutput,
  ): Promise<void> {
    const { run, asset } = ctx;
    const declared = asset.declaredQuantity;
    const detected = outcome.detectedQuantity;
    const sourceKinds = new Set(
      links.filter((l) => l.role === 'PRIMARY').map((l) => l.evidence?.source?.kind),
    );
    const evidenceLabel = sourceKinds.has('SATELLITE')
      ? 'escenas satelitales'
      : sourceKinds.has('CAMERA')
        ? 'imágenes de cámaras'
        : 'imágenes cargadas';
    const metrics: MetricInput[] = [
      ...outcome.metrics,
      ...cross.metrics,
      { key: 'final_score', value: scoring.finalScore, source: 'scoring' },
      { key: 'weighted_score', value: scoring.weightedScore, source: 'scoring' },
      { key: 'risk_penalty', value: scoring.riskPenalty, source: 'scoring' },
      ...scoring.components.map((c) => ({
        key: `${c.key}_score`,
        value: c.score,
        source: 'scoring',
        details: { weight: c.weight, contribution: c.contribution },
      })),
    ];

    await this.dataSource.transaction(async (manager) => {
      await this.repository.saveResult(
        {
          organizationId: run.organizationId,
          verificationRunId: run.id,
          assetId: asset.id,
          outcome: scoring.outcome,
          declaredQuantity: declared,
          detectedQuantity: detected,
          unit: asset.unit,
          matchPercentage:
            scoring.matchRatio === null ? null : Math.round(scoring.matchRatio * 10_000) / 100,
          difference: detected === null ? null : Math.round((detected - declared) * 100) / 100,
          finalScore: scoring.finalScore,
          confidence: scoring.confidence,
          riskLevel: scoring.riskLevel,
          locationVerified: cross.location.verified,
          locationDistanceM: cross.location.distanceM,
          scoringModelVersion: scoring.modelVersion,
          scoreComponents: scoring.components,
          scoreWeights: scoring.weights,
          riskPenalty: scoring.riskPenalty,
          anomalies: [...outcome.anomalies, ...cross.anomalies],
          summary: buildSummary({
            declared,
            detected,
            unit: asset.unit,
            evidenceCount: outcome.primaryEvidenceCount,
            evidenceLabel,
            scoring,
          }),
          aiModelVersionId: outcome.aiModelVersionId,
        },
        metrics.map((m) => ({
          organizationId: run.organizationId,
          verificationRunId: run.id,
          key: m.key,
          value: m.value,
          unit: m.unit ?? null,
          source: m.source,
          details: m.details ?? {},
        })),
        manager,
      );
      await this.repository.markCompleted(run.id, manager);
      await manager.getRepository(AssetEntity).update(
        { id: asset.id },
        {
          status: statusAfterVerification(scoring.outcome),
          lastVerificationRunId: run.id,
          lastVerifiedAt: ctx.now,
          lastScore: scoring.finalScore,
          lastDetectedQuantity: detected,
        },
      );
      await this.monitoringConfig.scheduleNext(run.organizationId, asset.id, ctx.now, manager);
      await this.audit.record(
        {
          actor: {
            kind: 'system',
            organizationId: run.organizationId,
            process: 'verification-worker',
          },
          action: AUDIT_ACTIONS.VERIFICATION_COMPLETED,
          resourceType: 'verification_run',
          resourceId: run.id,
          metadata: {
            assetId: asset.id,
            finalScore: scoring.finalScore,
            outcome: scoring.outcome,
            modelVersion: scoring.modelVersion,
            requestedBy: run.requestedBy,
          },
        },
        manager,
      );
      await this.events.record(
        {
          organizationId: run.organizationId,
          assetId: asset.id,
          verificationRunId: run.id,
          type: 'VERIFICATION_COMPLETED',
          severity: scoring.outcome === 'VERIFIED' ? 'INFO' : 'WARNING',
          message: `Verificación completada: score ${scoring.finalScore}/100`,
          payload: { outcome: scoring.outcome, detected, declared },
        },
        manager,
      );
    });
  }
}
