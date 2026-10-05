'use client';

import { SCANNER_OVERLAY } from '@/lib/design/tokens';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { ErrorState, Loading } from '@/components/ui/Feedback';
import { Panel } from '@/components/ui/Panel';
import { api } from '@/lib/api/client';
import type { ScanDetail } from '@/lib/api/types';
import { formatDateTime, formatNumber } from '@/lib/format';
import styles from './domain.module.css';

const STATUS = {
  UPLOADING: { label: 'Sincronizando', tone: 'info' },
  PROCESSING: { label: 'Procesando en servidor', tone: 'info' },
  COMPLETED: { label: 'Conteo oficial', tone: 'success' },
  FAILED: { label: 'Error de procesamiento', tone: 'critical' },
} as const;

/** Estado de la evidencia: una evidencia parcial nunca es un rechazo. */
export const EVIDENCE_STATUS = {
  VALIDATED: { label: 'VALIDADO', tone: 'success' },
  INCONCLUSIVE: { label: 'NO CONCLUYENTE', tone: 'warning' },
  INSUFFICIENT: { label: 'EVIDENCIA INSUFICIENTE', tone: 'critical' },
} as const;

const OFFICIAL_TEXT: Record<ScanDetail['mode'], string> = {
  FIXED: 'bovinos que cruzaron la línea — comparable con lo declarado si pasó todo el rodeo',
  SWEEP: 'bovinos observados — cota inferior (barrido de una parte del rodeo)',
  PEN: 'bovinos observados (animales únicos) — cota inferior: los tapados por otros no se ven',
  PHOTO: 'bovinos en las fotos (animales únicos) — cota inferior',
  CHUTE:
    'bovinos identificados por caravana (RFID) en la manga — comparable con lo declarado solo con lector real y si pasó todo el rodeo',
};

const pct = (ratio: number) => `${formatNumber(ratio * 100)} %`;

/**
 * Escaneos de bovinos del activo para la entidad: el conteo OFICIAL (recalculado en el servidor)
 * separado del preliminar del celular, la base del conteo, la calidad y los cuadros
 * representativos con las detecciones del servidor.
 */
export function ScansPanel({ assetId }: { assetId: string }) {
  const query = useQuery({
    queryKey: ['asset-scans', assetId],
    queryFn: () => api<ScanDetail[]>(`/assets/${assetId}/scans`),
    refetchInterval: (q) =>
      q.state.data?.some((s) => s.status === 'UPLOADING' || s.status === 'PROCESSING')
        ? 5000
        : false,
  });
  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} />;
  if (query.data.length === 0) return null;
  return (
    <Panel
      title="Escaneos de bovinos"
      subtitle="Conteo con la cámara del celular. El número oficial lo recalcula el servidor sobre los cuadros del escaneo; el del celular es solo referencia."
    >
      <div className={styles.stack}>
        {query.data.map((scan) => (
          <ScanCard key={scan.id} scan={scan} />
        ))}
      </div>
    </Panel>
  );
}

