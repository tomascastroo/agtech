import { Injectable, Logger } from '@nestjs/common';
import { AiModelsService } from '../../../../computer-vision/application/ai-models.service.js';
import {
  isUsableObservation,
  SatelliteIngestionService,
} from '../../../../satellite/application/satellite-ingestion.service.js';
import { vegetationThresholdFor } from '../../../../satellite/domain/phenology.js';
import {
  SatelliteImageryProvider,
  SceneOutsideAreaError,
  type SatelliteScene,
} from '../../../../satellite/domain/satellite.provider.js';
import {
  assessVegetation,
  type CurrentObservation,
} from '../../../../satellite/domain/vegetation-assessment.js';
import type { SatelliteObservationEntity } from '../../../../satellite/infrastructure/satellite-observation.entity.js';
import type { VerificationEvidenceEntity } from '../../../infrastructure/verification-evidence.entity.js';
import { CameraCaptureService } from '../camera-capture.service.js';
import { ImageAnalysisService } from '../image-analysis.service.js';
import type {
  AcquiredEvidence,
  PipelineContext,
  StrategyOutcome,
  VerificationStrategy,
} from '../pipeline-context.js';

const DAY_MS = 86_400_000;
/** Ventana de búsqueda de la observación actual. */
const SEARCH_WINDOW_DAYS = 30;
/** Prefiltro por nubosidad de la escena completa; la decisión final usa la nubosidad sobre el lote. */
const SCENE_CLOUD_PREFILTER = 80;
const MAX_SCENES_PER_RUN = 4;
/** Serie mínima para la línea base: si faltan observaciones se completa con escenas anteriores. */
const SERIES_DAYS = 120;
const MIN_SERIES_POINTS = 4;
const MAX_BACKFILL_SCENES = 4;

export interface SceneAnalysis {
  [key: string]: unknown;
  analyzedAt: string;
  purpose: 'CURRENT' | 'BASELINE';
  sceneId: string;
  provider: string;
  simulated: boolean;
  acquiredAt: string;
  observationId: string;
  usable: boolean;
  quality: string | null;
  issues: string[];
  cloudCoverPct: number | null;
  validFraction: number | null;
  ndviMean: number | null;
  ndviMedian: number | null;
  ndviMin: number | null;
  ndviMax: number | null;
  ndviStd: number | null;
  vegetationPct: number | null;
  vegetatedAreaHa: number | null;
  analyzedAreaHa: number | null;
  vegetationThreshold: number | null;
  changeVsPreviousPct: number | null;
  ndviChangePct: number | null;
  processingVersion: string | null;
  model: unknown;
}

const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/** Resumen de una observación tal como queda registrado en el vínculo evidencia–verificación. */
export function describeObservation(
  observation: SatelliteObservationEntity,
  scene: Pick<SatelliteScene, 'sceneId' | 'provider' | 'simulated' | 'acquiredAt'>,
  analyzedAt = new Date(),
): SceneAnalysis {
  const m = observation.metrics;
  return {
    analyzedAt: analyzedAt.toISOString(),
    purpose: 'CURRENT',
    sceneId: scene.sceneId,
    provider: scene.provider,
    simulated: scene.simulated,
    acquiredAt: scene.acquiredAt.toISOString(),
    observationId: observation.id,
    usable: isUsableObservation(observation),
    quality: typeof m.quality === 'string' ? m.quality : null,
    issues: Array.isArray(m.issues) ? (m.issues as string[]) : [],
    cloudCoverPct: num(m.cloudCoverPct),
    validFraction: num(m.validFraction),
    ndviMean: observation.ndviMean,
    ndviMedian: num(m.ndviMedian),
    ndviMin: num(m.ndviMin),
    ndviMax: num(m.ndviMax),
    ndviStd: observation.ndviStd,
    vegetationPct: num(m.vegetationPct),
    vegetatedAreaHa: observation.vegetatedAreaHa,
    analyzedAreaHa: num(m.analyzedAreaHa),
    vegetationThreshold: num(m.vegetationThreshold),
    changeVsPreviousPct: observation.changeVsPreviousPct,
    ndviChangePct: num(m.ndviChangePct),
    processingVersion: typeof m.processingVersion === 'string' ? m.processingVersion : null,
    model: m.model ?? null,
  };
}

