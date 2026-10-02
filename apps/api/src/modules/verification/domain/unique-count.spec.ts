import { estimateUniqueAnimals, type CountedImage } from './unique-count.js';

const at = (min: number) => new Date(Date.UTC(2026, 9, 1, 14, min));
const img = (id: string, count: number, extra: Partial<CountedImage> = {}): CountedImage => ({
  evidenceId: id,
  count,
  deviceId: null,
  capturedAt: at(0),
  location: null,
  accuracyM: null,
  dhash: null,
  ...extra,
});

describe('Animales únicos entre varias imágenes', () => {
  it('dos fotos del mismo rodeo sin ubicación: 14 + 14 → 14 y posible duplicación', () => {
    const r = estimateUniqueAnimals([img('a', 14), img('b', 14)]);
    expect(r.detectionsSum).toBe(28);
    expect(r.uniqueEstimate).toBe(14);
    expect(r.possibleOverlap).toBe(true);
  });

  it('cámaras fijas distintas cubren zonas distintas: se suman', () => {
    const r = estimateUniqueAnimals([
      img('a', 250, { deviceId: 'cam-1' }),
      img('b', 247, { deviceId: 'cam-2' }),
      img('c', 10, { deviceId: 'cam-2', capturedAt: at(5) }),
    ]);
    expect(r.uniqueEstimate).toBe(250 + 247);
    expect(r.possibleOverlap).toBe(true); // dos tomas de la misma cámara
  });

  it('GPS a más de 300 m en pocos minutos: animales distintos', () => {
    const r = estimateUniqueAnimals([
      img('a', 30, { location: { latitude: -36.79, longitude: -59.15 }, accuracyM: 10 }),
      img('b', 20, {
        location: { latitude: -36.8, longitude: -59.15 },
        accuracyM: 10,
        capturedAt: at(8),
      }),
    ]);
    expect(r.uniqueEstimate).toBe(50);
    expect(r.possibleOverlap).toBe(false);
  });

  it('GPS cercano o tomas muy separadas en el tiempo: conservador', () => {
    const near = estimateUniqueAnimals([
      img('a', 30, { location: { latitude: -36.79, longitude: -59.15 } }),
      img('b', 25, { location: { latitude: -36.7902, longitude: -59.15 } }),
    ]);
    expect(near.uniqueEstimate).toBe(30);
    const later = estimateUniqueAnimals([
      img('a', 30, { location: { latitude: -36.79, longitude: -59.15 } }),
      img('b', 25, { location: { latitude: -36.8, longitude: -59.15 }, capturedAt: at(50) }),
    ]);
    expect(later.uniqueEstimate).toBe(30);
  });

  it('feedlot: corrales escaneados a 60 m se suman; con la regla general (300 m), no', () => {
    const pen = (id: string, count: number, latitude: number, extra: Partial<CountedImage> = {}) =>
      img(id, count, {
        location: { latitude, longitude: -59.153 },
        accuracyM: 5,
        ...extra,
      });
    // ~60 m de separación en latitud.
    const corral1 = pen('c1', 120, -36.79, { distinctMinDistanceM: 40 });
    const corral2 = pen('c2', 110, -36.79054, { distinctMinDistanceM: 40 });
    expect(estimateUniqueAnimals([corral1, corral2]).uniqueEstimate).toBe(230);
    // Si una de las dos capturas no es un escaneo de corral de feedlot, rige la más conservadora.
    const photo = pen('p', 110, -36.79054);
    expect(estimateUniqueAnimals([corral1, photo]).uniqueEstimate).toBe(120);
  });
});
