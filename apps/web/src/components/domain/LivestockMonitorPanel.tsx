'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { ErrorState, Loading } from '@/components/ui/Feedback';
import { Panel } from '@/components/ui/Panel';
import { DataTable } from '@/components/ui/Table';
import { api } from '@/lib/api/client';
import type { LivestockHistory, LivestockReconciliation } from '@/lib/api/types';
import { formatDate, formatNumber } from '@/lib/format';
import styles from './domain.module.css';
import { OutcomeBadge } from './StatusBadges';

const SEVERITY = {
  INFO: { label: 'Info', tone: 'info' },
  WARNING: { label: 'Atención', tone: 'warning' },
  CRITICAL: { label: 'Crítico', tone: 'critical' },
} as const;

const METHOD: Record<LivestockReconciliation['method'], string> = {
  TIME_MATCH: 'Coincidencia individual (paso por la manga con lector en el mismo momento)',
  COUNTS_ONLY: 'Solo totales (sin paso simultáneo por la manga con lector)',
  NO_RFID: 'Sin lecturas RFID reales',
  NO_VISUAL: 'Sin conteo visual oficial todavía',
};

const dash = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : formatNumber(v);

/**
 * Monitoreo recurrente del rodeo dado en garantía: historial verificación por verificación
 * (Fecha | Declarados | Observados | RFID | Cobertura | Estado), cambios relevantes y la
 * conciliación visual + RFID con REAL y SIMULADO por separado.
 */
export function LivestockMonitorPanel({ assetId }: { assetId: string }) {
  const history = useQuery({
    queryKey: ['livestock-history', assetId],
    queryFn: () => api<LivestockHistory>(`/assets/${assetId}/livestock/history`),
  });
  const rfid = useQuery({
    queryKey: ['livestock-reconciliation', assetId],
    queryFn: () => api<LivestockReconciliation>(`/assets/${assetId}/livestock/reconciliation`),
  });
  return (
    <>
      <Panel
        title="Monitoreo del rodeo"
        subtitle="Cada verificación del activo, para seguir la garantía en el tiempo. Un conteo que es cota inferior no prueba un faltante."
        flush
      >
        {history.isPending ? (
          <Loading />
        ) : history.isError ? (
          <ErrorState error={history.error} />
        ) : (
          <div data-testid="livestock-history">
            <DataTable
              caption="Historial del rodeo"
              rows={history.data.rows}
              rowKey={(r) => r.runId}
              empty={
                <div style={{ padding: 20 }} className={styles.muted}>
                  Todavía no hay verificaciones completadas.
                </div>
              }
              columns={[
                { key: 'date', header: 'Fecha', render: (r) => formatDate(r.date) },
                {
                  key: 'declared',
                  header: 'Declarados',
                  numeric: true,
                  render: (r) => dash(r.declared),
                },
                {
                  key: 'observed',
                  header: 'Observados',
                  numeric: true,
                  render: (r) => (
                    <span>
                      {dash(r.observed)}
                      {r.basis === 'LOWER_BOUND' ? (
                        <span className={styles.muted}> (mín.)</span>
                      ) : r.basis === 'CENSUS' ? (
                        <span className={styles.muted}> (manga)</span>
                      ) : null}
                    </span>
                  ),
                },
                {
                  key: 'rfid',
                  header: 'RFID',
                  numeric: true,
                  render: (r) => (
                    <span>
                      {dash(r.rfidIdentified)}
                      {r.rfidSimulated > 0 ? (
                        <span className={styles.muted}> · {r.rfidSimulated} SIMULADO</span>
                      ) : null}
                    </span>
                  ),
                },
                {
                  key: 'coverage',
                  header: 'Cobertura',
                  numeric: true,
                  render: (r) =>
                    r.coverage === null ? '—' : `${formatNumber(r.coverage * 100)} %`,
                },
                {
                  key: 'status',
                  header: 'Estado',
                  render: (r) => (r.status ? <OutcomeBadge outcome={r.status} /> : '—'),
                },
              ]}
            />
            {history.data.changes.length ? (
              <ul
                className={styles.stackTight}
                style={{ padding: 16 }}
                data-testid="livestock-changes"
              >
                {history.data.changes.map((c, i) => (
                  <li key={`${c.toRunId}-${c.code}-${i}`} className={styles.inline}>
                    <Badge tone={SEVERITY[c.severity].tone}>{SEVERITY[c.severity].label}</Badge>
                    <span className={styles.muted}>{formatDate(c.date)}</span> {c.message}
                  </li>
                ))}
              </ul>
            ) : history.data.rows.length > 1 ? (
              <p className={styles.muted} style={{ padding: 16 }}>
                Sin cambios relevantes entre verificaciones.
              </p>
            ) : null}
          </div>
        )}
      </Panel>

      <Panel
        title="Visual + RFID"
        subtitle={`Bovinos observados por visión frente a caravanas leídas (últimos ${rfid.data?.windowDays ?? 30} días).`}
      >
        {rfid.isPending ? (
          <Loading />
        ) : rfid.isError ? (
          <ErrorState error={rfid.error} />
        ) : (
          <div className={styles.stackTight} data-testid="livestock-rfid">
            <div className={styles.inline}>
              <Badge tone={rfid.data.method === 'TIME_MATCH' ? 'success' : 'info'}>
                {METHOD[rfid.data.method]}
              </Badge>
            </div>
            <dl className={styles.facts}>
              <dt>Bovinos observados</dt>
              <dd>
                {dash(rfid.data.observed)}
                {rfid.data.observedBasis === 'LOWER_BOUND' ? ' (cota inferior)' : ''}
                {rfid.data.observedAt ? ` · ${formatDate(rfid.data.observedAt)}` : ''}
              </dd>
              <dt>Identificados por RFID (REAL)</dt>
              <dd>
                {rfid.data.real.identified} de {rfid.data.real.tags} caravanas leídas
                {rfid.data.real.unknown ? ` · ${rfid.data.real.unknown} desconocidas` : ''}
                {rfid.data.real.otherEstablishment
                  ? ` · ${rfid.data.real.otherEstablishment} de otro establecimiento`
                  : ''}
              </dd>
              <dt>Coincidencias</dt>
              <dd data-testid="rfid-matches">
                {rfid.data.matches === null ? 'No determinable' : rfid.data.matches}
              </dd>
              <dt>Observados sin RFID</dt>
              <dd>
                {rfid.data.observedWithoutRfid === null
                  ? 'No determinable'
                  : rfid.data.observedWithoutRfid}
              </dd>
              <dt>RFID sin detección visual</dt>
              <dd>
                {rfid.data.rfidWithoutVisual === null
                  ? 'No determinable'
                  : rfid.data.rfidWithoutVisual}
              </dd>
              {rfid.data.totalsDifference !== null ? (
                <>
                  <dt>Diferencia de totales</dt>
                  <dd>
                    {rfid.data.totalsDifference > 0 ? '+' : ''}
                    {rfid.data.totalsDifference} (observados − identificados REAL)
                  </dd>
                </>
              ) : null}
              {rfid.data.simulated.tags ? (
                <>
                  <dt>
                    <Badge tone="warning">SIMULADO</Badge>
                  </dt>
                  <dd>
                    {rfid.data.simulated.tags} caravanas de demo ({rfid.data.simulated.identified}{' '}
                    identificadas): no se usan para conciliar
                  </dd>
                </>
              ) : null}
            </dl>
            {rfid.data.notes.map((n) => (
              <p key={n} className={styles.muted}>
                {n}
              </p>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
