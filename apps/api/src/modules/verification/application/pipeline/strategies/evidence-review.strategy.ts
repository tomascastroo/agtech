import { Injectable } from '@nestjs/common';
import type { Anomaly } from '../../../domain/verification.types.js';
import type { VerificationEvidenceEntity } from '../../../infrastructure/verification-evidence.entity.js';
import { CameraCaptureService } from '../camera-capture.service.js';
import { ImageAnalysisService } from '../image-analysis.service.js';
import type {
  AcquiredEvidence,
  PipelineContext,
  StrategyOutcome,
  VerificationStrategy,
} from '../pipeline-context.js';
import {
  averageQuality,
  duplicateEvidenceAnomaly,
  newestCapture,
  primary,
} from './evidence-stats.js';

/**
 * Revisión de evidencia visual para activos sin cuantificación automática (maquinaria,
 * infraestructura, silos, etc.): verifica existencia, actualidad, calidad y ubicación.
 */
@Injectable()
export class EvidenceReviewStrategy implements VerificationStrategy {
  readonly code = 'EVIDENCE_REVIEW';

  constructor(
    private readonly capture: CameraCaptureService,
    private readonly analysis: ImageAnalysisService,
  ) {}

  async acquire(ctx: PipelineContext): Promise<AcquiredEvidence[]> {
    const frames = await this.capture.captureAll(ctx);
    const manual = await this.capture.manualEvidence(ctx);
    return [...frames, ...manual].map((evidence) => ({ evidence, role: 'PRIMARY' as const }));
  }

  async analyze(
    ctx: PipelineContext,
    links: VerificationEvidenceEntity[],
  ): Promise<StrategyOutcome> {
    await this.analysis.analyzePending(ctx, links, 'quality');
    const used = primary(links);
    const quality = averageQuality(used);
    const anomalies: Anomaly[] = [];
    const duplicate = duplicateEvidenceAnomaly(used);
    if (duplicate) anomalies.push(duplicate);
    if (quality !== null && quality < 0.5) {
      anomalies.push({
        code: 'LOW_IMAGE_QUALITY',
        severity: 'INFO',
        message: 'La calidad promedio de las imágenes es baja para una verificación confiable.',
        details: { averageQuality: quality },
      });
    }
    const cameras = this.capture.cameraInstallations(ctx).length;
    return {
      detectedQuantity: null,
      confidence: null,
      averageQuality: quality,
      primaryEvidenceCount: used.length,
      newestEvidenceAt: newestCapture(used),
      aiModelVersionId: null,
      expectedDevices: cameras,
      activeDevices: used.filter((l) => l.evidence?.deviceId).length,
      vegetationChangePct: null,
      anomalies,
      metrics: [
        {
          key: 'declared_quantity',
          value: ctx.asset.declaredQuantity,
          unit: ctx.asset.unit,
          source: 'asset',
        },
        { key: 'evidence_primary_count', value: used.length, source: 'pipeline' },
        ...(quality !== null
          ? [{ key: 'image_quality_avg', value: quality, source: 'computer_vision' }]
          : []),
      ],
    };
  }
}
