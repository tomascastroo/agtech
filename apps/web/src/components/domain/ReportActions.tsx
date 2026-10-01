'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api/client';
import { keys, useApiMutation, useReports } from '@/lib/api/queries';
import type { ReportItem } from '@/lib/api/types';
import { openSignedUrl } from '@/lib/download';
import { useCan } from '@/lib/permissions';
import styles from './domain.module.css';

export type ReportFormat = 'PDF' | 'CSV' | 'JSON';

export const downloadReport = (reportId: string, format: ReportFormat) =>
  openSignedUrl(() => api<{ url: string }>(`/reports/${reportId}/download?format=${format}`));

/** Informe de una verificación: descarga PDF/CSV/JSON o generación si todavía no existe. */
export function ReportActions({
  verificationId,
  assetId,
  primary = true,
}: {
  verificationId: string;
  assetId: string;
  primary?: boolean;
}) {
  const can = useCan();
  const reports = useReports({ assetId });
  const [error, setError] = useState<string | null>(null);
  const report: ReportItem | undefined = reports.data?.items.find(
    (r) => r.verificationId === verificationId,
  );
  const generate = useApiMutation(
    () => api(`/verifications/${verificationId}/reports`, { method: 'POST' }),
    [keys.reports({ assetId }), keys.reports({})],
  );

  const download = async (format: ReportFormat) => {
    if (!report) return;
    setError(null);
    try {
      await downloadReport(report.id, format);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No fue posible descargar el informe.');
    }
  };

  if (reports.isPending) return <Button disabled>Informe…</Button>;
  if (!report || report.status === 'FAILED') {
    return can('reports:generate') ? (
      <Button icon="file" loading={generate.isPending} onClick={() => generate.mutate(undefined)}>
        {report?.status === 'FAILED' ? 'Reintentar informe' : 'Generar informe'}
      </Button>
    ) : null;
  }
  if (report.status !== 'READY') {
    return (
      <Button loading disabled>
        Generando informe
      </Button>
    );
  }
  return (
    <span className={styles.inline}>
      <Button
        variant={primary ? 'secondary' : 'ghost'}
        icon="file"
        onClick={() => void download('PDF')}
        data-testid="report-pdf"
      >
        Ver informe completo
      </Button>
      <Button variant="ghost" size="sm" icon="download" onClick={() => void download('CSV')}>
        CSV
      </Button>
      <Button variant="ghost" size="sm" icon="download" onClick={() => void download('JSON')}>
        JSON
      </Button>
      {error ? (
        <span className={styles.small} role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
