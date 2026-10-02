import { describe, expect, it } from 'vitest';
import { liveGuidance, type LiveWindow } from './guidance';

const calm: LiveWindow = {
  frameWidth: 640,
  frameHeight: 480,
  shifts: [2, -1, 1, 0],
  detectionsPerSecond: 4,
  brightness: 120,
  boxHeights: [120, 110, 130],
  overlapped: 0,
  strongBoxes: 6,
  edgeBoxes: 0,
  turnRate: 0,
  gpsDisplacementM: 0,
  elapsedS: 10,
};

describe('liveGuidance (instrucciones en vivo)', () => {
  it('sin problemas no molesta', () => {
    expect(liveGuidance('PEN', calm)).toEqual([]);
  });

  it('pide moverse más lento o quedarse quieto según el modo', () => {
    const fast = { ...calm, shifts: [120, 110, 130] };
    expect(liveGuidance('PEN', fast)).toContain('MOVE_SLOWER');
    expect(liveGuidance('FIXED', { ...calm, shifts: [30, 25, 28] })).toEqual(['HOLD_STILL']);
  });

  it('acercarse, oclusión y luz', () => {
    expect(liveGuidance('PEN', { ...calm, boxHeights: [20, 25, 30] })).toContain('GET_CLOSER');
    expect(liveGuidance('PEN', { ...calm, overlapped: 4, strongBoxes: 6 })).toContain(
      'TOO_MANY_HIDDEN',
    );
    expect(liveGuidance('SWEEP', { ...calm, brightness: 20 })).toContain('MORE_LIGHT');
    expect(liveGuidance('SWEEP', { ...calm, brightness: 240 })).toContain('AVOID_GLARE');
  });

  it('"falta cubrir otra zona" solo con la cámara quieta y animales en el borde', () => {
    expect(liveGuidance('PEN', { ...calm, edgeBoxes: 3 })).toEqual(['COVER_MORE']);
    expect(liveGuidance('PEN', { ...calm, edgeBoxes: 3, shifts: [40, 45, 38] })).not.toContain(
      'COVER_MORE',
    );
  });
});
