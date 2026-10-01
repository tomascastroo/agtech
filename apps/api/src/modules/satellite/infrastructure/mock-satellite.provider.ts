import { Injectable } from '@nestjs/common';
import { sha256Hex } from '../../../common/crypto/hashing.js';
import type { GeoMultiPolygon } from '../../../common/geo/geojson.js';
import { ObjectStorage } from '../../storage/object-storage.js';
import { storageKeys } from '../../storage/storage-keys.js';
import {
  SatelliteImageryProvider,
  boundingPolygon,
  type SatelliteScene,
  type SceneSearchQuery,
  type VegetationAnalysis,
  type VegetationBaseline,
} from '../domain/satellite.provider.js';

const DAY_MS = 86_400_000;
const REVISIT_DAYS = 5;
const EPOCH = Date.UTC(2026, 0, 3, 14, 0, 49);
/** Igual criterio que el procesamiento real: con más nubes la observación no es utilizable. */
const SIMULATED_MAX_CLOUD_PCT = 20;

/** Confianza del análisis: nubosidad de escena penaliza en forma moderada (máscara SCL). */
export const sceneConfidence = (cloudCoverPct: number): number =>
  Math.round((0.92 - (cloudCoverPct / 100) * 0.3) * 1000) / 1000;

/** Pseudoaleatorio determinístico en [0, 1) derivado de una semilla textual. */
function unit(seed: string): number {
  return parseInt(sha256Hex(seed).slice(0, 8), 16) / 0x1_0000_0000;
}

/**
 * Proveedor satelital SIMULADO. Genera escenas con la cadencia de revisita de Sentinel-2
 * (5 días) y nubosidad determinística. El análisis de vegetación continúa la serie histórica
 * del activo (línea base) con variaciones pequeñas, y usa como vista previa la imagen sintética
 * de la biblioteca de señales simuladas. No representa observaciones reales.
 */
@Injectable()
export class MockSatelliteProvider extends SatelliteImageryProvider {
  readonly name = 'mock-sentinel2';
  readonly simulated = true;
  readonly capabilities = {
    search: true,
    download: true,
    vegetationAnalysis: true,
    changeAnalysis: true,
  };

  constructor(private readonly storage: ObjectStorage) {
    super();
  }

  async searchImages(query: SceneSearchQuery): Promise<SatelliteScene[]> {
    const footprint = boundingPolygon(query.aoi, 0.05);
    const areaKey = JSON.stringify(footprint.coordinates[0]![0]);
    const scenes: SatelliteScene[] = [];
    const first = Math.ceil((query.from.getTime() - EPOCH) / (REVISIT_DAYS * DAY_MS));
    const last = Math.floor((query.to.getTime() - EPOCH) / (REVISIT_DAYS * DAY_MS));
    for (let i = last; i >= first && scenes.length < query.limit; i--) {
      const acquiredAt = new Date(EPOCH + i * REVISIT_DAYS * DAY_MS);
      const cloud = Math.round(unit(`${areaKey}:${i}`) * 6000) / 100;
      if (cloud > query.maxCloudCoverPct) continue;
      scenes.push(this.scene(acquiredAt, cloud, footprint, `${areaKey}:${i}`));
    }
    return scenes;
  }

  async getMetadata(): Promise<SatelliteScene | null> {
    return null;
  }

  async downloadImage(): Promise<{ bytes: Buffer; mimeType: string } | null> {
    return null;
  }

  async analyzeVegetation(
    scene: SatelliteScene,
    _aoi: GeoMultiPolygon,
    context: {
      assetId: string;
      declaredAreaHa: number;
      baseline: VegetationBaseline | null;
      vegetationThreshold?: number;
    },
  ): Promise<VegetationAnalysis> {
    const noise = unit(`${context.assetId}:${scene.sceneId}`) - 0.5;
    const baselineArea = context.baseline?.vegetatedAreaHa ?? context.declaredAreaHa * 0.985;
    const baselineNdvi = context.baseline?.ndviMean ?? 0.72;
    const vegetatedAreaHa = Math.min(
      context.declaredAreaHa * 1.02,
      Math.round(baselineArea * (1 + noise * 0.008) * 100) / 100,
    );
    const previewKey = storageKeys.simulatedSatelliteFeed(context.assetId);
    const preview = (await this.storage.objectExists(previewKey))
      ? { bytes: await this.storage.getObject(previewKey), mimeType: 'image/jpeg' }
      : null;
    const cloud = scene.cloudCoverPct ?? 0;
    const usable = cloud <= SIMULATED_MAX_CLOUD_PCT;
    return {
      ndviMean: Math.round((baselineNdvi + noise * 0.02) * 10_000) / 10_000,
      ndviStd: 0.06,
      vegetatedAreaHa,
      vegetationPct: Math.round((vegetatedAreaHa / context.declaredAreaHa) * 10_000) / 100,
      analyzedAreaHa: context.declaredAreaHa,
      cloudCoverPct: cloud,
      sceneCloudCoverPct: cloud,
      validFraction: Math.round((1 - cloud / 100) * 10_000) / 10_000,
      usable,
      quality: usable ? 'ACCEPTABLE' : 'LOW_CONFIDENCE',
      issues: usable ? [] : ['CLOUD_COVER_ABOVE_LIMIT'],
      vegetationThreshold: context.vegetationThreshold,
      confidence: sceneConfidence(cloud),
      bands: ['B04', 'B08'],
      processingVersion: 'simulated-ndvi/1.0.0',
      preview,
      model: { code: 'simulated-ndvi-analyzer', version: '1.0.0', simulated: true },
    };
  }

  async analyzeChange(): Promise<{ changedAreaPct: number }> {
    return { changedAreaPct: 0 };
  }

  private scene(
    acquiredAt: Date,
    cloud: number,
    footprint: SatelliteScene['footprint'],
    seed: string,
  ): SatelliteScene {
    const stamp = acquiredAt.toISOString().replace(/[-:]/g, '').slice(0, 15);
    return {
      sceneId: `S2X_MSIL2A_${stamp}_SIMULADO_${sha256Hex(seed).slice(0, 8).toUpperCase()}`,
      provider: this.name,
      collection: 'sentinel-2-l2a',
      acquiredAt,
      cloudCoverPct: cloud,
      resolutionM: 10,
      footprint,
      bands: ['B02', 'B03', 'B04', 'B08', 'SCL'],
      assets: {},
      simulated: true,
    };
  }
}
