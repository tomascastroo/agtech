import { describe, expect, it } from 'vitest';
import { estimateShift, type Thumbnail } from './motion';
import { countPen, frameOcclusion } from './pen';
import type { Box, Shift } from './tracker';

/**
 * Mismos escenarios que apps/ai-service/tests/test_pen_count.py: el conteo preliminar del
 * celular y el oficial del servidor usan el mismo algoritmo.
 */
const SIZE = [640, 360] as const;
const WORLD = Array.from({ length: 10 }, (_, i) => [50 + 140 * i, 100 + (i % 3) * 60] as const);

function herd(world: readonly (readonly [number, number])[], cameraX: number): Box[] {
  return world
    .map(([x, y]) => [x - cameraX, y] as const)
    .filter(([sx]) => sx >= 0 && sx + 60 <= SIZE[0])
    .map(([sx, y]) => [sx, y, sx + 60, y + 40, 0.9] as const);
}

function pan(positions: number[]) {
  const frames: Box[][] = [];
  const shifts: Shift[] = [];
  let prev = positions[0]!;
  for (const pos of positions) {
    frames.push(herd(WORLD, pos));
    shifts.push([prev - pos, 0]);
    prev = pos;
  }
  return { frames, shifts };
}

const range = (from: number, to: number, step: number) => {
  const out: number[] = [];
  for (let v = from; step > 0 ? v < to : v > to; v += step) out.push(v);
  return out;
};

describe('countPen (escáner de corral, preliminar)', () => {
  it('grupo quieto en una vista: cada animal una vez', () => {
    const frames = Array.from({ length: 12 }, () => herd(WORLD.slice(0, 4), 0));
    const r = countPen(frames, SIZE);
    expect(r.observed).toBe(4);
    expect(r.mergedTracks).toBe(0);
    expect(r.coverageViews).toBe(1);
  });

  it('recorrer un grupo más ancho que el cuadro cuenta a todos una vez', () => {
    const { frames, shifts } = pan(range(0, 800, 16));
    const r = countPen(frames, SIZE, shifts);
    expect(r.observed).toBe(10);
    expect(r.coverageViews).toBeGreaterThan(2.1);
    expect(r.coverageViews).toBeLessThan(2.4);
  });

  it('volver sobre una zona ya vista no duplica', () => {
    const { frames, shifts } = pan([
      ...range(0, 800, 16),
      ...range(800, 200, -16),
      ...range(200, 800, 16),
    ]);
    expect(countPen(frames, SIZE, shifts).observed).toBe(10);
  });

  it('un animal tapado que reaparece en el mismo lugar se une', () => {
    const frames = Array.from({ length: 30 }, (_, i) =>
      herd(WORLD.slice(0, 3), 0).filter((b) => !(i >= 8 && i < 23 && b[0] <= 100)),
    );
    const r = countPen(frames, SIZE);
    expect(r.tracksCounted).toBe(4);
    expect(r.mergedTracks).toBe(1);
    expect(r.observed).toBe(3);
  });

  it('dos animales vistos a la vez nunca se unen', () => {
    const frames = Array.from({ length: 10 }, () => [
      [100, 100, 160, 140, 0.9] as const,
      [120, 100, 180, 140, 0.85] as const,
    ]);
    expect(countPen(frames, SIZE).observed).toBe(2);
    expect(frameOcclusion(frames[0]!, 0.4)).toEqual([2, 2]);
  });

  it('una detección espuria de un cuadro no cuenta', () => {
    const frames = Array.from({ length: 10 }, (_, i) =>
      i === 4
        ? [...herd(WORLD.slice(0, 2), 0), [400, 50, 460, 90, 0.95] as const]
        : herd(WORLD.slice(0, 2), 0),
    );
    expect(countPen(frames, SIZE).observed).toBe(2);
  });
});

describe('estimateShift (movimiento de cámara en el celular)', () => {
  function texture(width: number, height: number, seed: number): Uint8Array {
    let s = seed;
    const out = new Uint8Array(width * height);
    for (let i = 0; i < out.length; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      out[i] = s & 0xff;
    }
    // Suavizado horizontal para que no sea ruido puro.
    for (let i = 1; i < out.length; i++) out[i] = (out[i]! + out[i - 1]!) >> 1;
    return out;
  }
  const crop = (pano: Uint8Array, panoW: number, x0: number, w: number, h: number): Thumbnail => {
    const gray = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) gray[y * w + x] = pano[y * panoW + x0 + x]!;
    return { gray, width: w, height: h };
  };

  it('recupera el paneo de la cámara', () => {
    const pano = texture(200, 54, 7);
    const shift = estimateShift(crop(pano, 200, 20, 96, 54), crop(pano, 200, 29, 96, 54));
    expect(shift).not.toBeNull();
    // La cámara giró a la derecha 9 px: el contenido se corre −9 px.
    expect(Math.abs(shift![0] + 9)).toBeLessThan(0.6);
    expect(shift![1]).toBe(0);
  });

  it('sin textura no estima', () => {
    const flat = { gray: new Uint8Array(96 * 54).fill(120), width: 96, height: 54 };
    expect(estimateShift(flat, flat)).toBeNull();
  });
});
