import type { DataSource } from 'typeorm';

/**
 * Fuentes cruzadas de una solicitud: resume, lado a lado, lo que dice cada fuente independiente
 * (declaración, visión, RFID, GPS de las fotos, documentos, registro SENASA e historial).
 * Es informativo para la entidad: no reemplaza ni modifica el score.
 */
export type SourceState = 'CONSISTENT' | 'WARNING' | 'NO_DATA';

export interface CrossSource {
  key: 'DECLARATION' | 'VISION' | 'RFID' | 'GPS' | 'DOCUMENTS' | 'SENASA' | 'HISTORY';
  label: string;
  value: string;
  state: SourceState;
  simulated: boolean;
}

interface Input {
  organizationId: string;
  assetId: string;
  establishmentId: string;
  declaredQuantity: number | null;
  runId: string | null;
  uniqueEstimate: number | null;
  possibleOverlap: boolean;
}

const near = (a: number, b: number, tolerance = 0.1) =>
  Math.abs(a - b) / Math.max(a, b, 1) <= tolerance;

export async function crossSources(ds: DataSource, input: Input): Promise<CrossSource[]> {
  const q = (sql: string, params: unknown[]) =>
    ds.query(sql, params) as Promise<Record<string, unknown>[]>;
  const [[rfid], [photos], [geo], docs, [registry], [history]] = await Promise.all([
    q(
      `SELECT count(DISTINCT electronic_id) FILTER (WHERE status = 'IDENTIFIED')::int AS identified,
              count(DISTINCT electronic_id)::int AS tags, bool_or(source = 'SIMULATED') AS simulated
         FROM rfid_observations
        WHERE organization_id = $1 AND asset_id = $2 AND observed_at > now() - interval '30 days'`,
      [input.organizationId, input.assetId],
    ),
    q(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE device_id IS NOT NULL
                OR metadata->>'locationSource' IN ('DEVICE_GPS','EXIF'))::int AS "withCapture"
         FROM evidence WHERE organization_id = $1 AND asset_id = $2 AND type = 'IMAGE'`,
      [input.organizationId, input.assetId],
    ),
    input.runId
      ? q(
          `SELECT value::float AS value FROM verification_metrics
            WHERE verification_run_id = $1 AND key = 'location_verified'`,
          [input.runId],
        )
      : Promise.resolve([]),
    q(
      `SELECT d.type, a.status, a.validation_results AS results
         FROM documents d LEFT JOIN document_analyses a ON a.document_id = d.id
        WHERE d.organization_id = $1 AND d.status <> 'REJECTED'
          AND (d.asset_id = $2 OR (d.asset_id IS NULL AND d.establishment_id = $3))`,
      [input.organizationId, input.assetId, input.establishmentId],
    ),
    q(
      `SELECT status, is_simulated AS simulated, payload FROM external_data_snapshots
        WHERE organization_id = $1 AND establishment_id = $2 AND source = 'SENASA_RENSPA'
        ORDER BY fetched_at DESC LIMIT 1`,
      [input.organizationId, input.establishmentId],
    ),
    q(
      `SELECT count(*)::int AS runs FROM verification_runs
        WHERE organization_id = $1 AND asset_id = $2 AND status = 'COMPLETED'`,
      [input.organizationId, input.assetId],
    ),
  ]);

  const declared = input.declaredQuantity;
  const out: CrossSource[] = [
    {
      key: 'DECLARATION',
      label: 'Declaración',
      value: declared !== null ? `${declared} cabezas declaradas` : 'Sin declarar',
      state: declared !== null ? 'CONSISTENT' : 'NO_DATA',
      simulated: false,
    },
  ];

  out.push({
    key: 'VISION',
    label: 'Fotos / visión (YOLOX)',
    value:
      input.uniqueEstimate !== null
        ? `${input.uniqueEstimate} animales únicos estimados${input.possibleOverlap ? ' · posible duplicación entre fotos' : ''}`
        : 'Sin conteo',
    state:
      input.uniqueEstimate === null
        ? 'NO_DATA'
        : input.possibleOverlap || (declared !== null && !near(input.uniqueEstimate, declared))
          ? 'WARNING'
          : 'CONSISTENT',
    simulated: false,
  });

  const identified = Number(rfid?.identified ?? 0);
  const tags = Number(rfid?.tags ?? 0);
  out.push({
    key: 'RFID',
    label: 'RFID (30 días)',
    value: tags ? `${identified} caravanas identificadas de ${tags} leídas` : 'Sin lecturas RFID',
    state: !tags ? 'NO_DATA' : identified < tags ? 'WARNING' : 'CONSISTENT',
    simulated: Boolean(rfid?.simulated),
  });

  const total = Number(photos?.total ?? 0);
  const withCapture = Number(photos?.withCapture ?? 0);
  const inside = geo?.value;
  out.push({
    key: 'GPS',
    label: 'Ubicación de las fotos',
    value: total
      ? `${withCapture} de ${total} con ubicación de captura` +
        (withCapture === 0
          ? ''
          : inside === 1
            ? ' · dentro del establecimiento'
            : inside === 0
              ? ' · fuera del establecimiento'
              : '')
      : 'Sin fotos',
    state: !withCapture
      ? 'NO_DATA'
      : inside === 0 || withCapture < total
        ? 'WARNING'
        : 'CONSISTENT',
    simulated: false,
  });

  const analyzed = docs.filter((d) => d.status && d.status !== 'PENDING');
  const review = analyzed.filter((d) => d.status !== 'CONSISTENT');
  const renspaMatch = docs.some(
    (d) =>
      d.type === 'RENSPA' &&
      ((d.results as { check: string; status: string }[] | null) ?? []).some(
        (r) => r.check === 'RENSPA' && r.status === 'MATCH',
      ),
  );
  out.push({
    key: 'DOCUMENTS',
    label: 'Documentos (lectura automática)',
    value: docs.length
      ? `${docs.length} cargados · ${analyzed.length - review.length} consistentes · ${review.length} a revisar` +
        (docs.length > analyzed.length ? ` · ${docs.length - analyzed.length} sin lectura` : '') +
        (renspaMatch ? ' · RENSPA coincide' : '')
      : 'Sin documentos',
    state: !analyzed.length ? 'NO_DATA' : review.length ? 'WARNING' : 'CONSISTENT',
    simulated: false,
  });

  const payload = (registry?.payload ?? {}) as { registeredHeads?: number; status?: string };
  out.push({
    key: 'SENASA',
    label: 'Registro SENASA (RENSPA)',
    value: !registry
      ? 'Sin consulta'
      : registry.status === 'OK'
        ? `${payload.status ?? ''} · ${payload.registeredHeads ?? '—'} cabezas registradas en el establecimiento`
        : registry.status === 'NOT_FOUND'
          ? 'RENSPA no encontrado'
          : 'Consulta no disponible',
    state:
      !registry || registry.status === 'ERROR'
        ? 'NO_DATA'
        : registry.status === 'OK' && payload.status === 'ACTIVO'
          ? 'CONSISTENT'
          : 'WARNING',
    simulated: Boolean(registry?.simulated),
  });

  const runs = Number(history?.runs ?? 0);
  out.push({
    key: 'HISTORY',
    label: 'Historial',
    value: runs ? `${runs} verificaciones completadas del activo` : 'Primera verificación',
    state: runs > 1 ? 'CONSISTENT' : 'NO_DATA',
    simulated: false,
  });
  return out;
}