export const ISSUE_LABELS: Record<string, string> = {
  CLOUD_COVER_ABOVE_LIMIT: 'nubosidad sobre el lote por encima del máximo',
  INSUFFICIENT_VALID_PIXELS: 'cobertura válida insuficiente',
  POLYGON_OUTSIDE_SCENE: 'el lote no está cubierto por la escena',
};

/**
 * Verificación de superficie con vegetación activa a partir de Sentinel-2:
 *   1. busca escenas de los últimos 30 días y las analiza de la más reciente hacia atrás;
 *      las que tienen nubes sobre el lote quedan registradas como evidencia EXCLUIDA;
 *   2. la primera observación utilizable es la evidencia PRIMARIA;
 *   3. completa la serie histórica (120 días) si no alcanza para una línea base;
 *   4. compara contra la observación anterior y la línea base (detección de cambios);
 *   5. contrasta con la fenología esperada (siembra, reposo invernal) antes de concluir.
 */
@Injectable()
export class VegetationAreaStrategy implements VerificationStrategy {
  readonly code = 'VEGETATION_AREA';
  private readonly logger = new Logger(VegetationAreaStrategy.name);

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
      const threshold = vegetationThresholdFor(ctx.assetType.code);
      const windowStart = new Date(ctx.now.getTime() - SEARCH_WINDOW_DAYS * DAY_MS);
      const seriesStart = new Date(ctx.now.getTime() - SERIES_DAYS * DAY_MS);
      const series = await this.satellite.usableObservationsSince(ctx.asset.id, seriesStart);

      const observe = async (
        scene: SatelliteScene,
        purpose: SceneAnalysis['purpose'],
      ): Promise<{ link: AcquiredEvidence; usable: boolean } | null> => {
        let result = await this.satellite.existing(ctx.asset.organizationId, ctx.asset.id, scene);
        if (!result) {
          let analysis;
          try {
            analysis = await this.provider.analyzeVegetation(scene, area, {
              assetId: ctx.asset.id,
              declaredAreaHa: ctx.asset.declaredQuantity,
              baseline: null,
              vegetationThreshold: threshold,
            });
          } catch (error) {
            if (error instanceof SceneOutsideAreaError) return null;
            throw error;
          }
          const previous =
            series.filter((o) => o.observedAt.getTime() < scene.acquiredAt.getTime()).at(-1) ??
            null;
          result = await this.satellite.ingest({
            organizationId: ctx.asset.organizationId,
            assetId: ctx.asset.id,
            establishmentId: ctx.asset.establishmentId,
            scene,
            analysis,
            declaredAreaHa: ctx.asset.declaredQuantity,
            previous,
            area,
          });
          if (isUsableObservation(result.observation)) {
            series.push(result.observation);
            series.sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
          }
        }
        const usable = isUsableObservation(result.observation);
        const model = result.observation.metrics.model as
          | { code: string; version: string; simulated: boolean }
          | undefined;
        const details = { ...describeObservation(result.observation, scene), purpose };
        return {
          usable,
          link: {
            evidence: result.evidence,
            role: 'EXCLUDED',
            detectedCount: null,
            confidence: num(result.observation.metrics.confidence),
            aiModelVersionId: model
              ? await this.models.resolveVersionId(model, 'VEGETATION_INDEX', this.provider.name)
              : null,
            analysis: details,
          },
        };
      };

      const scenes = await this.provider.searchImages({
        aoi: area,
        from: windowStart,
        to: ctx.now,
        maxCloudCoverPct: SCENE_CLOUD_PREFILTER,
        limit: MAX_SCENES_PER_RUN * 2,
      });
      let analyzed = 0;
      let primaryFound = false;
      for (const scene of scenes) {
        if (analyzed >= MAX_SCENES_PER_RUN) break;
        const observed = await observe(scene, 'CURRENT');
        if (!observed) continue;
        analyzed++;
        if (observed.usable) {
          observed.link.role = 'PRIMARY';
          acquired.push(observed.link);
          primaryFound = true;
          break;
        }
        const issues = (observed.link.analysis?.issues as string[]) ?? [];
        observed.link.analysis = {
          ...observed.link.analysis,
          excludedReason: issues.map((i) => ISSUE_LABELS[i] ?? i).join('; ') || 'baja calidad',
        };
        acquired.push(observed.link);
      }
      if (!primaryFound) {
        this.logger.log(
          { assetId: ctx.asset.id, analyzed },
          'Sin observación utilizable en la ventana',
        );
      }

