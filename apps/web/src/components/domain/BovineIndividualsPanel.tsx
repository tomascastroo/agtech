'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { ErrorState, Loading } from '@/components/ui/Feedback';
import { Panel } from '@/components/ui/Panel';
import { DataTable } from '@/components/ui/Table';
import { api } from '@/lib/api/client';
import type { BovineIndividualDetail, BovineIndividualsResponse } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import styles from './domain.module.css';

const formatEid = (eid: string) =>
  `${eid.slice(0, 3)} ${eid.slice(3, 7)} ${eid.slice(7, 11)} ${eid.slice(11)}`;

/**
 * Manga + RFID para la entidad: bovinos identificados por su caravana electrónica, con las
 * imágenes de respaldo de cada identificación. La identidad la da el RFID; las imágenes muestran
 * que había un único bovino en la manga al momento de la lectura.
 */
export function BovineIndividualsPanel({ assetId }: { assetId: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['bovine-individuals', assetId],
    queryFn: () => api<BovineIndividualsResponse>(`/assets/${assetId}/bovine-individuals`),
  });
  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} />;
  if (query.data.total === 0) return null;
  const { total, real, simulated, items } = query.data;
  return (
    <Panel
      title={`Bovinos identificados: ${total}`}
      subtitle={`Registro individual en la manga por caravana electrónica (RFID), con imágenes de respaldo de cada lectura. ${real} con lector real · ${simulated} con lecturas SIMULADAS.`}
      actions={simulated ? <Badge tone="warning">SIMULADO</Badge> : null}
      flush
    >
      <div data-testid="bovine-individuals" data-total={total}>
        <DataTable
          caption="Bovinos identificados"
          rows={items}
          rowKey={(r) => r.id}
          onRowClick={(r) => setSelected(selected === r.id ? null : r.id)}
          columns={[
            { key: 'code', header: 'Código interno', render: (r) => <b>{r.internalCode}</b> },
            { key: 'rfid', header: 'RFID', render: (r) => formatEid(r.electronicId) },
            {
              key: 'first',
              header: 'Identificado',
              render: (r) => formatDateTime(r.firstIdentifiedAt),
            },
            { key: 'n', header: 'Lecturas', render: (r) => r.confirmations, numeric: true },
            {
              key: 'img',
              header: 'Imágenes',
              render: (r) => r.evidenceImages ?? 0,
              numeric: true,
            },
            {
              key: 'src',
              header: 'Origen',
              render: (r) =>
                r.simulated ? (
                  <Badge tone="warning">SIMULADO</Badge>
                ) : (
                  <Badge tone="success">Lector RFID</Badge>
                ),
            },
          ]}
        />
        {selected ? <IndividualDetail id={selected} /> : null}
      </div>
    </Panel>
  );
}

function IndividualDetail({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ['bovine-individual', id],
    queryFn: () => api<BovineIndividualDetail>(`/bovine-individuals/${id}`),
  });
  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} />;
  const b = query.data;
  return (
    <div className={styles.stackTight} style={{ padding: 16 }} data-testid="bovine-detail">
      <div className={styles.inline}>
        <strong>{b.internalCode}</strong>
        <span>RFID {formatEid(b.electronicId)}</span>
        {b.simulated ? <Badge tone="warning">SIMULADO</Badge> : null}
        <span className={styles.muted}>
          Última identificación {formatDateTime(b.lastIdentifiedAt)}
        </span>
      </div>
      {b.captures.map((c) => (
        <div key={c.id} className={styles.stackTight}>
          <span className={styles.muted}>
            Captura #{c.sequence} · {c.processedAt ? formatDateTime(c.processedAt) : '—'} ·
            evidencia inmutable {c.evidenceId?.slice(0, 8)} · {c.bestFrames.length} imágenes
          </span>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 8,
            }}
          >
            {c.bestFrames.map((f) => (f.url ? <FrameWithBox key={f.index} frame={f} /> : null))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FrameWithBox({
  frame,
}: {
  frame: BovineIndividualDetail['captures'][number]['bestFrames'][number];
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  return (
    <figure style={{ margin: 0, position: 'relative' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={frame.url!}
        alt={`Cuadro ${frame.index} del bovino`}
        style={{ width: '100%', display: 'block' }}
        onLoad={(e) =>
          setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
        }
      />
      {size ? (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: `${(frame.box.x / size.w) * 100}%`,
            top: `${(frame.box.y / size.h) * 100}%`,
            width: `${(frame.box.width / size.w) * 100}%`,
            height: `${(frame.box.height / size.h) * 100}%`,
            border: '2px solid #38d27a',
          }}
        />
      ) : null}
      <figcaption className={styles.muted}>
        sha256 {frame.sha256.slice(0, 10)}… · detección {Math.round(frame.score * 100)} %
      </figcaption>
    </figure>
  );
}
