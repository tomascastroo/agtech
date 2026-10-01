import type { GeoMultiPolygon, GeoPolygon } from '../../../common/geo/geojson.js';
import type { ModelRef } from '../../computer-vision/domain/computer-vision.provider.js';

export interface SceneSearchQuery {
  aoi: GeoMultiPolygon;
  from: Date;
  to: Date;
  maxCloudCoverPct: number;
  limit: number;
}

export interface SatelliteScene {
  sceneId: string;
  provider: string;
  collection: string;
  acquiredAt: Date;
  cloudCoverPct: number | null;
  resolutionM: number;
  footprint: GeoPolygon | null;
  bands: string[];
  assets: Record<string, { href: string; type?: string }>;
  simulated: boolean;
}

export interface VegetationBaseline {
  ndviMean: number;
  vegetatedAreaHa: number;
}

export interface VegetationAnalysis {
  ndviMean: number;
  ndviStd: number;
  vegetatedAreaHa: number;
  analyzedAreaHa: number;
  cloudCoverPct: number;
  confidence: number;
  preview: { bytes: Buffer; mimeType: string } | null;
  model: ModelRef;
}

export interface ProviderCapabilities {
  search: boolean;
  download: boolean;
  vegetationAnalysis: boolean;
  changeAnalysis: boolean;
}

/**
 * Puerto de imágenes satelitales. Implementaciones: simulada (desarrollo) y STAC (búsqueda
 * real de escenas Sentinel-2). El análisis raster real (NDVI sobre COGs) es fase 2.
 */
export abstract class SatelliteImageryProvider {
  abstract readonly name: string;
  abstract readonly simulated: boolean;
  abstract readonly capabilities: ProviderCapabilities;
  abstract searchImages(query: SceneSearchQuery): Promise<SatelliteScene[]>;
  abstract getMetadata(sceneId: string): Promise<SatelliteScene | null>;
  abstract downloadImage(
    scene: SatelliteScene,
  ): Promise<{ bytes: Buffer; mimeType: string } | null>;
  abstract analyzeVegetation(
    scene: SatelliteScene,
    aoi: GeoMultiPolygon,
    context: { assetId: string; declaredAreaHa: number; baseline: VegetationBaseline | null },
  ): Promise<VegetationAnalysis>;
  abstract analyzeChange(
    before: SatelliteScene,
    after: SatelliteScene,
    aoi: GeoMultiPolygon,
  ): Promise<{ changedAreaPct: number }>;
}

export function boundingPolygon(aoi: GeoMultiPolygon, marginDeg = 0): GeoPolygon {
  const positions = aoi.coordinates.flat(2);
  const lons = positions.map((p) => p[0]);
  const lats = positions.map((p) => p[1]);
  const [minX, maxX] = [Math.min(...lons) - marginDeg, Math.max(...lons) + marginDeg];
  const [minY, maxY] = [Math.min(...lats) - marginDeg, Math.max(...lats) + marginDeg];
  return {
    type: 'Polygon',
    coordinates: [
      [
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY],
        [minX, minY],
      ],
    ],
  };
}
