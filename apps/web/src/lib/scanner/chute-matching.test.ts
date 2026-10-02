import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  applySessionRules,
  matchChuteCapture,
  normalizeEid,
  type ChuteFrame,
  type ChuteMatchInput,
  type ChuteRead,
} from './chute-matching';

/** Fixture compartido con la API: el preliminar del celular decide igual que el servidor. */
const FIXTURE = resolve(process.cwd(), '../api/test/fixtures/chute-matching.json');

const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
  frameSize: ChuteMatchInput['frameSize'];
  zone: ChuteMatchInput['zone'];
  scenarios: Record<
    string,
    { reads: ChuteRead[]; frames: ChuteFrame[]; expected: { status: string; reason: string } }
  >;
};

describe('Manga + RFID en el celular (paridad con el servidor)', () => {
  for (const [name, s] of Object.entries(fixture.scenarios)) {
    it(`${name} → ${s.expected.status} (${s.expected.reason})`, () => {
      const d = matchChuteCapture({
        frameSize: fixture.frameSize,
        zone: fixture.zone,
        reads: s.reads,
        frames: s.frames,
      });
      expect([d.status, d.reason]).toEqual([s.expected.status, s.expected.reason]);
    });
  }

  it('reglas entre capturas: dos lecturas superpuestas no se asocian', () => {
    const s = fixture.scenarios.un_bovino_un_rfid!;
    const d = matchChuteCapture({ ...fixture, reads: s.reads, frames: s.frames });
    const out = applySessionRules([
      { id: 'a', sequence: 1, readAtMs: 2000, eid: d.eid, clientTrackId: 1, decision: d },
      {
        id: 'b',
        sequence: 2,
        readAtMs: 2500,
        eid: '032000000000009',
        clientTrackId: 2,
        decision: { ...d, eid: '032000000000009' },
      },
    ]);
    expect(out.get('a')!.status).toBe('AMBIGUOUS');
    expect(out.get('b')!.reason).toBe('OVERLAPPING_CAPTURES');
  });

  it('normaliza el EID como el servidor', () => {
    expect(normalizeEid('032 0000 0000 0001')).toBe('032000000000001');
    expect(normalizeEid('9X?')).toBeNull();
  });
});
