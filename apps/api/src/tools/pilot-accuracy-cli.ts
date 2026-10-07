import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { DataSource } from 'typeorm';
import { loadAppConfig } from '../config/app-config.js';
import { typeOrmOptions } from '../database/typeorm-options.js';
import { accuracyReport, parseFieldCsv, reportMarkdown, type FieldRow } from './pilot-accuracy.js';

/**
 * Informe de precisión del piloto:
 *   node dist/tools/pilot-accuracy-cli.js planilla.csv > informe-precision.md
 * Para cada fila con scan_id toma el conteo OFICIAL del servidor (y el preliminar del celular);
 * si no hay scan_id usa la columna conteo_app.
 */
async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Uso: pilot-accuracy-cli.js <planilla.csv>');
  const rows = parseFieldCsv(await readFile(file, 'utf8'));
  const ids = rows.map((r) => r.scanId).filter((x): x is string => Boolean(x));
  const scans = new Map<
    string,
    { official: number | null; preliminary: number | null; mode: string }
  >();
  if (ids.length) {
    const ds = new DataSource({ ...typeOrmOptions(loadAppConfig().env), logging: ['error'] });
    await ds.initialize();
    try {
      const found = (await ds.query(
        `SELECT id, mode, official_count AS official,
                COALESCE((client_result->>'observed')::int, (client_result->>'netCount')::int) AS preliminary
           FROM scan_sessions WHERE id = ANY($1::uuid[])`,
        [ids],
      )) as { id: string; mode: string; official: number | null; preliminary: number | null }[];
      for (const s of found) scans.set(s.id, s);
    } finally {
      await ds.destroy();
    }
  }
  const field: FieldRow[] = rows.map((r) => {
    const scan = r.scanId ? scans.get(r.scanId) : undefined;
    return {
      label: r.label,
      mode: scan?.mode ?? r.mode,
      manual: r.manual,
      app: scan ? scan.official : r.app,
      preliminary: scan?.preliminary ?? null,
    };
  });
  process.stdout.write(
    `# Precisión del conteo: piloto\n\n${reportMarkdown(accuracyReport(field))}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
