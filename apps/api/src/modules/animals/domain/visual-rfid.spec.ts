import { describe, expect, it } from 'vitest';
import { matchCrossingsToReads, reconcileVisualRfid, type RfidRead } from './visual-rfid.js';

const t0 = Date.UTC(2026, 9, 2, 10, 0, 0);
const at = (s: number) => new Date(t0 + s * 1000);
const read = (eid: string, s: number, extra: Partial<RfidRead> = {}): RfidRead => ({
  eid,
  at: at(s),
  status: 'IDENTIFIED',
  simulated: false,
  ...extra,
});

describe('matchCrossingsToReads', () => {
  it('empareja cada cruce con la caravana leída en el mismo paso, una sola vez', () => {
    const crossings = [1, 2, 3, 4].map((trackId, i) => ({ trackId, at: at(10 + i * 4) }));
    const reads = [
      read('A', 10.5),
      read('A', 11), // relectura de la misma caravana
      read('B', 13.8),
      read('C', 18.2),
      read('D', 40), // fuera de tolerancia
    ];
    const r = matchCrossingsToReads(crossings, reads);
    expect(
      r.pairs.map((p) => [p.trackId, p.eid]).sort((a, b) => Number(a[0]) - Number(b[0])),
    ).toEqual([
      [1, 'A'],
      [2, 'B'],
      [3, 'C'],
    ]);
    expect(r.unmatchedCrossings).toEqual([4]);
    expect(r.unmatchedTags).toEqual(['D']);
  });
});

describe('reconcileVisualRfid', () => {
  const passage = {
    scanId: 's1',
    observed: 3,
    crossings: [1, 2, 3].map((trackId, i) => ({ trackId, at: at(i * 5) })),
    from: at(-60),
    to: at(80),
  };

  it('con escaneo fijo y lector en el mismo paso: coincidencias individuales', () => {
    const r = reconcileVisualRfid({
      observed: 3,
      observedBasis: 'CENSUS',
      observedAt: at(0),
      reads: [read('A', 0.4), read('B', 5.2), read('X', 30, { status: 'UNKNOWN_TAG' })],
      passage,
    });
    expect(r.method).toBe('TIME_MATCH');
    expect(r.matches).toBe(2);
    expect(r.observedWithoutRfid).toBe(1);
    expect(r.rfidWithoutVisual).toBe(1);
    expect(r.real).toMatchObject({ tags: 3, identified: 2, unknown: 1 });
  });

  it('sin paso simultáneo: solo totales, sin inventar coincidencias', () => {
    const r = reconcileVisualRfid({
      observed: 40,
      observedBasis: 'LOWER_BOUND',
      observedAt: at(0),
      reads: [read('A', 9_000), read('B', 9_100)],
      passage,
    });
    expect(r.method).toBe('COUNTS_ONLY');
    expect(r.matches).toBeNull();
    expect(r.observedWithoutRfid).toBeNull();
    expect(r.totalsDifference).toBe(38);
  });

  it('las lecturas SIMULADAS se informan aparte y nunca se concilian', () => {
    const r = reconcileVisualRfid({
      observed: 3,
      observedBasis: 'CENSUS',
      observedAt: at(0),
      reads: [read('A', 0.4, { simulated: true }), read('B', 5.2, { simulated: true })],
      passage,
    });
    expect(r.method).toBe('NO_RFID');
    expect(r.matches).toBeNull();
    expect(r.simulated.tags).toBe(2);
    expect(r.real.tags).toBe(0);
    expect(r.notes[0]).toContain('SIMULADAS');
  });

  it('sin conteo visual todavía', () => {
    expect(
      reconcileVisualRfid({
        observed: null,
        observedBasis: null,
        observedAt: null,
        reads: [read('A', 0)],
        passage: null,
      }).method,
    ).toBe('NO_VISUAL');
  });
});
