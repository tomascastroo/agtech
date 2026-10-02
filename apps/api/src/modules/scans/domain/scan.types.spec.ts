import { describe, expect, it } from 'vitest';
import { assessScanQuality, type QualityInput, type ScanQualityMetrics } from './scan.types.js';

const cleanMetrics: ScanQualityMetrics = {
  frames: 180,
  blurryRatio: 0.02,
  underexposedRatio: 0,
  overexposedRatio: 0,
  fastMotionRatio: 0,
  occlusionRatio: 0.05,
  smallAnimalRatio: 0.1,
  coverageViews: null,
  edgeAnimals: null,
  registeredPhotos: null,
};

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
  metrics: cleanMetrics,
  maxDisplacementM: null,
  sweptDegrees: null,
};

const pen = (metrics: Partial<ScanQualityMetrics>, observed = 18): QualityInput => ({
  ...base,
  mode: 'PEN',
  official: { ...base.official, netCount: 0, positiveCrossings: 0, observed },
  metrics: { ...cleanMetrics, coverageViews: 2.5, edgeAnimals: 0, ...metrics },
});

const codes = (input: QualityInput) => assessScanQuality(input).guidance.map((g) => g.code);

describe('assessScanQuality', () => {
  it('es VALIDADO con suficientes cuadros nítidos y animales seguidos', () => {
    expect(assessScanQuality(base)).toEqual({
      quality: 'COMPLETE',
      evidenceStatus: 'VALIDATED',
      reasons: [],
      guidance: [],
    });
  });

  it('es EVIDENCIA INSUFICIENTE si no se siguió ningún bovino o fue demasiado corto', () => {
    const none = assessScanQuality({
      ...base,
      official: { ...base.official, confirmedTracks: 0, netCount: 0 },
    });
    expect(none.evidenceStatus).toBe('INSUFFICIENT');
    expect(none.guidance.map((g) => g.code)).toContain('POINT_AT_HERD');
    const short = assessScanQuality({ ...pen({}), durationS: 3, frames: 18 });
    expect(short.evidenceStatus).toBe('INSUFFICIENT');
    expect(short.reasons[0]).toContain('mínimo 5 s');
    expect(codes({ ...pen({}), durationS: 3, frames: 18 })).toContain('SCAN_LONGER');
  });

  it('un problema parcial deja la evidencia NO CONCLUYENTE (nunca la rechaza)', () => {
    const blurry = assessScanQuality({ ...base, metrics: { ...cleanMetrics, blurryRatio: 0.4 } });
    expect(blurry.evidenceStatus).toBe('INCONCLUSIVE');
    expect(blurry.guidance.map((g) => g.code)).toEqual(['HOLD_STILL']);
    // La mayoría de los cuadros inutilizables: insuficiente.
    expect(
      assessScanQuality({ ...base, metrics: { ...cleanMetrics, blurryRatio: 0.7 } }).evidenceStatus,
    ).toBe('INSUFFICIENT');
  });

  it('da instrucciones concretas para cada problema medido', () => {
    expect(codes(pen({ fastMotionRatio: 0.3 }))).toContain('MOVE_SLOWER');
    expect(codes(pen({ smallAnimalRatio: 0.7 }))).toContain('GET_CLOSER');
    expect(codes(pen({ occlusionRatio: 0.5 }))).toContain('TOO_MANY_HIDDEN');
    expect(codes(pen({ edgeAnimals: 3 }))).toContain('COVER_MORE');
    expect(codes(pen({ underexposedRatio: 0.4 }))).toContain('MORE_LIGHT');
    expect(codes(pen({ overexposedRatio: 0.4 }))).toContain('AVOID_GLARE');
    expect(codes({ ...base, metrics: { ...cleanMetrics, fastMotionRatio: 0.3 } })).toContain(
      'HOLD_STILL',
    );
  });

  it('el umbral de oclusión depende del tipo de producción (feedlot tolera más)', () => {
    const input = pen({ occlusionRatio: 0.45 });
    expect(assessScanQuality(input).evidenceStatus).toBe('INCONCLUSIVE');
    expect(
      assessScanQuality({ ...input, thresholds: { occlusionLimit: 0.5 } }).evidenceStatus,
    ).toBe('VALIDATED');
  });

  it('corral sin animales observados es insuficiente', () => {
    expect(assessScanQuality(pen({}, 0)).evidenceStatus).toBe('INSUFFICIENT');
  });

  it('escáner fijo con cruces de ida y vuelta sugiere el escáner de corral', () => {
    const r = assessScanQuality({
      ...base,
      official: { ...base.official, positiveCrossings: 3, negativeCrossings: 6, netCount: 3 },
    });
    expect(r.evidenceStatus).toBe('INCONCLUSIVE');
    expect(r.guidance.map((g) => g.code)).toContain('USE_PEN_MODE');
  });

  it('fotos que no se solapan: no concluyente y pide fotos seguidas', () => {
    const photo: QualityInput = {
      ...base,
      mode: 'PHOTO',
      frames: 3,
      durationS: 0,
      sampledFps: 0,
      official: { ...base.official, observed: 9 },
      metrics: { ...cleanMetrics, frames: 3, registeredPhotos: 0, edgeAnimals: 0 },
    };
    const r = assessScanQuality(photo);
    expect(r.evidenceStatus).toBe('INCONCLUSIVE');
    expect(r.guidance.map((g) => g.code)).toEqual(['OVERLAP_PHOTOS']);
    // Una sola foto: no hay requisito de duración.
    expect(
      assessScanQuality({ ...photo, frames: 1, metrics: { ...photo.metrics!, frames: 1 } })
        .evidenceStatus,
    ).toBe('VALIDATED');
  });

  it('barrido: desplazamiento del operador y arco corto', () => {
    const sweep = assessScanQuality({
      ...base,
      mode: 'SWEEP',
      maxDisplacementM: 40,
      sweptDegrees: 10,
      official: { ...base.official, negativeCrossings: 2, positiveCrossings: 14 },
    });
    expect(sweep.quality).toBe('LIMITED');
    expect(sweep.guidance.map((g) => g.code)).toEqual(['STAY_IN_PLACE', 'COVER_MORE']);
  });

  it('escaneos procesados antes de las métricas siguen calificándose', () => {
    expect(
      assessScanQuality({
        ...base,
        metrics: null,
        official: { ...base.official, blurryFrames: 90 },
      }).quality,
    ).toBe('LIMITED');
  });
});
