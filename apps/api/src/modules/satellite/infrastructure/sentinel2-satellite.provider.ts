import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../../config/app-config.js';
import {
  CapabilityNotAvailableError,
  ExternalServiceError,
} from '../../../common/domain/errors.js';
import type { GeoMultiPolygon } from '../../../common/geo/geojson.js';
import {
  SatelliteImageryProvider,
  SceneOutsideAreaError,
  type SatelliteScene,
  type SceneSearchQuery,
  type VegetationAnalysis,
} from '../domain/satellite.provider.js';

const COLLECTION = 'sentinel-2-l2a';
const SCENE_ID = /^S2[ABCD]_\d{1,2}[C-X][A-Z]{2}_\d{8}_\d+_L2A$/;

interface RemoteScene {
  scene_id: string;
  platform: string;
  acquired_at: string;
  tile: string;
  cloud_cover: number;
  processing_baseline: string | null;
  catalog: string;
}

interface RemoteObservation {
  scene: RemoteScene;
  polygon_pixels: number;
  valid_pixels: number;
  cloud_pixels: number;
  polygon_area_ha: number;
  cloud_cover_pct: number;
  valid_fraction: number;
  ndvi_mean: number | null;
  ndvi_median: number | null;
  ndvi_min: number | null;
  ndvi_max: number | null;
  ndvi_p10: number | null;
  ndvi_p90: number | null;
  ndvi_std: number | null;
  vegetated_pixels: number;
  vegetation_pct: number | null;
  vegetated_area_observed_ha: number;
  vegetated_area_estimated_ha: number | null;
  usable: boolean;
  quality: 'GOOD' | 'ACCEPTABLE' | 'LOW_CONFIDENCE';
  confidence: number;
  issues: string[];
  bands: string[];
  processing_version: string;
  processing_ms: number;
  previews: Record<string, string>;
}

const png = (b64: string | undefined) =>
  b64 ? { bytes: Buffer.from(b64, 'base64'), mimeType: 'image/png' } : null;

/**
 * Sentinel-2 L2A REAL. La búsqueda (catálogo STAC de Earth Search o, si no está disponible, los
 * ítems STAC publicados en el bucket público de AWS Open Data) y el cálculo de NDVI (bandas
 * B04/B08 en COG, máscara de nubes SCL, recorte al polígono) se ejecutan en el servicio de
 * visión; no requiere credenciales.
 */
@Injectable()
export class Sentinel2SatelliteProvider extends SatelliteImageryProvider {
  readonly name = 'sentinel2-l2a';
  readonly simulated = false;
  readonly capabilities = {
    search: true,
    download: false,
    vegetationAnalysis: true,
    changeAnalysis: false,
  };
  private readonly logger = new Logger(Sentinel2SatelliteProvider.name);

  constructor(private readonly config: AppConfig) {
    super();
  }

  async searchImages(query: SceneSearchQuery): Promise<SatelliteScene[]> {
    const scenes = await this.post<RemoteScene[]>('/v1/satellite/scenes/search', {
      geometry: query.aoi,
      start: query.from.toISOString().slice(0, 10),
      end: query.to.toISOString().slice(0, 10),
      max_scene_cloud_cover: query.maxCloudCoverPct,
      limit: query.limit,
    });
    return scenes
      .map((s) => this.toScene(s))
      .filter((s) => s.acquiredAt >= query.from && s.acquiredAt <= query.to);
  }

  async getMetadata(): Promise<SatelliteScene | null> {
    return null;
  }

  async downloadImage(): Promise<{ bytes: Buffer; mimeType: string } | null> {
    return null;
  }

  async analyzeVegetation(
    scene: SatelliteScene,
    aoi: GeoMultiPolygon,
    context: { vegetationThreshold?: number },
  ): Promise<VegetationAnalysis> {
    if (!SCENE_ID.test(scene.sceneId)) {
      throw new ExternalServiceError(
        `Identificador de escena Sentinel-2 inválido: ${scene.sceneId}`,
      );
    }
    let r: RemoteObservation;
    try {
      r = await this.post<RemoteObservation>('/v1/satellite/ndvi', {
        geometry: aoi,
        scene_id: scene.sceneId,
        include_previews: true,
        vegetation_threshold: context.vegetationThreshold ?? null,
      });
    } catch (error) {
      if (error instanceof ExternalServiceError && error.details?.status === 422) {
        throw new SceneOutsideAreaError(scene.sceneId);
      }
      throw error;
    }
    // Lote fuera de la franja adquirida por la órbita (ni píxeles válidos ni nubes).
    if (r.polygon_pixels > 0 && r.valid_pixels === 0 && r.cloud_pixels === 0) {
      throw new SceneOutsideAreaError(scene.sceneId);
    }
    return {
      ndviMean: r.ndvi_mean,
      ndviStd: r.ndvi_std,
      ndviMedian: r.ndvi_median,
      ndviMin: r.ndvi_min,
      ndviMax: r.ndvi_max,
      ndviP10: r.ndvi_p10,
      ndviP90: r.ndvi_p90,
      vegetationPct: r.vegetation_pct,
      vegetatedAreaHa: r.vegetated_area_estimated_ha,
      vegetatedAreaObservedHa: r.vegetated_area_observed_ha,
      analyzedAreaHa: r.polygon_area_ha,
      cloudCoverPct: r.cloud_cover_pct,
      sceneCloudCoverPct: r.scene.cloud_cover,
      validFraction: r.valid_fraction,
      usable: r.usable,
      quality: r.quality,
      issues: r.issues,
      confidence: r.confidence,
      vegetationThreshold: context.vegetationThreshold,
      bands: r.bands,
      processingVersion: r.processing_version,
      processingMs: r.processing_ms,
      preview: png(r.previews.ndvi),
      visualPreview: png(r.previews.visual),
      model: { code: 'sentinel2-ndvi', version: r.processing_version, simulated: false },
    };
  }

  analyzeChange(): Promise<{ changedAreaPct: number }> {
    return Promise.reject(
      new CapabilityNotAvailableError(
        'El cambio se calcula sobre la serie de observaciones NDVI del activo',
      ),
    );
  }

  private toScene(s: RemoteScene): SatelliteScene {
    return {
      sceneId: s.scene_id,
      provider: this.name,
      collection: COLLECTION,
      acquiredAt: new Date(s.acquired_at),
      cloudCoverPct: s.cloud_cover,
      resolutionM: 10,
      footprint: null,
      bands: ['B04', 'B08', 'SCL', 'TCI'],
      assets: {},
      simulated: false,
      platform: s.platform,
      tile: s.tile,
      catalog: s.catalog,
      processingBaseline: s.processing_baseline,
    };
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.config.env.AI_SERVICE_TOKEN)
      headers['x-internal-token'] = this.config.env.AI_SERVICE_TOKEN;
    let response: Response;
    try {
      response = await fetch(new URL(path, this.config.env.AI_SERVICE_URL), {
        method: 'POST',
        body: JSON.stringify(body),
        headers,
        signal: AbortSignal.timeout(this.config.env.AI_SERVICE_SATELLITE_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.warn({ err: error, path }, 'Servicio satelital no disponible');
      throw new ExternalServiceError('El servicio de procesamiento satelital no está disponible');
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new ExternalServiceError(`El servicio satelital respondió ${response.status}`, {
        status: response.status,
        detail: detail.slice(0, 300),
      });
    }
    return (await response.json()) as T;
  }
}
