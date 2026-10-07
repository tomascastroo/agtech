/**
 * Precisión del conteo en el piloto con hacienda real: compara el conteo manual de referencia
 * (planilla de campo) con el conteo de la app. Funciones puras; la lectura de la planilla y de
 * la base está en pilot-accuracy-cli.ts.
 */

export interface FieldRow {
  /** Identificador de la prueba en la planilla (fecha + corral, por ejemplo). */
  label: string;
  mode: string;
  /** Conteo manual de referencia (dos personas, en manga o por corral). */
  manual: number;
  /** Conteo oficial del servidor (o el de la app si no hay sesión vinculada). */
  app: number | null;
  /** Conteo preliminar del celular, si se registró. */
  preliminary?: number | null;
}

export interface ModeSummary {
  mode: string;
  tests: number;
  /** Error absoluto medio, en cabezas. */
  meanAbsError: number;
  /** Error absoluto medio en % del conteo manual. */
  meanAbsErrorPct: number;
  /** Error medio con signo, en %: negativo = la app cuenta de menos. */
  biasPct: number;
  within2Pct: number;
  within5Pct: number;
  worstPct: number;
}

export interface AccuracyReport {
  overall: ModeSummary;
  byMode: ModeSummary[];
  skipped: { label: string; reason: string }[];
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

function summarize(mode: string, rows: { manual: number; app: number }[]): ModeSummary {
  const errors = rows.map((r) => ({
    abs: Math.abs(r.app - r.manual),
    pct: ((r.app - r.manual) / r.manual) * 100,
  }));
  const n = rows.length;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    mode,
    tests: n,
    meanAbsError: round(mean(errors.map((e) => e.abs))),
    meanAbsErrorPct: round(mean(errors.map((e) => Math.abs(e.pct)))),
    biasPct: round(mean(errors.map((e) => e.pct))),
    within2Pct: n ? round((errors.filter((e) => Math.abs(e.pct) <= 2).length / n) * 100, 0) : 0,
    within5Pct: n ? round((errors.filter((e) => Math.abs(e.pct) <= 5).length / n) * 100, 0) : 0,
    worstPct: round(Math.max(0, ...errors.map((e) => Math.abs(e.pct)))),
  };
}

export function accuracyReport(rows: FieldRow[]): AccuracyReport {
  const skipped: AccuracyReport['skipped'] = [];
  const valid: (FieldRow & { app: number })[] = [];
  for (const r of rows) {
    if (!Number.isFinite(r.manual) || r.manual <= 0)
      skipped.push({ label: r.label, reason: 'sin conteo manual' });
    else if (r.app === null || !Number.isFinite(r.app))
      skipped.push({ label: r.label, reason: 'sin conteo de la app' });
    else valid.push({ ...r, app: r.app });
  }
  const modes = [...new Set(valid.map((r) => r.mode))].sort();
  return {
    overall: summarize('TODOS', valid),
    byMode: modes.map((m) =>
      summarize(
        m,
        valid.filter((r) => r.mode === m),
      ),
    ),
    skipped,
  };
}

/** Planilla CSV con encabezados: prueba, modo, conteo_manual, scan_id, conteo_app (opcional). */
export function parseFieldCsv(
  text: string,
): { label: string; mode: string; manual: number; scanId: string | null; app: number | null }[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = lines[0]!.includes(';') ? ';' : ',';
  const head = lines[0]!.split(sep).map((h) => h.trim().toLowerCase());
  const col = (name: string) => head.indexOf(name);
  for (const required of ['prueba', 'modo', 'conteo_manual'])
    if (col(required) < 0) throw new Error(`Falta la columna "${required}" en la planilla`);
  return lines.slice(1).map((line) => {
    const cells = line.split(sep).map((c) => c.trim());
    const num = (name: string) => {
      const v = col(name) >= 0 ? cells[col(name)] : '';
      return v ? Number(v.replace(/\./g, '').replace(',', '.')) : null;
    };
    return {
      label: cells[col('prueba')] ?? '',
      mode: (cells[col('modo')] ?? '').toUpperCase() || 'SIN_MODO',
      manual: num('conteo_manual') ?? NaN,
      scanId: col('scan_id') >= 0 && cells[col('scan_id')] ? cells[col('scan_id')]! : null,
      app: num('conteo_app'),
    };
  });
}

export function reportMarkdown(r: AccuracyReport): string {
  const row = (s: ModeSummary) =>
    `| ${s.mode} | ${s.tests} | ${s.meanAbsError} | ${s.meanAbsErrorPct} % | ${s.biasPct > 0 ? '+' : ''}${s.biasPct} % | ${s.within2Pct} % | ${s.within5Pct} % | ${s.worstPct} % |`;
  return [
    '| Modo | Pruebas | Error medio (cabezas) | Error medio | Sesgo | Dentro de ±2 % | Dentro de ±5 % | Peor caso |',
    '|---|---|---|---|---|---|---|---|',
    ...r.byMode.map(row),
    row(r.overall),
    '',
    'Sesgo negativo: la app cuenta de menos (animales tapados). Positivo: cuenta de más (doble conteo).',
    ...(r.skipped.length
      ? ['', 'Pruebas sin usar:', ...r.skipped.map((s) => `- ${s.label}: ${s.reason}`)]
      : []),
  ].join('\n');
}
