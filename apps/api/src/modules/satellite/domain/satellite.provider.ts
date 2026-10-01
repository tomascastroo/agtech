import type { GeoMultiPolygon, GeoPolygon } from '../../../common/geo/geojson.js';
import { DomainError } from '../../../common/domain/errors.js';
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
  platform?: string;
  tile?: string;
  catalog?: string;
  processingBaseline?: string | null;
}

/** La escena no cubre el polígono (fuera del tile o de la franja adquirida por la órbita). */
export class SceneOutsideAreaError extends DomainError {
  readonly code = 'SCENE_OUTSIDE_AREA';
  constructor(sceneId: string) {
    super('La escena no cubre el área del activo', { sceneId });
  }
}

export interface VegetationBaseline {
  ndviMean: number;
  vegetatedAreaHa: number;
}

export interface VegetationAnalysis {
  /** null si no hay píxeles válidos (lote cubierto por nubes). */
  ndviMean: number | null;
  ndviStd: number | null;
  /** Superficie con vegetación activa estimada sobre el polígono (ha). */
  vegetatedAreaHa: number | null;
  analyzedAreaHa: number;
  /** Nubosidad sobre el polígono (no la de la escena completa). */
  cloudCoverPct: number;
  confidence: number;
  preview: { bytes: Buffer; mimeType: string } | null;
  model: ModelRef;
  ndviMedian?: number | null;
  ndviMin?: number | null;
  ndviMax?: number | null;
  ndviP10?: number | null;
  ndviP90?: number | null;
  vegetationPct?: number | null;
  vegetatedAreaObservedHa?: number | null;
  /** Fracción del polígono con píxeles válidos (sin nubes ni nodata). */
  validFraction?: number;
  /** false si la observación no alcanza la calidad mínima (nubes, cobertura). */
  usable?: boolean;
  quality?: 'GOOD' | 'ACCEPTABLE' | 'LOW_CONFIDENCE';
  issues?: string[];
  sceneCloudCoverPct?: number | null;
  vegetationThreshold?: number;
  bands?: string[];
  processingVersion?: string;
  processingMs?: number;
  /** Color verdadero recortado al lote (evidencia visual complementaria). */
  visualPreview?: { bytes: Buffer; mimeType: string } | null;
}

export interface ProviderCapabilities {
  search: boolean;
  download: boolean;
  vegetationAnalysis: boolean;
  changeAnalysis: boolean;
}

/**
 * Puerto de imágenes satelitales. Implementaciones: Sentinel-2 L2A real (catálogo STAC y COG de
 * AWS Open Data, NDVI con máscara de nubes calculado en el servicio de visión) y simulada para
 * desarrollo sin conexión.
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
    context: {
      assetId: string;
      declaredAreaHa: number;
      baseline: VegetationBaseline | null;
      /** Umbral de NDVI para vegetación activa según el tipo de activo. */
      vegetationThreshold?: number;
    },
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
