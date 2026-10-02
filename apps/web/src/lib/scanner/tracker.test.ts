import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ByteTracker, countScan, type Box, type LineSpec, type Shift } from './tracker';

/** Fixture compartido con el ai-service: mismo algoritmo, misma verdad esperada. */
const FIXTURE = resolve(process.cwd(), '../ai-service/tests/fixtures/scanner-tracks.json');

interface Scenario {
  frame_size: [number, number];
  line: LineSpec;
  frames: Box[][];
  shifts: Shift[] | null;
  expected: { net_count: number; positive?: number; negative?: number };
}

const scenarios = (
  JSON.parse(readFileSync(FIXTURE, 'utf8')) as { scenarios: Record<string, Scenario> }
).scenarios;

describe('tracker del escáner (paridad con el ai-service)', () => {
  it.each(Object.keys(scenarios).sort())('%s coincide con la verdad del escenario', (name) => {
    const s = scenarios[name]!;
    const result = countScan(s.frames, s.frame_size, s.line, s.shifts);
    expect(result.netCount).toBe(s.expected.net_count);
    if (s.expected.positive !== undefined) {
      expect(result.positiveCrossings).toBe(s.expected.positive);
      expect(result.negativeCrossings).toBe(s.expected.negative);
    }
  });

  it('no cuenta cruces de tracks que nunca se confirman', () => {
    const tracker = new ByteTracker(
      [100, 100],
      {},
      { orientation: 'vertical', position: 0.5, hysteresis: 0 },
    );
    tracker.update(0, [[40, 40, 48, 48, 0.9]]);
    for (let f = 1; f < 15; f++) tracker.update(f, []);
    expect(tracker.events).toEqual([]);
  });

  it('las detecciones de baja confianza no abren tracks', () => {
    const frames: Box[][] = Array.from({ length: 12 }, (_, i) => [
      [10 + 8 * i, 40, 30 + 8 * i, 60, 0.25],
    ]);
    expect(countScan(frames, [100, 100]).confirmedTracks).toBe(0);
  });
});
