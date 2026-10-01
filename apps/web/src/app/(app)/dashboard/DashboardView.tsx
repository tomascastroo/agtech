'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BarList } from '@/components/charts/BarList';
import { RiskDistribution } from '@/components/charts/RiskDistribution';
import { OutcomeBadge, RunStatusBadge, SeverityBadge } from '@/components/domain/StatusBadges';
import styles from '@/components/domain/domain.module.css';
import { LinkButton } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Grid, Panel } from '@/components/ui/Panel';
import { Stat, StatRow } from '@/components/ui/Stat';
import { CellTitle, DataTable } from '@/components/ui/Table';
import { useDashboard, useSession } from '@/lib/api/queries';
import type { DashboardSummary } from '@/lib/api/types';
import {
  formatDate,
  formatMoney,
  formatNumber,
  formatPercent,
  formatQuantity,
  formatRelative,
} from '@/lib/format';
import { useCan } from '@/lib/permissions';

type LatestRun = DashboardSummary['latestVerifications'][number];

export function DashboardView() {
  const router = useRouter();
  const can = useCan();
  const session = useSession();
  const { data, isPending, error } = useDashboard();

  return (
    <>
      <PageHeader
        title="Panel de cartera"
        description={
          session.data ? `${session.data.organizationName} · ${formatDate(new Date())}` : undefined
        }
        actions={
          <>
            <LinkButton href="/monitoring" icon="map">
              Mis garantías
            </LinkButton>
            {can('assets:write') ? (
              <LinkButton href="/assets/new" variant="primary" icon="plus">
                Nuevo activo
              </LinkButton>
            ) : null}
          </>
        }
      />
      {error ? <ErrorState error={error} /> : null}
      {isPending ? (
        <StatRow>
          {Array.from({ length: 5 }, (_, i) => (
            <Stat key={i} label=" " value={<Skeleton height={28} width={80} />} />
          ))}
        </StatRow>
      ) : null}
      {data ? (
        <div className={styles.stack}>
          <StatRow>
            <Stat
              label="Activos en cartera"
              value={formatNumber(data.kpis.portfolioAssets)}
              caption={`${formatNumber(data.kpis.monitoredAssets)} con monitoreo activo`}
              testId="kpi-assets"
            />
            <Stat
              label="Garantías activas"
              value={formatNumber(data.kpis.activeGuarantees)}
              caption={`${formatMoney(data.kpis.guaranteedValueUsd, 'USD', true)} en garantía`}
              testId="kpi-guarantees"
            />
            <Stat
              label="Verificados"
              value={formatNumber(data.kpis.verified)}
              caption="último resultado satisfactorio"
              accent="var(--success-mark)"
            />
            <Stat
              label="En revisión"
              value={formatNumber(data.kpis.inReview)}
              caption="con observaciones o en curso"
              accent="var(--warning-mark)"
            />
            <Stat
              label="Con alertas"
              value={formatNumber(data.kpis.withAlerts)}
              caption={
                <Link href="/alerts">{formatNumber(data.kpis.openAlerts)} alertas abiertas</Link>
              }
              accent="var(--critical-mark)"
            />
          </StatRow>

          <Grid columns="main-side">
            <Panel
              title="Valor declarado por tipo de activo"
              subtitle={`Total ${formatMoney(data.risk.portfolioValueUsd)}`}
            >
              {data.byAssetType.length > 0 ? (
                <BarList
                  label="Valor declarado por tipo de activo"
                  items={data.byAssetType.map((t) => ({
                    key: t.code,
                    label: t.name,
                    value: t.declaredValueUsd,
                    detail: `${t.count} ${t.count === 1 ? 'activo' : 'activos'} · score ${t.averageScore ?? '—'}`,
                  }))}
                  formatValue={(v) => formatMoney(v, 'USD', true)}
                />
              ) : (
                <EmptyState title="Sin activos en cartera" />
              )}
            </Panel>
            <Panel title="Riesgo de la cartera" subtitle="Score ponderado por valor declarado">
              <div className={styles.stackTight}>
                <div>
                  <span className={styles.keyNumber} data-testid="weighted-score">
                    {data.risk.weightedScore ?? '—'}
                  </span>
                  <span className={styles.muted}> / 100</span>
                </div>
                <RiskDistribution distribution={data.risk.distribution} />
                <hr className={styles.divider} />
                <div className={styles.sectionTitle}>Alertas abiertas por severidad</div>
                <div className={styles.inline}>
                  {(['CRITICAL', 'WARNING', 'INFO'] as const).map((s) => (
                    <Link key={s} href={`/alerts?severity=${s}`} style={{ textDecoration: 'none' }}>
                      <SeverityBadge severity={s} />{' '}
                      <strong className="tabular" style={{ color: 'var(--text-primary)' }}>
                        {data.alertsBySeverity[s] ?? 0}
                      </strong>
                    </Link>
                  ))}
                </div>
              </div>
            </Panel>
          </Grid>

          <Grid columns="main-side">
            <Panel
              title="Últimas verificaciones"
              actions={
                <LinkButton href="/verifications" variant="ghost" size="sm">
                  Ver todas
                </LinkButton>
              }
              flush
            >
              <DataTable<LatestRun>
                caption="Últimas verificaciones"
                rows={data.latestVerifications}
                rowKey={(r) => r.id}
                onRowClick={(r) => router.push(`/assets/${r.assetId}/verification?run=${r.id}`)}
                empty={<EmptyState title="Todavía no hay verificaciones" />}
                columns={[
                  {
                    key: 'asset',
                    header: 'Activo',
                    render: (r) => (
                      <CellTitle
                        title={r.assetName}
                        subtitle={`${r.typeName} · ${r.establishmentName}`}
                      />
                    ),
                  },
                  {
                    key: 'result',
                    header: 'Detectado / declarado',
                    numeric: true,
                    render: (r) =>
                      r.detectedQuantity !== null && r.unit ? (
                        <CellTitle
                          title={formatQuantity(r.detectedQuantity, r.unit)}
                          subtitle={`de ${formatNumber(r.declaredQuantity)} · ${formatPercent(r.matchPercentage, 0)}`}
                        />
                      ) : (
                        '—'
                      ),
                  },
                  {
                    key: 'score',
                    header: 'Score',
                    numeric: true,
                    render: (r) => (r.finalScore !== null ? <strong>{r.finalScore}</strong> : '—'),
                  },
                  {
                    key: 'outcome',
                    header: 'Resultado',
                    render: (r) =>
                      r.outcome ? (
                        <OutcomeBadge outcome={r.outcome} />
                      ) : (
                        <RunStatusBadge status={r.status} />
                      ),
                  },
                  {
                    key: 'when',
                    header: 'Fecha',
                    render: (r) => formatRelative(r.completedAt ?? r.queuedAt),
                  },
                ]}
              />
            </Panel>
            <Panel
              title="Alertas recientes"
              actions={
                <LinkButton href="/alerts" variant="ghost" size="sm">
                  Ver todas
                </LinkButton>
              }
            >
              {data.recentAlerts.length === 0 ? (
                <p className={styles.muted}>Sin alertas abiertas.</p>
              ) : (
                <ul className={styles.timeline}>
                  {data.recentAlerts.map((a) => (
                    <li key={a.id} className={styles.timelineItem}>
                      <span
                        className={`${styles.timelineDot} ${a.severity === 'CRITICAL' ? styles.timelineDotCritical : a.severity === 'WARNING' ? styles.timelineDotWarning : styles.timelineDotInfo}`}
                        aria-hidden
                      />
                      <div>
                        <Link href={`/assets/${a.assetId}?tab=alerts`}>{a.title}</Link>
                        <div className={styles.timelineMeta}>
                          {a.assetName} · {a.establishmentName} · {formatRelative(a.createdAt)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </Grid>
        </div>
      ) : null}
    </>
  );
}
