import { Injectable } from '@nestjs/common';
import {
  ComputerVisionProvider,
  type ImageAnalysis,
  type ImageInput,
} from '../../../computer-vision/domain/computer-vision.provider.js';
import { AiModelsService } from '../../../computer-vision/application/ai-models.service.js';
import type { EvidenceEntity } from '../../../evidence/infrastructure/evidence.entity.js';
import { ObjectStorage } from '../../../storage/object-storage.js';
import type { VerificationEvidenceEntity } from '../../infrastructure/verification-evidence.entity.js';
import { VerificationRepository } from '../../infrastructure/verification.repository.js';
import { isAnalyzed, type PipelineContext } from './pipeline-context.js';

/** Problemas de imagen que invalidan un conteo automático. */
const DISQUALIFYING_ISSUES = new Set(['BLURRY', 'UNDEREXPOSED', 'OVEREXPOSED']);
const MAX_DETECTIONS_STORED = 500;

/**
 * Ejecuta visión computacional sobre la evidencia de la verificación y persiste el resultado
 * de cada imagen (conteo, confianza, calidad y versión del modelo). Es idempotente: si el job
 * se reintenta, las imágenes ya analizadas no se procesan de nuevo.
 */
@Injectable()
export class ImageAnalysisService {
  constructor(
    private readonly cv: ComputerVisionProvider,
    private readonly models: AiModelsService,
    private readonly storage: ObjectStorage,
    private readonly verification: VerificationRepository,
  ) {}

  async analyzePending(
    ctx: PipelineContext,
    links: VerificationEvidenceEntity[],
    mode: 'count' | 'quality',
  ): Promise<void> {
    for (const link of links) {
      if (!isAnalyzed(link) && link.evidence?.type === 'SCAN') {
        await this.useScanResult(link);
        continue;
      }
      if (isAnalyzed(link) || link.evidence?.type !== 'IMAGE' || !link.evidence.storageKey)
        continue;
      const image = await this.load(link.evidence);
      if (mode === 'count') {
        const result = await this.cv.countAnimals(
          image,
          { species: 'bovine' },
          { requestId: ctx.requestId },
        );
        const modelVersionId = await this.models.resolveVersionId(
          result.model,
          'ANIMAL_COUNTING',
          this.cv.name,
        );
        const disqualifying = result.image.issues.filter((i) => DISQUALIFYING_ISSUES.has(i));
        const excluded = disqualifying.length > 0;
        link.role = excluded ? 'EXCLUDED' : link.role;
        link.detectedCount = result.count;
        link.confidence = result.confidence;
        link.exclusionReason = excluded
          ? `Calidad insuficiente: ${disqualifying.join(', ')}`
          : null;
        link.aiModelVersionId = modelVersionId;
        link.analysis = {
          analyzedAt: new Date().toISOString(),
          count: result.count,
          confidence: result.confidence,
          clusteredComponents: result.clusteredComponents,
          detectionsTotal: result.detections.length,
          detectionsSample: result.detections.slice(0, MAX_DETECTIONS_STORED),
          imageSize: { width: result.image.width, height: result.image.height },
          inferencePasses: result.inferencePasses ?? 1,
          scoreThreshold: result.scoreThreshold ?? null,
          quality: this.quality(result.image),
          model: result.model,
          provider: this.cv.name,
          processingMs: result.processingMs,
        };
      } else {
        const analysis = await this.cv.analyzeImage(image, { requestId: ctx.requestId });
        const modelVersionId = await this.models.resolveVersionId(
          analysis.model,
          'IMAGE_QUALITY',
          this.cv.name,
        );
        link.aiModelVersionId = modelVersionId;
        link.confidence = analysis.qualityScore;
        link.analysis = {
          analyzedAt: new Date().toISOString(),
          quality: this.quality(analysis),
          model: analysis.model,
          provider: this.cv.name,
        };
      }
      await this.verification.updateLink(link.verificationRunId, link.evidenceId, {
        role: link.role,
        detectedCount: link.detectedCount ?? null,
        confidence: link.confidence ?? null,
        analysis: link.analysis,
        exclusionReason: link.exclusionReason ?? null,
        aiModelVersionId: link.aiModelVersionId ?? null,
      });
    }
  }

  /**
   * Evidencia de escaneo: el conteo oficial ya lo calculó el servidor sobre los cuadros
   * muestreados (no se recalcula ni se usa el conteo del celular). Un escaneo insuficiente
   * queda excluido del conteo.
   */
  private async useScanResult(link: VerificationEvidenceEntity): Promise<void> {
    const meta = link.evidence!.metadata as Record<string, unknown>;
    const insufficient = meta.quality === 'INSUFFICIENT';
    link.role = insufficient ? 'EXCLUDED' : link.role;
    link.detectedCount = typeof meta.officialCount === 'number' ? meta.officialCount : null;
    link.confidence = typeof meta.confidence === 'number' ? meta.confidence : null;
    link.exclusionReason = insufficient ? 'Escaneo de calidad insuficiente' : null;
    link.analysis = {
      analyzedAt: new Date().toISOString(),
      count: link.detectedCount,
      confidence: link.confidence,
      scan: {
        scanSessionId: meta.scanSessionId,
        mode: meta.mode,
        lowerBound: meta.lowerBound,
        quality: meta.quality,
        frames: meta.frames,
        deviceCount: meta.deviceCount,
      },
      model: meta.model,
      provider: 'bovine-scanner',
    };
    await this.verification.updateLink(link.verificationRunId, link.evidenceId, {
      role: link.role,
      detectedCount: link.detectedCount,
      confidence: link.confidence,
      analysis: link.analysis,
      exclusionReason: link.exclusionReason,
      aiModelVersionId: null,
    });
  }

  private async load(evidence: EvidenceEntity): Promise<ImageInput> {
    const ground = evidence.metadata.syntheticGroundTruth;
    return {
      bytes: await this.storage.getObject(evidence.storageKey!),
      mimeType: evidence.mimeType ?? 'image/jpeg',
      fileName: `${evidence.id}.${evidence.mimeType === 'image/png' ? 'png' : 'jpg'}`,
      hints: typeof ground === 'number' ? { syntheticGroundTruth: ground } : undefined,
    };
  }

  private quality(analysis: ImageAnalysis) {
    return {
      width: analysis.width,
      height: analysis.height,
      sharpness: analysis.sharpness,
      brightness: analysis.brightness,
      contrast: analysis.contrast,
      dhash: analysis.dhash,
      score: analysis.qualityScore,
      issues: analysis.issues,
      exifCapturedAt: analysis.exif.capturedAt,
    };
  }
}
