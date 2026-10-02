import { describe, expect, it } from 'vitest';
import { detectLivestockChanges, type LivestockHistoryRow } from './livestock-history.js';

const row = (n: number, extra: Partial<LivestockHistoryRow> = {}): LivestockHistoryRow => ({
  runId: `run-${n}`,
  date: new Date(Date.UTC(2026, 8, n)),
  declared: 100,
  observed: 100,
  basis: 'CENSUS',
  rfidIdentified: null,
  rfidSimulated: 0,
  coverage: 1,
  status: 'VERIFIED',
  ...extra,
});

const codes = (rows: LivestockHistoryRow[]) =>
  detectLivestockChanges(rows).map((c) => [c.code, c.severity]);

describe('detectLivestockChanges', () => {
  it('sin cambios relevantes no informa nada', () => {
    expect(codes([row(1), row(2, { observed: 97, coverage: 0.97 })])).toEqual([]);
  });

  it('una caída entre dos conteos en manga es un faltante a revisar', () => {
    expect(codes([row(1), row(2, { observed: 85, coverage: 0.85 })])).toEqual([
      ['CENSUS_DROP', 'WARNING'],
    ]);
    expect(codes([row(1), row(2, { observed: 60, coverage: 0.6 })])).toEqual([
      ['CENSUS_DROP', 'CRITICAL'],
      ['COVERAGE_DROP', 'INFO'],
    ]);
  });

  it('una caída con cota inferior NO se trata como faltante', () => {
    const changes = detectLivestockChanges([
      row(1),
      row(2, { observed: 40, basis: 'LOWER_BOUND', coverage: 0.4, status: 'INCONCLUSIVE' }),
    ]);
    expect(changes.map((c) => [c.code, c.severity])).toEqual([
      ['OBSERVED_LOWER', 'INFO'],
      ['COVERAGE_DROP', 'INFO'],
      ['STATUS_WORSENED', 'WARNING'],
    ]);
    expect(changes[0]!.message).toContain('no prueba un faltante');
  });

  it('cambios de declarado, RFID y estado', () => {
    expect(
      codes([
        row(1, { rfidIdentified: 80 }),
        row(2, { declared: 120, rfidIdentified: 60, status: 'REJECTED', coverage: 0.83 }),
      ]),
    ).toEqual([
      ['DECLARED_CHANGED', 'INFO'],
      ['RFID_DROP', 'WARNING'],
      ['STATUS_WORSENED', 'CRITICAL'],
    ]);
    expect(codes([row(1, { status: 'OBSERVED' }), row(2)])).toEqual([['STATUS_IMPROVED', 'INFO']]);
  });
});
