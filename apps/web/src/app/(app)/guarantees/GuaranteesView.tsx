'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from '@/components/domain/domain.module.css';
import { DemoName } from '@/components/domain/StatusBadges';
import { Badge } from '@/components/ui/Badge';
import { Callout, EmptyState, ErrorState, Loading } from '@/components/ui/Feedback';
import { Checkbox, SearchInput, Select } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Stat, StatRow } from '@/components/ui/Stat';
import { DataTable } from '@/components/ui/Table';
import {
  PRODUCTION_LABELS,
  RISK_LABELS,
  RISK_TONE,
  STATE_LABELS,
  STATE_TONE,
  useGuarantees,
  type CollateralState,
  type GuaranteeRow,
} from '@/lib/api/collateral';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';

const STATES = Object.keys(STATE_LABELS) as CollateralState[];

export function StateBadge({ state }: { state: CollateralState }) {
  return (
    <Badge tone={STATE_TONE[state]} dot>
      {STATE_LABELS[state]}
    </Badge>
  );
}

export function coverageText(row: { coverageStatus: string | null; coverageRatio: number | null }) {
  return row.coverageStatus === 'DETERMINADA' && row.coverageRatio !== null
    ? `${formatNumber(row.coverageRatio, 2)}×`
    : 'No determinable';
}

