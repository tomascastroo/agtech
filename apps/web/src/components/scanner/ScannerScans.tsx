'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import styles from '@/components/producer/producer.module.css';
import { api } from '@/lib/api/client';
import type { EvidenceStatusCode, GuidanceItem, LivestockProfile } from '@/lib/api/types';
import { cacheRequest } from '@/lib/scanner/request-cache';
import { scanStatus } from '@/lib/scanner/status';
import { listScans, type LocalScan } from '@/lib/scanner/store';
import { onScansChanged, syncPendingScans } from '@/lib/scanner/sync';

export const MODE_LABELS: Record<LocalScan['mode'], string> = {
  FIXED: 'Escáner fijo',
  SWEEP: 'Barrido',
  PEN: 'Escáner de corral',
  PHOTO: 'Fotos',
  CHUTE: 'Manga + RFID',
};

const EVIDENCE_LABELS: Record<EvidenceStatusCode, string> = {
  VALIDATED: 'Evidencia validada',
  INCONCLUSIVE: 'Evidencia no concluyente (cuenta como mínimo)',
  INSUFFICIENT: 'Evidencia insuficiente (no se usa)',
};

interface ServerScan {
  id: string;
  mode: LocalScan['mode'];
  evidenceStatus: EvidenceStatusCode | null;
  guidance: GuidanceItem[];
  status: 'UPLOADING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  startedAt: string;
  durationS: number | null;
  received: { frames: number; keyFrames: number };
  expected: { frames: number | null; keyFrames: number | null };
  deviceResult: { netCount?: number } | null;
  official: { count: number | null; lowerBound: boolean; model: { simulated: boolean } } | null;
  quality: string | null;
  error: string | null;
}

type Row = Pick<
  LocalScan,
  'id' | 'mode' | 'state' | 'uploaded' | 'frameCount' | 'keyFrameCount' | 'official' | 'error'
> & {
  startedAt: string;
  deviceCount: number | null;
  evidenceStatus?: EvidenceStatusCode | null;
  guidance?: GuidanceItem[];
};

const fromServer = (s: ServerScan): Row => ({
  id: s.id,
  mode: s.mode,
  startedAt: s.startedAt,
  state: s.status === 'UPLOADING' ? 'SYNCING' : s.status,
  uploaded: s.received.frames + s.received.keyFrames,
  frameCount: s.expected.frames ?? s.received.frames,
  keyFrameCount: s.expected.keyFrames ?? s.received.keyFrames,
  official: s.official
    ? {
        count: s.official.count,
        quality: s.quality,
        lowerBound: s.official.lowerBound,
        simulated: s.official.model.simulated,
      }
    : null,
  error: s.error,
  deviceCount: s.deviceResult?.netCount ?? null,
  evidenceStatus: s.evidenceStatus,
  guidance: s.guidance,
});

/** Escaneos de la solicitud: los guardados en el teléfono y los ya recibidos por el servidor. */
export function ScannerScans({
  requestId,
  assetName,
  profile = null,
}: {
  requestId: string;
  assetName: string;
  profile?: LivestockProfile | null;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    cacheRequest({ id: requestId, assetName, profile });
  }, [requestId, assetName, profile]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setOnline(navigator.onLine);
      const local = await listScans(requestId).catch(() => [] as LocalScan[]);
      const server = navigator.onLine
        ? await api<ServerScan[]>(`/producer/me/requests/${requestId}/scans`).catch(
            () => [] as ServerScan[],
          )
        : [];
      const byId = new Map<string, Row>(server.map((s) => [s.id, fromServer(s)]));
      for (const l of local) {
        // Lo local manda mientras no llegó al servidor o el servidor no terminó.
        const remote = byId.get(l.id);
        if (!remote || (remote.state !== 'COMPLETED' && remote.state !== 'FAILED')) {
          byId.set(l.id, { ...l, deviceCount: l.deviceResult?.netCount ?? null });
        }
      }
      if (alive) setRows([...byId.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
    };
    void load();
    const off = onScansChanged(() => void load());
    const timer = window.setInterval(() => void syncPendingScans().then(load), 10_000);
    window.addEventListener('online', load);
    window.addEventListener('offline', load);
    return () => {
      alive = false;
      off();
      window.clearInterval(timer);
      window.removeEventListener('online', load);
      window.removeEventListener('offline', load);
    };
  }, [requestId]);

  return (
    <div className={styles.list}>
      <p className={styles.muted}>
        Usá la cámara del celular como escáner: en una manga o tranquera (escáner fijo), girando
        despacio desde un punto (barrido), sobre animales quietos en un corral o aguada (escáner de
        corral) o con fotos. Funciona sin señal; el conteo oficial lo calcula el servidor cuando el
        escaneo se sincroniza.
      </p>
      {profile ? (
        <p className={styles.muted} data-testid="livestock-profile">
          <strong>{profile.label}:</strong> {profile.guidance}
        </p>
      ) : null}
      <Link href={`/escaner/${requestId}`} className={styles.bigButton} data-testid="open-scanner">
        Escanear rodeo
      </Link>
      {rows.map((row) => {
        const status = scanStatus(row, online);
        return (
          <div key={row.id} className={styles.docRow} data-testid="scan-row">
            <span style={{ flex: 1 }}>
              <strong style={{ display: 'block' }}>
                {MODE_LABELS[row.mode]} ·{' '}
                {new Date(row.startedAt).toLocaleString('es-AR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </strong>
              <span className={styles.muted}>
                {row.deviceCount !== null ? `Celular (preliminar): ${row.deviceCount} · ` : ''}
                {status.detail}
              </span>
              {row.evidenceStatus ? (
                <span
                  className={styles.muted}
                  style={{ display: 'block' }}
                  data-testid="scan-evidence"
                >
                  {EVIDENCE_LABELS[row.evidenceStatus]}
                </span>
              ) : null}
              {row.guidance?.length ? (
                <span
                  className={styles.muted}
                  style={{ display: 'block' }}
                  data-testid="scan-guidance"
                >
                  Para el próximo escaneo: {row.guidance.map((g) => g.message).join(' · ')}
                </span>
              ) : null}
            </span>
            <span className={styles.chip} data-testid="scan-status">
              {status.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
