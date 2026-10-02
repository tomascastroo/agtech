import { describe, expect, it } from 'vitest';
import { livestockProfile } from './livestock-profile.js';

describe('livestockProfile', () => {
  it('deriva el tipo de producción del sistema productivo declarado', () => {
    expect(livestockProfile({ sistema_productivo: 'Feedlot' }).system).toBe('FEEDLOT');
    expect(livestockProfile({ sistema_productivo: 'Cría' }).system).toBe('CRIA');
    expect(livestockProfile({ sistema_productivo: 'Invernada' }).system).toBe('PASTOREO');
    expect(livestockProfile({ sistema_productivo: 'Recría' }).system).toBe('PASTOREO');
  });

  it('sin sistema reconocible usa cría y lo marca como inferido', () => {
    const profile = livestockProfile(null);
    expect(profile.system).toBe('CRIA');
    expect(profile.inferred).toBe(true);
    expect(livestockProfile({ sistema_productivo: 'Cría' }).inferred).toBe(false);
  });

  it('cada tipo recomienda métodos distintos y solo el paso por manga es censo', () => {
    const feedlot = livestockProfile({ sistema_productivo: 'Feedlot' });
    const cria = livestockProfile({ sistema_productivo: 'Cría' });
    const pastoreo = livestockProfile({ sistema_productivo: 'Invernada' });
    expect(feedlot.recommendedModes[0]).toBe('PEN');
    expect(cria.recommendedModes[0]).toBe('FIXED');
    expect(pastoreo.recommendedModes[0]).toBe('SWEEP');
    for (const p of [feedlot, cria, pastoreo]) expect(p.censusModes).toEqual(['FIXED']);
    expect(feedlot.quality.occlusionLimit).toBeGreaterThan(0.35);
    expect(pastoreo.coverageNote).toContain('no permiten afirmar el stock total');
  });
});
