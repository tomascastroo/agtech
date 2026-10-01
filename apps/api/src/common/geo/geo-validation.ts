import { ValidationFailedError } from '../domain/errors.js';
import {
  isValidLatitude,
  isValidLongitude,
  type GeoMultiPolygon,
  type GeoPolygon,
  type Position,
} from './geojson.js';

function assertPosition(value: unknown): asserts value is Position {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    !isValidLongitude(value[0] as number) ||
    !isValidLatitude(value[1] as number)
  ) {
    throw new ValidationFailedError('Coordenada inválida en la geometría');
  }
}

function assertRing(ring: unknown): asserts ring is Position[] {
  if (!Array.isArray(ring) || ring.length < 4) {
    throw new ValidationFailedError('Cada anillo del polígono requiere al menos 4 posiciones');
  }
  ring.forEach(assertPosition);
  const first = ring[0] as Position;
  const last = ring[ring.length - 1] as Position;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    throw new ValidationFailedError('El polígono debe estar cerrado');
  }
}

const MAX_POSITIONS = 5_000;

/** Normaliza Polygon | MultiPolygon a MultiPolygon validando estructura y límites. */
export function toMultiPolygon(geometry: unknown): GeoMultiPolygon {
  const geo = geometry as Partial<GeoPolygon | GeoMultiPolygon> | null;
  if (!geo || typeof geo !== 'object') throw new ValidationFailedError('Geometría inválida');
  let polygons: unknown[];
  if (geo.type === 'Polygon') polygons = [geo.coordinates];
  else if (geo.type === 'MultiPolygon') polygons = geo.coordinates ?? [];
  else throw new ValidationFailedError('Se esperaba un Polygon o MultiPolygon');

  if (!Array.isArray(polygons) || polygons.length === 0) {
    throw new ValidationFailedError('La geometría no contiene polígonos');
  }
  let count = 0;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || polygon.length === 0) {
      throw new ValidationFailedError('Polígono vacío');
    }
    for (const ring of polygon) {
      assertRing(ring);
      count += ring.length;
    }
  }
  if (count > MAX_POSITIONS) throw new ValidationFailedError('La geometría es demasiado compleja');
  return { type: 'MultiPolygon', coordinates: polygons as Position[][][] };
}
