import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applySessionRules,
  matchChuteCapture,
  type ChuteFrame,
  type ChuteMatchInput,
  type ChuteRead,
  type SessionCapture,
} from './chute-matching.js';

/** Fixture compartido con el celular: misma decisión en la API (oficial) y en el preliminar. */
const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../../../test/fixtures/chute-matching.json'), 'utf8'),
) as {
  frameSize: ChuteMatchInput['frameSize'];
  zone: ChuteMatchInput['zone'];
  scenarios: Record<
    string,
    {
      reads: ChuteRead[];
      frames: ChuteFrame[];
      expected: { status: string; reason: string; trackId?: number };
    }
  >;
};

const input = (name: string): ChuteMatchInput => ({
  frameSize: fixture.frameSize,
  zone: fixture.zone,
  reads: fixture.scenarios[name]!.reads,
  frames: fixture.scenarios[name]!.frames,
});

describe('Manga + RFID: asociación de una lectura con un bovino', () => {
  for (const [name, scenario] of Object.entries(fixture.scenarios)) {
    it(`${name} → ${scenario.expected.status} (${scenario.expected.reason})`, () => {
      const d = matchChuteCapture(input(name));
      expect(d.status).toBe(scenario.expected.status);
      expect(d.reason).toBe(scenario.expected.reason);
      if (scenario.expected.trackId !== undefined)
        expect(d.trackId).toBe(scenario.expected.trackId);
      if (d.status === 'CONFIRMED') {
        expect(d.eid).toMatch(/^\d{15}$/);
        expect(d.bestFrames.length).toBeGreaterThanOrEqual(1);
        expect(d.bestFrames.length).toBeLessThanOrEqual(8);
      } else {
        // Nunca se asocia ni se eligen cuadros si hay duda.
        expect(d.bestFrames).toEqual([]);
      }
    });
  }

  it('elige cuadros diversos (no casi idénticos) y no más que el máximo', () => {
    const d = matchChuteCapture(input('un_bovino_un_rfid'));
    const times = d.bestFrames.map((f) => f.capturedMs);
    for (let i = 1; i < times.length; i++)
      expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(150);
    expect(d.bestFrames.every((f) => f.box.width > 0 && f.score >= 0.5)).toBe(true);
  });
});

describe('Manga + RFID: reglas entre capturas de la sesión', () => {
  const confirmed = (eid: string, readAtMs: number) =>
    matchChuteCapture({
      ...input('un_bovino_un_rfid'),
      reads: [{ eid, atMs: readAtMs }],
      frames: fixture.scenarios['un_bovino_un_rfid']!.frames.map((f) => ({
        ...f,
        capturedMs: f.capturedMs + readAtMs - 2000,
      })),
    });
  const cap = (
    id: string,
    sequence: number,
    eid: string,
    readAtMs: number,
    clientTrackId: number | null = null,
  ): SessionCapture => ({
    id,
    sequence,
    readAtMs,
    eid,
    clientTrackId,
    decision: confirmed(eid, readAtMs),
  });

  it('dos bovinos consecutivos con dos caravanas → dos asociaciones', () => {
    const r = applySessionRules([
      cap('a', 1, '032000000000001', 2000, 3),
      cap('b', 2, '032000000000002', 12000, 7),
    ]);
    expect(r.get('a')!.status).toBe('CONFIRMED');
    expect(r.get('b')!.status).toBe('CONFIRMED');
    expect(r.get('b')!.eid).toBe('032000000000002');
  });

  it('lecturas tan cercanas que las ventanas se pisan → AMBIGUOUS las dos', () => {
    const r = applySessionRules([
      cap('a', 1, '032000000000001', 2000),
      cap('b', 2, '032000000000002', 3200),
    ]);
    expect(r.get('a')!.reason).toBe('OVERLAPPING_CAPTURES');
    expect(r.get('b')!.status).toBe('AMBIGUOUS');
  });

  it('el mismo bovino (mismo track del celular) con dos caravanas distintas → AMBIGUOUS', () => {
    const r = applySessionRules([
      cap('a', 1, '032000000000001', 2000, 5),
      cap('b', 2, '032000000000002', 15000, 5),
    ]);
    expect(r.get('a')!.reason).toBe('SAME_ANIMAL_MULTIPLE_RFID');
    expect(r.get('b')!.reason).toBe('SAME_ANIMAL_MULTIPLE_RFID');
  });

  it('la misma caravana dos veces: vale la primera', () => {
    const r = applySessionRules([
      cap('a', 1, '032000000000001', 2000, 1),
      cap('b', 2, '032000000000001', 15000, 2),
    ]);
    expect(r.get('a')!.status).toBe('CONFIRMED');
    expect(r.get('b')!.reason).toBe('RFID_ALREADY_REGISTERED');
  });

  it('las reglas de sesión nunca convierten una duda en confirmación', () => {
    const doubtful: SessionCapture = {
      id: 'x',
      sequence: 1,
      readAtMs: 2000,
      eid: '032000000000009',
      clientTrackId: null,
      decision: matchChuteCapture(input('dos_bovinos_un_rfid')),
    };
    expect(applySessionRules([doubtful]).get('x')!.status).toBe('AMBIGUOUS');
  });
});
