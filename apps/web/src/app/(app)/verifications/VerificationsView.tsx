'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { OutcomeBadge, RunStatusBadge } from '@/components/domain/StatusBadges';
import styles from '@/components/domain/domain.module.css';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Loading } from '@/components/ui/Feedback';
import { Select } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { CellTitle, DataTable } from '@/components/ui/Table';
import { useVerifications } from '@/lib/api/queries';
import type { VerificationRun } from '@/lib/api/types';
import { formatDateTime, formatNumber, formatPercent, formatQuantity } from '@/lib/format';
import { RUN_STATUS_LABELS, TRIGGER_LABELS } from '@/lib/labels';

const duration = (run: VerificationRun) => {
  if (!run.startedAt || !run.completedAt) return '—';
  const seconds = (new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000;
  return `${formatNumber(seconds, 1)} s`;
};

export function VerificationsView() {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, isPending, error } = useVerifications({ status: status || undefined, page });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Verificaciones"
        description="Cada verificación es inmutable: conserva la evidencia, los modelos, los pesos y el resultado con el que se calculó."
      />
      <div className={styles.filters}>
        <Select
          aria-label="Filtrar por estado"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          style={{ maxWidth: 240 }}
        >
          <option value="">Todos los estados</option>
          {Object.entries(RUN_STATUS_LABELS).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      {error ? <ErrorState error={error} /> : null}
      <Panel flush footer={data ? `${data.total} verificaciones` : undefined}>
        {isPending ? (
          <Loading />
        ) : data ? (
          <DataTable<VerificationRun>
            caption="Verificaciones"
            rows={data.items}
            rowKey={(r) => r.id}
            onRowClick={(r) => router.push(`/assets/${r.assetId}/verification?run=${r.id}`)}
            empty={<EmptyState icon="shield" title="No hay verificaciones" />}
            columns={[
              {
                key: 'asset',
                header: 'Activo',
                render: (r) => (
                  <CellTitle
                    title={r.asset?.name ?? r.assetId}
                    subtitle={
                      r.asset
                        ? `${r.asset.typeName ?? ''} · ${r.asset.establishmentName ?? ''}`
                        : undefined
                    }
                  />
                ),
              },
              {
                key: 'when',
                header: 'Solicitada',
                render: (r) => (
                  <CellTitle
                    title={formatDateTime(r.queuedAt)}
                    subtitle={TRIGGER_LABELS[r.trigger] ?? r.trigger}
                  />
                ),
              },
              {
                key: 'qty',
                header: 'Verificado / declarado',
                numeric: true,
                render: (r) =>
                  r.result ? (
                    <CellTitle
                      title={formatQuantity(r.result.detectedQuantity, r.result.unit)}
                      subtitle={`de ${formatNumber(r.result.declaredQuantity)} · ${formatPercent(r.result.matchPercentage, 1)}`}
                    />
                  ) : (
                    '—'
                  ),
              },
              {
                key: 'score',
                header: 'Score',
                numeric: true,
                render: (r) => (r.result ? <strong>{r.result.finalScore}</strong> : '—'),
              },
              {
                key: 'status',
                header: 'Resultado',
                render: (r) =>
                  r.result ? (
                    <OutcomeBadge outcome={r.result.outcome} />
                  ) : (
                    <RunStatusBadge status={r.status} />
                  ),
              },
              { key: 'duration', header: 'Duración', numeric: true, render: duration },
              {
                key: 'version',
                header: 'Versión',
                render: (r) => (
                  <span className={styles.small}>
                    {r.result?.scoringModelVersion ?? r.pipelineVersion}
                  </span>
                ),
              },
            ]}
          />
        ) : null}
      </Panel>
      {pages > 1 ? (
        <div className={styles.spread} style={{ marginTop: 12 }}>
          <span className={styles.muted}>
            Página {page} de {pages}
          </span>
          <span className={styles.inline}>
            <Button
              size="sm"
              icon="chevronLeft"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </Button>
            <Button size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Siguiente
            </Button>
          </span>
        </div>
      ) : null}
    </>
  );
}
