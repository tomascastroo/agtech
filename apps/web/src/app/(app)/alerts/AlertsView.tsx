'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { AlertsTable } from '@/components/domain/AlertsTable';
import styles from '@/components/domain/domain.module.css';
import { ErrorState, Loading } from '@/components/ui/Feedback';
import { Select } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Stat, StatRow } from '@/components/ui/Stat';
import { useAlerts } from '@/lib/api/queries';
import { formatNumber } from '@/lib/format';
import { ALERT_STATUS_LABELS, SEVERITY_LABELS } from '@/lib/labels';

export function AlertsView() {
  const search = useSearchParams();
  const [status, setStatus] = useState(search.get('status') ?? 'ACTIVE');
  const [severity, setSeverity] = useState(search.get('severity') ?? '');
  const filtered = useAlerts({ status: status || undefined, severity: severity || undefined });
  const active = useAlerts({ status: 'ACTIVE' });
  const count = (s: string) => active.data?.items.filter((a) => a.severity === s).length ?? 0;

  return (
    <>
      <PageHeader
        title="Alertas"
        description="Generadas por las reglas de la organización en cada verificación y en el monitoreo continuo. Resolver una alerta exige registrar cómo se resolvió."
      />
      <div className={styles.stack}>
        <StatRow>
          <Stat
            label="Críticas activas"
            value={formatNumber(count('CRITICAL'))}
            accent="var(--critical-mark)"
          />
          <Stat
            label="Advertencias activas"
            value={formatNumber(count('WARNING'))}
            accent="var(--warning-mark)"
          />
          <Stat
            label="Informativas activas"
            value={formatNumber(count('INFO'))}
            accent="var(--data-1)"
          />
        </StatRow>
        <div className={styles.filters} style={{ marginBottom: 0 }}>
          <Select
            aria-label="Filtrar por estado"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{ maxWidth: 260 }}
          >
            <option value="ACTIVE">Activas</option>
            <option value="">Todas</option>
            {Object.entries(ALERT_STATUS_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filtrar por severidad"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            style={{ maxWidth: 260 }}
          >
            <option value="">Todas las severidades</option>
            {Object.entries(SEVERITY_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        {filtered.isError ? <ErrorState error={filtered.error} /> : null}
        <Panel flush footer={filtered.data ? `${filtered.data.total} alertas` : undefined}>
          {filtered.isPending ? <Loading /> : <AlertsTable alerts={filtered.data?.items ?? []} />}
        </Panel>
      </div>
    </>
  );
}
