import { Injectable } from '@nestjs/common';
import { SatelliteIngestionService } from '../../../../satellite/application/satellite-ingestion.service.js';
import { SatelliteImageryProvider } from '../../../../satellite/domain/satellite.provider.js';
import { AiModelsService } from '../../../../computer-vision/application/ai-models.service.js';
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
import { newestCapture, primary } from './evidence-stats.js';

const DAY_MS = 86_400_000;
const SEARCH_WINDOW_DAYS = 30;
const MAX_CLOUD_COVER = 30;
const AREA_DROP_THRESHOLD = 0.92;

/** Superficie con vegetación activa medida sobre la escena satelital más reciente. */
@Injectable()
export class VegetationAreaStrategy implements VerificationStrategy {
  readonly code = 'VEGETATION_AREA';

  constructor(
    private readonly provider: SatelliteImageryProvider,
    private readonly satellite: SatelliteIngestionService,
    private readonly models: AiModelsService,
    private readonly capture: CameraCaptureService,
    private readonly analysis: ImageAnalysisService,
  ) {}

  async acquire(ctx: PipelineContext): Promise<AcquiredEvidence[]> {
    const acquired: AcquiredEvidence[] = [];
    const area = ctx.asset.area;
    if (area) {
      const scenes = await this.provider.searchImages({
        aoi: area,
        from: new Date(ctx.now.getTime() - SEARCH_WINDOW_DAYS * DAY_MS),
        to: ctx.now,
        maxCloudCoverPct: MAX_CLOUD_COVER,
        limit: 5,
      });
      const scene = scenes[0];
      if (scene) {
        const previous = await this.satellite.latestObservation(ctx.asset.id);
        const result = await this.provider.analyzeVegetation(scene, area, {
          assetId: ctx.asset.id,
          declaredAreaHa: ctx.asset.declaredQuantity,
          baseline:
            previous && previous.ndviMean !== null && previous.vegetatedAreaHa !== null
              ? { ndviMean: previous.ndviMean, vegetatedAreaHa: previous.vegetatedAreaHa }
              : null,
        });
        const { evidence, observation } = await this.satellite.ingest({
          organizationId: ctx.asset.organizationId,
          assetId: ctx.asset.id,
          establishmentId: ctx.asset.establishmentId,
          scene,
          analysis: result,
          declaredAreaHa: ctx.asset.declaredQuantity,
          previous,
        });
        const modelVersionId = await this.models.resolveVersionId(
          result.model,
          'VEGETATION_INDEX',
          this.provider.name,
        );
        acquired.push({
          evidence,
          role: 'PRIMARY',
          detectedCount: null,
          confidence: result.confidence,
          aiModelVersionId: modelVersionId,
          analysis: {
            analyzedAt: new Date().toISOString(),
            sceneId: scene.sceneId,
            provider: this.provider.name,
            simulated: scene.simulated,
            acquiredAt: scene.acquiredAt.toISOString(),
            cloudCoverPct: result.cloudCoverPct,
            ndviMean: result.ndviMean,
            ndviStd: result.ndviStd,
            vegetatedAreaHa: result.vegetatedAreaHa,
            analyzedAreaHa: result.analyzedAreaHa,
            changeVsPreviousPct: observation.changeVsPreviousPct,
            observationId: observation.id,
            model: result.model,
          },
        });
      }
    }
    const manual = await this.capture.manualEvidence(ctx);
    acquired.push(...manual.map((evidence) => ({ evidence, role: 'SUPPORTING' as const })));
    return acquired;
  }

  async analyze(
    ctx: PipelineContext,
    links: VerificationEvidenceEntity[],
  ): Promise<StrategyOutcome> {
    await this.analysis.analyzePending(ctx, links, 'quality');
    const scenes = primary(links).filter((l) => l.evidence?.type === 'SATELLITE_SCENE');
    const scene = scenes[0];
    const data = (scene?.analysis ?? {}) as {
      vegetatedAreaHa?: number;
      ndviMean?: number;
      cloudCoverPct?: number;
      changeVsPreviousPct?: number | null;
    };
    const detected = typeof data.vegetatedAreaHa === 'number' ? data.vegetatedAreaHa : null;
    const declared = ctx.asset.declaredQuantity;
    const anomalies: Anomaly[] = [];
    if (detected !== null && detected / declared < AREA_DROP_THRESHOLD) {
      anomalies.push({
        code: 'VEGETATION_AREA_DROP',
        severity: 'WARNING',
        message: `La superficie con vegetación activa (${detected.toLocaleString('es-AR')} ha) es inferior a la declarada.`,
        details: { detectedHa: detected, declaredHa: declared },
      });
    }
    return {
      detectedQuantity: detected,
      confidence: scene?.confidence ?? null,
      averageQuality: null,
      primaryEvidenceCount: scenes.length,
      newestEvidenceAt: newestCapture(scenes),
      aiModelVersionId: scene?.aiModelVersionId ?? null,
      expectedDevices: 0,
      activeDevices: 0,
      vegetationChangePct: data.changeVsPreviousPct ?? null,
      anomalies,
      metrics: [
        { key: 'declared_quantity', value: declared, unit: 'HECTARE', source: 'asset' },
        ...(detected !== null
          ? [
              { key: 'detected_quantity', value: detected, unit: 'HECTARE', source: 'satellite' },
              {
                key: 'coverage_ratio',
                value: Math.round((detected / declared) * 10_000) / 10_000,
                source: 'satellite',
              },
            ]
          : []),
        ...(typeof data.ndviMean === 'number'
          ? [{ key: 'ndvi_mean', value: data.ndviMean, source: 'satellite' }]
          : []),
        ...(typeof data.cloudCoverPct === 'number'
          ? [{ key: 'cloud_cover_pct', value: data.cloudCoverPct, unit: '%', source: 'satellite' }]
          : []),
        ...(typeof data.changeVsPreviousPct === 'number'
          ? [
              {
                key: 'area_change_pct',
                value: data.changeVsPreviousPct,
                unit: '%',
                source: 'satellite',
              },
            ]
          : []),
      ],
    };
  }
}
