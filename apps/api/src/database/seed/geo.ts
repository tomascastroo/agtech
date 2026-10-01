import type { GeoMultiPolygon, GeoPoint, Position } from '../../common/geo/geojson.js';

const METERS_PER_DEGREE = 111_320;

export function offsetPoint(center: Position, eastM: number, northM: number): Position {
  const [lon, lat] = center;
  return [
    lon + eastM / (METERS_PER_DEGREE * Math.cos((lat * Math.PI) / 180)),
    lat + northM / METERS_PER_DEGREE,
  ];
}

/** Polígono aproximadamente rectangular (con leve irregularidad) de la superficie indicada. */
export function parcel(
  center: Position,
  hectares: number,
  aspect = 1.4,
  skew = 0.06,
): GeoMultiPolygon {
  const area = hectares * 10_000;
  const width = Math.sqrt(area * aspect);
  const height = area / width;
  const w = width / 2;
  const h = height / 2;
  const ring: Position[] = [
    offsetPoint(center, -w, -h),
    offsetPoint(center, w, -h * (1 - skew)),
    offsetPoint(center, w * (1 - skew), h),
    offsetPoint(center, -w, h * (1 + skew / 2)),
  ];
  ring.push(ring[0]!);
  return { type: 'MultiPolygon', coordinates: [[ring]] };
}

export const toPoint = (position: Position): GeoPoint => ({ type: 'Point', coordinates: position });
