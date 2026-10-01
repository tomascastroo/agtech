'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Callout, EmptyState } from '@/components/ui/Feedback';
import { Field, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { CellTitle, DataTable } from '@/components/ui/Table';
import { api, ApiError } from '@/lib/api/client';
import { keys, useApiMutation } from '@/lib/api/queries';
import type { AlertItem } from '@/lib/api/types';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useCan } from '@/lib/permissions';
import { AlertStatusBadge, SeverityBadge } from './StatusBadges';
import styles from './domain.module.css';

/** Alertas con acciones de seguimiento y resolución (la resolución exige una nota). */
export function AlertsTable({
  alerts,
  showAsset = true,
}: {
  alerts: AlertItem[];
  showAsset?: boolean;
}) {
  const can = useCan();
  const [resolving, setResolving] = useState<AlertItem | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const invalidate = [['alerts'], keys.dashboard, keys.portfolio, ['events']] as const;
  const update = useApiMutation(
    ({
      id,
      status,
      resolutionNote,
    }: {
      id: string;
      status: 'ACKNOWLEDGED' | 'RESOLVED';
      resolutionNote?: string;
    }) => api<AlertItem>(`/alerts/${id}`, { method: 'PATCH', body: { status, resolutionNote } }),
    invalidate,
  );

  const resolve = async () => {
    if (!resolving) return;
    setError(null);
    if (note.trim().length < 3) return setError('Indicá cómo se resolvió la alerta.');
    try {
      await update.mutateAsync({
        id: resolving.id,
        status: 'RESOLVED',
        resolutionNote: note.trim(),
      });
      setResolving(null);
      setNote('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No fue posible resolver la alerta.');
    }
  };

  return (
    <>
      <DataTable<AlertItem>
        caption="Alertas"
        rows={alerts}
        rowKey={(a) => a.id}
        empty={<EmptyState icon="bell" title="Sin alertas para los filtros seleccionados" />}
        columns={[
          {
            key: 'severity',
            header: 'Severidad',
            width: '130px',
            render: (a) => <SeverityBadge severity={a.severity} />,
          },
          {
            key: 'title',
            header: 'Alerta',
            render: (a) => (
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 520 }}>
                <strong style={{ fontWeight: 600 }}>{a.title}</strong>
                <span className={styles.muted}>{a.description}</span>
                {a.resolutionNote ? (
                  <span className={styles.small}>Resolución: {a.resolutionNote}</span>
                ) : null}
              </span>
            ),
          },
          ...(showAsset
            ? [
                {
                  key: 'asset',
                  header: 'Activo',
                  render: (a: AlertItem) =>
                    a.asset ? (
                      <CellTitle
                        title={<Link href={`/assets/${a.assetId}`}>{a.asset.name}</Link>}
                        subtitle={a.asset.establishmentName ?? undefined}
                      />
                    ) : (
                      '—'
                    ),
                },
              ]
            : []),
          {
            key: 'status',
            header: 'Estado',
            render: (a) => <AlertStatusBadge status={a.status} />,
          },
          {
            key: 'created',
            header: 'Generada',
            render: (a) => (
              <span title={formatDateTime(a.createdAt)}>{formatRelative(a.createdAt)}</span>
            ),
          },
          {
            key: 'actions',
            header: <span className="visually-hidden">Acciones</span>,
            render: (a) =>
              can('alerts:manage') && a.status !== 'RESOLVED' ? (
                <span
                  className={styles.inline}
                  style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}
                >
                  {a.status === 'OPEN' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => update.mutate({ id: a.id, status: 'ACKNOWLEDGED' })}
                    >
                      Tomar
                    </Button>
                  ) : null}
                  <Button size="sm" onClick={() => setResolving(a)}>
                    Resolver
                  </Button>
                </span>
              ) : null,
          },
        ]}
      />
      <Modal
        open={resolving !== null}
        title="Resolver alerta"
        description={resolving?.title}
        onClose={() => {
          setResolving(null);
          setError(null);
        }}
        footer={
          <>
            <Button variant="ghost" onClick={() => setResolving(null)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={update.isPending} onClick={() => void resolve()}>
              Resolver
            </Button>
          </>
        }
      >
        <div className={styles.stackTight}>
          <Field
            label="Nota de resolución"
            required
            hint="Queda registrada en la auditoría de la alerta."
          >
            {(props) => (
              <Textarea
                {...props}
                rows={3}
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            )}
          </Field>
          {error ? <Callout tone="critical">{error}</Callout> : null}
        </div>
      </Modal>
    </>
  );
}
