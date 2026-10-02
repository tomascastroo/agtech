'use client';

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

const QUALITY = {
  COMPLETE: { label: 'Escaneo completo', tone: 'success' },
  LIMITED: { label: 'Escaneo limitado', tone: 'warning' },
  INSUFFICIENT: { label: 'Escaneo insuficiente', tone: 'critical' },
} as const;

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
        <strong>
          {scan.mode === 'FIXED' ? 'Escáner fijo (paso controlado)' : 'Barrido móvil'}
        </strong>
        <span className={styles.muted}>{formatDateTime(scan.startedAt)}</span>
        <Badge tone={STATUS[scan.status].tone}>{STATUS[scan.status].label}</Badge>
        {scan.quality ? (
          <Badge tone={QUALITY[scan.quality].tone}>{QUALITY[scan.quality].label}</Badge>
        ) : null}
        {official?.model.simulated ? <Badge tone="warning">SIMULADO</Badge> : null}
      </div>
      <dl className={styles.facts}>
        <dt>Conteo oficial (servidor)</dt>
        <dd data-testid="scan-official">
          {official?.count !== null && official?.count !== undefined ? (
            <>
              <strong>{formatNumber(official.count)}</strong>{' '}
              {official.lowerBound
                ? 'bovinos observados — cota inferior (barrido de una parte del rodeo)'
                : 'bovinos que cruzaron la línea — comparable con lo declarado si pasó todo el rodeo'}
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
        {official ? (
          <>
            <dt>Cruces de línea</dt>
            <dd>
              +{official.positiveCrossings} / −{official.negativeCrossings} ·{' '}
              {official.confirmedTracks} animales seguidos · máx. {official.maxSimultaneous} en un
              cuadro
            </dd>
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
          {scan.mode === 'SWEEP' &&
          scan.heading?.sweptDeg !== null &&
          scan.heading?.sweptDeg !== undefined
            ? ` · arco barrido ${Math.round(scan.heading.sweptDeg)}°`
            : ''}
        </dd>
      </dl>
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
              stroke="#38d27a"
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
