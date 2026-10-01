import { ValidationFailedError } from '../domain/errors.js';
import { toMultiPolygon } from './geo-validation.js';
import { distanceMeters, point } from './geojson.js';

const ring = [
  [-59.2, -36.8],
  [-59.1, -36.8],
  [-59.1, -36.7],
  [-59.2, -36.7],
  [-59.2, -36.8],
];

describe('Geometrías', () => {
  it('normaliza Polygon a MultiPolygon', () => {
    expect(toMultiPolygon({ type: 'Polygon', coordinates: [ring] })).toEqual({
      type: 'MultiPolygon',
      coordinates: [[ring]],
    });
  });

  it('rechaza anillos abiertos, coordenadas fuera de rango y tipos no admitidos', () => {
    expect(() => toMultiPolygon({ type: 'Polygon', coordinates: [ring.slice(0, 4)] })).toThrow(
      ValidationFailedError,
    );
    expect(() =>
      toMultiPolygon({
        type: 'Polygon',
        coordinates: [
          [
            [-200, 0],
            [0, 0],
            [0, 1],
            [-200, 0],
          ],
        ],
      }),
    ).toThrow(ValidationFailedError);
    expect(() => toMultiPolygon({ type: 'LineString', coordinates: [] })).toThrow(
      ValidationFailedError,
    );
  });

  it('calcula distancias geodésicas', () => {
    expect(distanceMeters(point(-59.153, -36.7905), point(-59.153, -36.7815))).toBeCloseTo(
      1000,
      -1,
    );
  });
});
