import { describe, expect, it } from 'vitest';
import { assessScanQuality, type QualityInput } from './scan.types.js';

const base: QualityInput = {
  mode: 'FIXED',
  durationS: 30,
  frames: 180,
  sampledFps: 6,
  official: {
    netCount: 12,
    confirmedTracks: 12,
    blurryFrames: 3,
    negativeCrossings: 0,
    positiveCrossings: 12,
  },
  maxDisplacementM: null,
  sweptDegrees: null,
};

describe('assessScanQuality', () => {
  it('es completo con suficientes cuadros nítidos y animales seguidos', () => {
    expect(assessScanQuality(base)).toEqual({ quality: 'COMPLETE', reasons: [] });
  });

  it('es insuficiente si no se siguió ningún bovino', () => {
    const r = assessScanQuality({
      ...base,
      official: { ...base.official, confirmedTracks: 0, netCount: 0 },
    });
    expect(r.quality).toBe('INSUFFICIENT');
  });

  it('es limitado con desenfoque, desplazamiento del operador o revisitas en barrido', () => {
    expect(
      assessScanQuality({ ...base, official: { ...base.official, blurryFrames: 90 } }).quality,
    ).toBe('LIMITED');
    const sweep = assessScanQuality({
      ...base,
      mode: 'SWEEP',
      maxDisplacementM: 40,
      sweptDegrees: 90,
      official: { ...base.official, negativeCrossings: 2, positiveCrossings: 14 },
    });
    expect(sweep.quality).toBe('LIMITED');
    expect(sweep.reasons).toHaveLength(2);
  });
});
