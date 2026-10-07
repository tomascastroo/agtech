import { describe, expect, it } from 'vitest';
import { accuracyReport, parseFieldCsv, reportMarkdown } from './pilot-accuracy.js';

describe('precisión del piloto', () => {
  it('calcula error medio, sesgo y porcentaje dentro de tolerancia por modo', () => {
    const r = accuracyReport([
      { label: 'A', mode: 'FIXED', manual: 100, app: 98 },
      { label: 'B', mode: 'FIXED', manual: 200, app: 200 },
      { label: 'C', mode: 'PEN', manual: 50, app: 45 },
      { label: 'D', mode: 'PEN', manual: 40, app: null },
    ]);
    const fixed = r.byMode.find((m) => m.mode === 'FIXED')!;
    expect(fixed).toMatchObject({
      tests: 2,
      meanAbsError: 1,
      meanAbsErrorPct: 1,
      biasPct: -1,
      within2Pct: 100,
    });
    const pen = r.byMode.find((m) => m.mode === 'PEN')!;
    expect(pen).toMatchObject({ tests: 1, biasPct: -10, within5Pct: 0, worstPct: 10 });
    expect(r.overall.tests).toBe(3);
    expect(r.skipped).toEqual([{ label: 'D', reason: 'sin conteo de la app' }]);
    expect(reportMarkdown(r)).toContain('| FIXED | 2 |');
  });

  it('lee la planilla con coma o punto y coma y números con separador de miles', () => {
    const rows = parseFieldCsv(
      'prueba;modo;conteo_manual;scan_id;conteo_app\nCorral 1;pen;1.050;;1.020\nManga;fixed;98;abc;',
    );
    expect(rows).toEqual([
      { label: 'Corral 1', mode: 'PEN', manual: 1050, scanId: null, app: 1020 },
      { label: 'Manga', mode: 'FIXED', manual: 98, scanId: 'abc', app: null },
    ]);
    expect(() => parseFieldCsv('prueba,modo\nx,y')).toThrow('conteo_manual');
  });
});