/** Cartera de garantías bovinas: responde en segundos "¿puedo confiar hoy en cada garantía?". */
export function GuaranteesView() {
  const router = useRouter();
  const [state, setState] = useState('');
  const [risk, setRisk] = useState('');
  const [production, setProduction] = useState('');
  const [q, setQ] = useState('');
  const [includeDemo, setIncludeDemo] = useState(false);
  const query = useGuarantees({
    state: state || undefined,
    risk: risk || undefined,
    production: production || undefined,
    q: q || undefined,
    includeDemo,
  });

  return (
    <>
      <PageHeader
        title="Garantías bovinas"
        description="Verificación continua de cada garantía: qué se declaró, qué se esperaba, qué se observó y qué se pudo verificar. AgroGarantías verifica y monitorea; no presta ni custodia."
      />
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} />
      ) : (
        <div className={styles.stack}>
          <StatRow>
            <Stat
              testId="kpi-active"
              label="Garantías activas"
              value={formatNumber(query.data.kpis.activeGuarantees)}
            />
            <Stat
              label="Verificadas"
              value={formatNumber(query.data.kpis.verified)}
              accent="var(--color-success)"
            />
            <Stat
              testId="kpi-at-risk"
              label="En riesgo"
              value={formatNumber(query.data.kpis.atRisk)}
              accent="var(--color-danger)"
              caption="Inspección, revisión, no determinable o riesgo alto"
            />
            <Stat
              label="Inspecciones pendientes"
              value={formatNumber(query.data.kpis.pendingInspections)}
            />
            <Stat
              label="Evidencia vencida"
              value={formatNumber(query.data.kpis.expiredEvidence)}
              accent="var(--color-warning)"
            />
            <Stat label="Alertas abiertas" value={formatNumber(query.data.kpis.openAlerts)} />
            <Stat
              label="Score promedio"
              value={
                query.data.kpis.averageScore === null
                  ? '—'
                  : formatNumber(query.data.kpis.averageScore)
              }
            />
          </StatRow>
          {query.data.kpis.byCurrency.length ? (
            <StatRow>
              {query.data.kpis.byCurrency.map((c) => (
                <Stat
                  key={c.currency}
                  label={`Valor garantizado / verificable (${c.currency})`}
                  value={`${formatMoney(c.guaranteed, c.currency, true)} / ${c.verifiable === null ? '—' : formatMoney(c.verifiable, c.currency, true)}`}
                  caption={
                    c.coverageRatio === null
                      ? `Cobertura no determinable (${c.determinable} de ${c.total} garantías con valuación)`
                      : `Cobertura ${formatNumber(c.coverageRatio, 2)}× sobre ${c.determinable} de ${c.total} garantías con valuación`
                  }
                />
              ))}
            </StatRow>
          ) : null}
          {query.data.demoGuarantees > 0 ? (
            <Callout tone="info">
              Los indicadores solo cuentan datos reales. Hay {query.data.demoGuarantees} garantía(s)
              de demostración; se ven en la tabla si marcás «Incluir demostraciones».
            </Callout>
          ) : null}
          <Panel title="Cartera" subtitle="Ordenada por urgencia: primero lo que requiere acción.">
            <div className={styles.filters}>
              <SearchInput
                aria-label="Buscar"
                placeholder="Buscar código, productor, establecimiento o CUIT"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <Select
                aria-label="Filtrar por estado"
                value={state}
                onChange={(e) => setState(e.target.value)}
              >
                <option value="">Todos los estados</option>
                {STATES.map((s) => (
                  <option key={s} value={s}>
                    {STATE_LABELS[s]}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Filtrar por riesgo"
                value={risk}
                onChange={(e) => setRisk(e.target.value)}
              >
                <option value="">Todo riesgo</option>
                {Object.entries(RISK_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Filtrar por producción"
                value={production}
                onChange={(e) => setProduction(e.target.value)}
              >
                <option value="">Toda producción</option>
                {Object.entries(PRODUCTION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
              <Checkbox
                label="Incluir demostraciones"
                checked={includeDemo}
                onChange={(e) => setIncludeDemo(e.target.checked)}
              />
            </div>
            <DataTable<GuaranteeRow>
              caption="Garantías bovinas"
              rows={query.data.items}
              rowKey={(r) => r.id}
              onRowClick={(r) => router.push(`/guarantees/${r.id}`)}
              empty={
                <EmptyState title="Sin garantías">
                  Las garantías bovinas nacen al crear una solicitud de tipo Bovinos.
                </EmptyState>
              }
              columns={[
                {
                  key: 'code',
                  header: 'Garantía',
                  render: (r) => (
                    <span data-testid={`guarantee-row-${r.code}`}>
                      <strong>{r.code}</strong>
                      <br />
                      <span className={styles.muted}>{PRODUCTION_LABELS[r.productionType]}</span>
                    </span>
                  ),
                },
                {
                  key: 'producer',
                  header: 'Productor',
                  render: (r) => <DemoName name={r.producerName} dataSource={r.dataSource} />,
                },
                {
                  key: 'est',
                  header: 'Establecimiento',
                  render: (r) => r.establishmentName ?? '—',
                },
                {
                  key: 'heads',
                  header: 'Cabezas (esp. / verif.)',
                  numeric: true,
                  render: (r) =>
                    `${formatNumber(r.expectedHeads ?? r.declaredHeads)} / ${formatNumber(r.verifiableHeads)}`,
                },
                {
                  key: 'amount',
                  header: 'Monto',
                  numeric: true,
                  render: (r) => formatMoney(r.amount, r.currency, true),
                },
                {
                  key: 'coverage',
                  header: 'Cobertura',
                  numeric: true,
                  render: (r) => coverageText(r),
                },
                {
                  key: 'score',
                  header: 'Score',
                  numeric: true,
                  render: (r) => (r.score === null ? '—' : r.score),
                },
                {
                  key: 'risk',
                  header: 'Riesgo',
                  render: (r) =>
                    r.riskLevel ? (
                      <Badge tone={RISK_TONE[r.riskLevel]}>{RISK_LABELS[r.riskLevel]}</Badge>
                    ) : (
                      '—'
                    ),
                },
                {
                  key: 'dates',
                  header: 'Última / próxima',
                  render: (r) =>
                    `${formatDate(r.lastVerificationAt)} / ${formatDate(r.nextVerificationAt)}`,
                },
                {
                  key: 'state',
                  header: 'Estado',
                  render: (r) => (
                    <>
                      <StateBadge state={r.state} />
                      {r.openAlerts ? (
                        <span className={styles.muted}> · {r.openAlerts} alerta(s)</span>
                      ) : null}
                    </>
                  ),
                },
              ]}
            />
          </Panel>
        </div>
      )}
    </>
  );
}