function ScanCard({ scan }: { scan: ScanDetail }) {
  const official = scan.official;
  const deviceCount = scan.deviceResult?.netCount;
  return (
    <div className={styles.stackTight} data-testid="scan-card">
      <div className={styles.inline}>
        <strong>{scan.modeLabel}</strong>
        <span className={styles.muted}>{formatDateTime(scan.startedAt)}</span>
        <Badge tone={STATUS[scan.status].tone}>{STATUS[scan.status].label}</Badge>
        {scan.evidenceStatus ? (
          <span data-testid="scan-evidence-status">
            <Badge tone={EVIDENCE_STATUS[scan.evidenceStatus].tone}>
              {EVIDENCE_STATUS[scan.evidenceStatus].label}
            </Badge>
          </span>
        ) : null}
        {official?.model.simulated ? <Badge tone="warning">SIMULADO</Badge> : null}
      </div>
      {scan.status === 'FAILED' && scan.error ? (
        <p className={styles.muted} data-testid="scan-error">
          {scan.error}
        </p>
      ) : null}
      <dl className={styles.facts}>
        <dt>Conteo oficial (servidor)</dt>
        <dd data-testid="scan-official">
          {official?.count !== null && official?.count !== undefined ? (
            <>
              <strong>{formatNumber(official.count)}</strong> {OFFICIAL_TEXT[scan.mode]}
            </>
          ) : (
            '—'
          )}
        </dd>
        <dt>Conteo del celular</dt>
        <dd>
          {deviceCount !== undefined
            ? `${formatNumber(deviceCount)} (preliminar, no se usa en la verificación)`
            : '—'}
        </dd>
        {official?.pen ? (
          <>
            <dt>Animales únicos</dt>
            <dd data-testid="scan-pen">
              {official.pen.tracksCounted} seguidos · {official.pen.mergedTracks} reapariciones
              unidas (no se cuentan dos veces) · máx. {official.pen.maxSimultaneous} a la vez
            </dd>
            <dt>Cobertura</dt>
            <dd>
              {formatNumber(official.pen.coverageViews, 1)} vistas de ancho
              {official.pen.revisitRatio > 0 ? ` · revisita ${pct(official.pen.revisitRatio)}` : ''}
              {official.pen.edgeAnimals > 0
                ? ` · ${official.pen.edgeAnimals} animales en el borde (el grupo puede seguir)`
                : ''}
              {official.metrics?.registeredPhotos !== null &&
              official.metrics?.registeredPhotos !== undefined
                ? ` · ${official.metrics.registeredPhotos} de ${official.metrics.frames} fotos unidas por solapamiento`
                : ''}
            </dd>
          </>
        ) : null}
        {official?.metrics ? (
          <>
            <dt>Calidad medida</dt>
            <dd data-testid="scan-metrics">
              desenfoque {pct(official.metrics.blurryRatio)} · poca luz{' '}
              {pct(official.metrics.underexposedRatio)} · contraluz{' '}
              {pct(official.metrics.overexposedRatio)} · movimiento{' '}
              {pct(official.metrics.fastMotionRatio)} · oclusión{' '}
              {pct(official.metrics.occlusionRatio)} · animales chicos{' '}
              {pct(official.metrics.smallAnimalRatio)}
            </dd>
          </>
        ) : null}
        {official?.chute ? (
          <>
            <dt>Asociaciones RFID</dt>
            <dd data-testid="scan-chute">
              {official.chute.confirmed} confirmadas · {official.chute.ambiguous} ambiguas ·{' '}
              {official.chute.insufficient} no determinables (sin asociar)
              {official.chute.rfidSimulated ? ' · lecturas SIMULADAS' : ''}
            </dd>
          </>
        ) : null}
        {official && !official.stillAnimals && scan.mode !== 'CHUTE' ? (
          <>
            <dt>Cruces de línea</dt>
            <dd>
              +{official.positiveCrossings} / −{official.negativeCrossings} ·{' '}
              {official.confirmedTracks} animales seguidos · máx. {official.maxSimultaneous} en un
              cuadro
            </dd>
          </>
        ) : null}
        {official ? (
          <>
            <dt>Procesamiento</dt>
            <dd>
              {official.framesProcessed} cuadros ({formatNumber(scan.sampledFps, 1)}/s),{' '}
              {official.blurryFrames} desenfocados · confianza{' '}
              {formatNumber(official.confidence * 100)} % · {official.model.code} ·{' '}
              {official.tracker}
            </dd>
          </>
        ) : null}
        <dt>Duración y ubicación</dt>
        <dd>
          {scan.durationS !== null ? `${Math.round(scan.durationS)} s` : '—'} ·{' '}
          {scan.location
            ? `${scan.location.coordinates[1].toFixed(5)}, ${scan.location.coordinates[0].toFixed(5)} (GPS del celular ±${Math.round(scan.locationAccuracyM ?? 0)} m)`
            : 'sin ubicación de captura'}
          {scan.maxDisplacementM !== null
            ? ` · desplazamiento ${Math.round(scan.maxDisplacementM)} m`
            : ''}
          {(scan.mode === 'SWEEP' || scan.mode === 'PEN') &&
          scan.heading?.sweptDeg !== null &&
          scan.heading?.sweptDeg !== undefined
            ? ` · arco barrido ${Math.round(scan.heading.sweptDeg)}°`
            : ''}
        </dd>
      </dl>
      {scan.guidance.length ? (
        <div className={styles.muted} data-testid="scan-guidance">
          <strong>Instrucciones para el productor:</strong>{' '}
          {scan.guidance.map((g) => g.message).join(' · ')}
        </div>
      ) : null}
      {scan.warnings.length ? (
        <ul className={styles.muted} data-testid="scan-warnings">
          {scan.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
      {official?.limitations.length ? (
        <details>
          <summary className={styles.muted}>Limitaciones del método</summary>
          <ul className={styles.muted}>
            {official.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {scan.keyFrames?.length ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 8,
          }}
        >
          {scan.keyFrames.map((frame) => (
            <KeyFrame key={frame.index} frame={frame} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Cuadro representativo con las detecciones del servidor superpuestas (SVG). */
function KeyFrame({ frame }: { frame: NonNullable<ScanDetail['keyFrames']>[number] }) {
  return (
    <figure style={{ margin: 0 }}>
      <div style={{ position: 'relative' }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada del almacenamiento */}
        <img
          src={frame.url}
          alt={`Cuadro representativo ${frame.index + 1}`}
          style={{ width: '100%', display: 'block', borderRadius: 6 }}
          onLoad={(e) => {
            const img = e.currentTarget;
            img.parentElement?.style.setProperty('--w', String(img.naturalWidth));
            img.parentElement?.style.setProperty('--h', String(img.naturalHeight));
            const svg = img.nextElementSibling;
            svg?.setAttribute('viewBox', `0 0 ${img.naturalWidth} ${img.naturalHeight}`);
          }}
        />
        <svg
          viewBox="0 0 1280 720"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          aria-hidden="true"
        >
          {(frame.detections ?? []).map((d, i) => (
            <rect
              key={i}
              x={d.x}
              y={d.y}
              width={d.width}
              height={d.height}
              fill="none"
              stroke={SCANNER_OVERLAY.confirmed}
              strokeWidth={3}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>
      <figcaption className={styles.muted}>
        {formatNumber(frame.capturedMs / 1000, 1)} s · {frame.detections?.length ?? 0} detecciones ·
        sha {frame.sha256.slice(0, 10)}…
      </figcaption>
    </figure>
  );
}
