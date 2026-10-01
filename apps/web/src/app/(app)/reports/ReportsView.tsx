'use client';

import Link from 'next/link';
import { useState } from 'react';
import { downloadReport, type ReportFormat } from '@/components/domain/ReportActions';
import styles from '@/components/domain/domain.module.css';
import { Badge, type Tone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Callout, EmptyState, ErrorState, Loading } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { CellTitle, DataTable } from '@/components/ui/Table';
import { api, ApiError } from '@/lib/api/client';
import { useApiMutation, useReports } from '@/lib/api/queries';
import type { ReportItem } from '@/lib/api/types';
import { formatBytes, formatDateTime } from '@/lib/format';
import { useCan } from '@/lib/permissions';

const STATUS: Record<ReportItem['status'], [Tone, string]> = {
  PENDING: ['neutral', 'En cola'],
  GENERATING: ['info', 'Generando'],
  READY: ['success', 'Disponible'],
  FAILED: ['critical', 'Con error'],
};

export function ReportsView() {
  const can = useCan();
  const reports = useReports({});
  const [error, setError] = useState<string | null>(null);
  const regenerate = useApiMutation(
    (id: string) => api(`/reports/${id}/generate`, { method: 'POST' }),
    [['reports']],
  );

  const download = async (report: ReportItem, format: ReportFormat) => {
    setError(null);
    try {
      await downloadReport(report.id, format);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No fue posible descargar el informe.');
    }
  };

  return (
    <>
      <PageHeader
        title="Informes"
        description="Informe de cada verificación en PDF (para el legajo de crédito), CSV y JSON. Cada archivo se versiona y se identifica con su hash SHA-256."
      />
      {error ? <Callout tone="critical">{error}</Callout> : null}
      {reports.isError ? <ErrorState error={reports.error} /> : null}
      <Panel flush footer={reports.data ? `${reports.data.total} informes` : undefined}>
        {reports.isPending ? (
          <Loading />
        ) : (
          <DataTable<ReportItem>
            caption="Informes"
            rows={reports.data?.items ?? []}
            rowKey={(r) => r.id}
            empty={<EmptyState icon="file" title="Todavía no hay informes" />}
            columns={[
              {
                key: 'title',
                header: 'Informe',
                render: (r) => (
                  <CellTitle
                    title={
                      <Link href={`/assets/${r.assetId}/verification?run=${r.verificationId}`}>
                        {r.title}
                      </Link>
                    }
                    subtitle={
                      r.asset
                        ? `${r.asset.typeName ?? ''} · ${r.asset.establishmentName ?? ''}`
                        : undefined
                    }
                  />
                ),
              },
              {
                key: 'status',
                header: 'Estado',
                render: (r) => (
                  <Badge tone={STATUS[r.status][0]} dot title={r.failureReason ?? undefined}>
                    {STATUS[r.status][1]}
                  </Badge>
                ),
              },
              {
                key: 'generated',
                header: 'Generado',
                render: (r) => formatDateTime(r.generatedAt),
              },
              {
                key: 'pdf',
                header: 'PDF',
                render: (r) =>
                  r.formats.PDF ? (
                    <span className={styles.small}>
                      v{r.formats.PDF.version} · {formatBytes(r.formats.PDF.sizeBytes)}
                    </span>
                  ) : (
                    '—'
                  ),
              },
              {
                key: 'actions',
                header: <span className="visually-hidden">Descargas</span>,
                render: (r) => (
                  <span
                    className={styles.inline}
                    style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}
                  >
                    {r.status === 'READY' ? (
                      (['PDF', 'CSV', 'JSON'] as const).map((format) =>
                        r.formats[format] ? (
                          <Button
                            key={format}
                            size="sm"
                            variant={format === 'PDF' ? 'secondary' : 'ghost'}
                            icon="download"
                            onClick={() => void download(r, format)}
                          >
                            {format}
                          </Button>
                        ) : null,
                      )
                    ) : r.status === 'FAILED' && can('reports:generate') ? (
                      <Button
                        size="sm"
                        icon="refresh"
                        loading={regenerate.isPending}
                        onClick={() => regenerate.mutate(r.id)}
                      >
                        Reintentar
                      </Button>
                    ) : null}
                    {r.status === 'READY' && can('reports:generate') ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="refresh"
                        onClick={() => regenerate.mutate(r.id)}
                        aria-label="Regenerar informe"
                        title="Regenerar (nueva versión)"
                      />
                    ) : null}
                  </span>
                ),
              },
            ]}
          />
        )}
      </Panel>
    </>
  );
}
