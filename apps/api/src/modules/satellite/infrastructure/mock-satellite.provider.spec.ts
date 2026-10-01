import type { ObjectStorage } from '../../storage/object-storage.js';
import { MockSatelliteProvider } from './mock-satellite.provider.js';

const storage = { objectExists: async () => false } as unknown as ObjectStorage;
const aoi = {
  type: 'MultiPolygon' as const,
  coordinates: [
    [
      [
        [-68.93, -33.08],
        [-68.91, -33.08],
        [-68.91, -33.07],
        [-68.93, -33.07],
        [-68.93, -33.08],
      ],
    ],
  ] as [number, number][][][],
};

describe('MockSatelliteProvider', () => {
  const provider = new MockSatelliteProvider(storage);

  it('genera escenas con cadencia de 5 días, determinísticas y marcadas como simuladas', async () => {
    const query = {
      aoi,
      from: new Date('2026-09-01'),
      to: new Date('2026-10-01'),
      maxCloudCoverPct: 100,
      limit: 10,
    };
    const first = await provider.searchImages(query);
    const second = await provider.searchImages(query);
    expect(first).toEqual(second);
    expect(first.length).toBe(6);
    expect(first.every((s) => s.simulated && s.sceneId.includes('SIMULADO'))).toBe(true);
    const gaps = first
      .slice(1)
      .map((s, i) => (first[i]!.acquiredAt.getTime() - s.acquiredAt.getTime()) / 86_400_000);
    expect(new Set(gaps)).toEqual(new Set([5]));
  });

  it('continúa la serie de la línea base con variaciones acotadas', async () => {
    const [scene] = await provider.searchImages({
      aoi,
      from: new Date('2026-09-01'),
      to: new Date('2026-10-01'),
      maxCloudCoverPct: 100,
      limit: 1,
    });
    const result = await provider.analyzeVegetation(scene!, aoi, {
      assetId: 'a',
      declaredAreaHa: 120,
      baseline: { ndviMean: 0.63, vegetatedAreaHa: 106.8 },
    });
    expect(Math.abs(result.vegetatedAreaHa - 106.8)).toBeLessThan(0.6);
    expect(result.model.simulated).toBe(true);
  });
});
