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
  lowQualityAnomaly,
  newestCapture,
  primary,
} from './evidence-stats.js';

/**
 * Conteo de animales por visión computacional. Las cámaras fijas cubren zonas distintas del
 * establecimiento, por lo que la cantidad detectada es la suma de sus conteos. Las cargas
 * manuales se usan como evidencia de respaldo cuando hay cámaras, o como fuente principal
 * cuando no las hay.
 */
@Injectable()
export class LivestockCountingStrategy implements VerificationStrategy {
  readonly code = 'LIVESTOCK_COUNTING';

  constructor(
    private readonly capture: CameraCaptureService,
    private readonly analysis: ImageAnalysisService,
  ) {}

  async acquire(ctx: PipelineContext): Promise<AcquiredEvidence[]> {
    const frames = await this.capture.captureAll(ctx);
    const manual = await this.capture.manualEvidence(ctx);
    const manualRole = frames.length > 0 ? 'SUPPORTING' : 'PRIMARY';
    return [
      ...frames.map((evidence) => ({ evidence, role: 'PRIMARY' as const })),
      ...manual.map((evidence) => ({ evidence, role: manualRole as 'PRIMARY' | 'SUPPORTING' })),
    ];
  }

  async analyze(
    ctx: PipelineContext,
    links: VerificationEvidenceEntity[],
  ): Promise<StrategyOutcome> {
    await this.analysis.analyzePending(ctx, links, 'count');
    const used = primary(links);
    const cameraLinks = used.filter((l) => l.evidence?.deviceId);
    const expectedDevices = this.capture.cameraInstallations(ctx).length;

    const detected = used.length ? used.reduce((acc, l) => acc + (l.detectedCount ?? 0), 0) : null;
    const confidence =
      detected && detected > 0
        ? used.reduce((acc, l) => acc + (l.confidence ?? 0) * (l.detectedCount ?? 0), 0) / detected
        : used.length
          ? Math.min(...used.map((l) => l.confidence ?? 0))
          : null;

    const anomalies: Anomaly[] = [];
    const duplicate = duplicateEvidenceAnomaly(used);
    if (duplicate) anomalies.push(duplicate);
    const lowQuality = lowQualityAnomaly(links);
    if (lowQuality) anomalies.push(lowQuality);
    if (expectedDevices > cameraLinks.length) {
      anomalies.push({
        code: 'DEVICE_NO_SIGNAL',
        severity: 'WARNING',
        message: `${expectedDevices - cameraLinks.length} de ${expectedDevices} cámaras no enviaron capturas.`,
        details: { expectedDevices, reporting: cameraLinks.length },
      });
    }

    const roundedConfidence = confidence === null ? null : Math.round(confidence * 1000) / 1000;
    const quality = averageQuality(used);
    const declared = ctx.asset.declaredQuantity;
    const modelIds = [...new Set(used.map((l) => l.aiModelVersionId).filter(Boolean))];
    return {
      detectedQuantity: detected,
      confidence: roundedConfidence,
      averageQuality: quality,
      primaryEvidenceCount: used.length,
      newestEvidenceAt: newestCapture(used),
      aiModelVersionId: modelIds.length === 1 ? modelIds[0]! : null,
      expectedDevices,
      activeDevices: cameraLinks.length,
      vegetationChangePct: null,
      anomalies,
      metrics: [
        { key: 'declared_quantity', value: declared, unit: 'HEAD', source: 'asset' },
        ...(detected !== null
          ? [
              {
                key: 'detected_quantity',
                value: detected,
                unit: 'HEAD',
                source: 'computer_vision',
              },
              {
                key: 'match_percentage',
                value:
                  Math.round(
                    (Math.min(detected, declared) / Math.max(detected, declared)) * 10_000,
                  ) / 100,
                unit: '%',
                source: 'computer_vision',
              },
            ]
          : []),
        ...(roundedConfidence !== null
          ? [{ key: 'detection_confidence', value: roundedConfidence, source: 'computer_vision' }]
          : []),
        ...(quality !== null
          ? [{ key: 'image_quality_avg', value: quality, source: 'computer_vision' }]
          : []),
        { key: 'evidence_primary_count', value: used.length, source: 'pipeline' },
        { key: 'cameras_expected', value: expectedDevices, source: 'devices' },
        { key: 'cameras_reporting', value: cameraLinks.length, source: 'devices' },
      ],
    };
  }
}