      // Completa la serie para la línea base de la detección de cambios.
      if (series.length < MIN_SERIES_POINTS) {
        const oldest = scenes.at(-1)?.acquiredAt ?? windowStart;
        const older = await this.provider.searchImages({
          aoi: area,
          from: seriesStart,
          to: new Date(Math.min(oldest.getTime(), windowStart.getTime()) - 1),
          maxCloudCoverPct: 40,
          limit: MAX_BACKFILL_SCENES * 2,
        });
        let added = 0;
        for (const scene of older) {
          if (added >= MAX_BACKFILL_SCENES || series.length >= MIN_SERIES_POINTS + 1) break;
          const observed = await observe(scene, 'BASELINE');
          if (!observed) continue;
          added++;
          if (observed.usable) {
            observed.link.role = 'SUPPORTING';
            acquired.push(observed.link);
          }
        }
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
    const sceneLinks = links.filter((l) => l.evidence?.type === 'SATELLITE_SCENE');
    const primaryLink = sceneLinks.find((l) => l.role === 'PRIMARY') ?? null;
    const data = (primaryLink?.analysis ?? {}) as Partial<SceneAnalysis>;
    const series = await this.satellite.usableObservationsSince(
      ctx.asset.id,
      new Date(ctx.now.getTime() - SERIES_DAYS * DAY_MS),
    );
    const current: CurrentObservation | null =
      primaryLink && typeof data.ndviMean === 'number'
        ? {
            evidenceId: primaryLink.evidenceId,
            observationId: data.observationId!,
            sceneId: data.sceneId!,
            acquiredAt: new Date(data.acquiredAt!),
            ndviMean: data.ndviMean,
            ndviMedian: data.ndviMedian ?? null,
            ndviMin: data.ndviMin ?? null,
            ndviMax: data.ndviMax ?? null,
            ndviStd: data.ndviStd ?? null,
            vegetationPct: data.vegetationPct ?? null,
            vegetatedAreaHa: data.vegetatedAreaHa ?? null,
            analyzedAreaHa: data.analyzedAreaHa ?? null,
            cloudCoverPct: data.cloudCoverPct ?? null,
            validFraction: data.validFraction ?? null,
            quality: data.quality ?? null,
          }
        : null;
    const result = assessVegetation({
      verificationId: ctx.run.id,
      now: ctx.now,
      assetTypeCode: ctx.assetType.code,
      metadata: ctx.metadata,
      declaredHa: ctx.asset.declaredQuantity,
      current,
      excluded: sceneLinks
        .filter((l) => l.role === 'EXCLUDED')
        .map((l) => {
          const a = l.analysis as Partial<SceneAnalysis> & { excludedReason?: string };
          return {
            evidenceId: l.evidenceId,
            sceneId: a.sceneId ?? null,
            cloudCoverPct: a.cloudCoverPct ?? null,
            reason: a.excludedReason ?? null,
          };
        }),
      history: series
        .filter((o) => o.id !== current?.observationId && o.ndviMean !== null)
        .map((o) => ({
          observedAt: o.observedAt,
          ndviMean: o.ndviMean!,
          observationId: o.id,
          evidenceId: o.evidenceId,
          quality: typeof o.metrics.quality === 'string' ? o.metrics.quality : null,
        })),
      newestUsableAt: series.at(-1)?.observedAt ?? null,
      windowDays: SEARCH_WINDOW_DAYS,
    });
    return {
      detectedQuantity: result.detectedQuantity,
      confidence: current ? primaryLink!.confidence : null,
      averageQuality: null,
      primaryEvidenceCount: result.primaryEvidenceCount,
      newestEvidenceAt: result.newestEvidenceAt,
      aiModelVersionId: current ? primaryLink!.aiModelVersionId : null,
      expectedDevices: 0,
      activeDevices: 0,
      vegetationChangePct: result.vegetationChangePct,
      anomalies: result.anomalies,
      metrics: [
        {
          key: 'declared_quantity',
          value: ctx.asset.declaredQuantity,
          unit: 'HECTARE',
          source: 'asset',
        },
        ...result.metrics.map((m) => ({ ...m, source: 'satellite' })),
      ],
    };
  }
}
