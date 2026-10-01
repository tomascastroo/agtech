import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../config/app-config.js';
import {
  CapabilityNotAvailableError,
  ExternalServiceError,
} from '../../../common/domain/errors.js';
import type { GeoPolygon } from '../../../common/geo/geojson.js';
import {
  SatelliteImageryProvider,
  type SatelliteScene,
  type SceneSearchQuery,
  type VegetationAnalysis,
} from '../domain/satellite.provider.js';

const COLLECTION = 'sentinel-2-l2a';

interface StacItem {
  id: string;
  geometry: GeoPolygon | null;
  properties: { datetime: string; 'eo:cloud_cover'?: number; gsd?: number };
  assets: Record<string, { href: string; type?: string }>;
}

/**
 * Adapter STAC API 1.0 (p. ej. Earth Search de Element84 o el catálogo STAC de Copernicus
 * Data Space). Implementa búsqueda y metadatos reales de escenas Sentinel-2 L2A.
 * El análisis NDVI requiere leer las bandas B04/B08 (COG) y procesarlas: queda para la fase 2
 * y se informa explícitamente como capacidad no disponible.
 */
@Injectable()
export class StacSatelliteProvider extends SatelliteImageryProvider {
  readonly name = 'stac-sentinel2';
  readonly simulated = false;
  readonly capabilities = {
    search: true,
    download: true,
    vegetationAnalysis: false,
    changeAnalysis: false,
  };

  constructor(private readonly config: AppConfig) {
    super();
  }

  async searchImages(query: SceneSearchQuery): Promise<SatelliteScene[]> {
    const body = {
      collections: [COLLECTION],
      intersects: query.aoi,
      datetime: `${query.from.toISOString()}/${query.to.toISOString()}`,
      limit: query.limit,
      query: { 'eo:cloud_cover': { lte: query.maxCloudCoverPct } },
      sortby: [{ field: 'properties.datetime', direction: 'desc' }],
    };
    const result = await this.request<{ features: StacItem[] }>('/search', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });
    return result.features.map((item) => this.toScene(item));
  }

  async getMetadata(sceneId: string): Promise<SatelliteScene | null> {
    try {
      const item = await this.request<StacItem>(
        `/collections/${COLLECTION}/items/${encodeURIComponent(sceneId)}`,
      );
      return this.toScene(item);
    } catch (error) {
      if (error instanceof ExternalServiceError && error.details?.status === 404) return null;
      throw error;
    }
  }

  async downloadImage(scene: SatelliteScene): Promise<{ bytes: Buffer; mimeType: string } | null> {
    const asset = scene.assets.thumbnail ?? scene.assets.rendered_preview;
    if (!asset) return null;
    const response = await fetch(asset.href, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return null;
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get('content-type') ?? asset.type ?? 'image/jpeg',
    };
  }

  analyzeVegetation(): Promise<VegetationAnalysis> {
    return Promise.reject(
      new CapabilityNotAvailableError(
        'El análisis NDVI sobre escenas reales requiere el pipeline raster (fase 2). Use SATELLITE_PROVIDER=mock para el MVP.',
      ),
    );
  }

  analyzeChange(): Promise<{ changedAreaPct: number }> {
    return Promise.reject(
      new CapabilityNotAvailableError(
        'La detección de cambios satelital es una capacidad de fase 2',
      ),
    );
  }

  private toScene(item: StacItem): SatelliteScene {
    return {
      sceneId: item.id,
      provider: this.name,
      collection: COLLECTION,
      acquiredAt: new Date(item.properties.datetime),
      cloudCoverPct: item.properties['eo:cloud_cover'] ?? null,
      resolutionM: item.properties.gsd ?? 10,
      footprint: item.geometry,
      bands: Object.keys(item.assets).filter((k) => /^(B\d{2}|red|nir|green|blue|scl)$/i.test(k)),
      assets: item.assets,
      simulated: false,
    };
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const base = this.config.env.STAC_API_URL.replace(/\/$/, '');
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(20_000) });
    } catch (error) {
      throw new ExternalServiceError('El catálogo STAC no está disponible', {
        reason: (error as Error).message,
      });
    }
    if (!response.ok) {
      throw new ExternalServiceError(`El catálogo STAC respondió ${response.status}`, {
        status: response.status,
      });
    }
    return (await response.json()) as T;
  }
}
