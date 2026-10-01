/** Tipos GeoJSON (RFC 7946) usados en el dominio. Coordenadas [longitud, latitud], WGS84. */
export type Position = [number, number];

export interface GeoPoint {
  type: 'Point';
  coordinates: Position;
}

export interface GeoPolygon {
  type: 'Polygon';
  coordinates: Position[][];
}

export interface GeoMultiPolygon {
  type: 'MultiPolygon';
  coordinates: Position[][][];
}

export function point(longitude: number, latitude: number): GeoPoint {
  return { type: 'Point', coordinates: [longitude, latitude] };
}

export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

/** Distancia geodésica aproximada (haversine) en metros. */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6_371_008.8;
  const [lon1, lat1] = a.coordinates.map((v) => (v * Math.PI) / 180) as Position;
  const [lon2, lat2] = b.coordinates.map((v) => (v * Math.PI) / 180) as Position;
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
