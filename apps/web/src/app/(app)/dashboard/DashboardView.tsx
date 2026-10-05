'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { BarList } from '@/components/charts/BarList';
import { RiskDistribution } from '@/components/charts/RiskDistribution';
import {
  DemoBadge,
  OutcomeBadge,
  RunStatusBadge,
  SeverityBadge,
} from '@/components/domain/StatusBadges';
import styles from '@/components/domain/domain.module.css';
import { LinkButton } from '@/components/ui/Button';
import { Callout, EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Grid, Panel } from '@/components/ui/Panel';
import { Stat, StatRow } from '@/components/ui/Stat';
import { CellTitle, DataTable } from '@/components/ui/Table';
import { useDashboard, useDemoMode, useSession } from '@/lib/api/queries';
import { api } from '@/lib/api/client';
import type { DashboardSummary, GuaranteeRequest } from '@/lib/api/types';
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
  const demoMode = useDemoMode(can('assets:write'));
  const ops = data?.operations;

  return (
    <>
      <PageHeader
        title="Panel de cartera"
        description={
          session.data ? `${session.data.organizationName} · ${formatDate(new Date())}` : undefined
        }
        actions={
          <>
            {can('assets:write') ? (
              <>
                {demoMode ? (
                  <LinkButton href="/requests/new?modo=demo">Simular solicitud</LinkButton>
                ) : null}
                <LinkButton href="/requests/new" variant="primary" icon="plus">
                  Nueva solicitud
                </LinkButton>
              </>
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
              label="Esperando al productor"
              value={formatNumber(ops?.waitingProducer ?? 0)}
              caption={<Link href="/requests">solicitudes en carga</Link>}
              accent="var(--color-warning)"
              testId="kpi-waiting"
            />
            <Stat
              label="Documentación a revisar"
              value={formatNumber(ops?.documentsToReview ?? 0)}
              caption={
                plural(ops?.openInformationRequests ?? 0, 'pedido abierto', 'pedidos abiertos') +
                ' al productor'
              }
              accent="var(--color-danger)"
              testId="kpi-documents"
            />
            <Stat
              label="Verificaciones en curso"
              value={formatNumber(ops?.verificationsInProgress ?? 0)}
              caption={`${plural(ops?.verificationsCompleted30d ?? 0, 'completada', 'completadas')} en 30 días`}
              accent="var(--color-data-1)"
            />
            <Stat
              label="Alertas abiertas"
              value={formatNumber(data.kpis.openAlerts)}
              caption={
                <Link href="/alerts">
                  {plural(data.kpis.withAlerts, 'activo con alertas', 'activos con alertas')}
                </Link>
              }
              accent="var(--color-danger)"
            />
            <Stat
              label="Activos monitoreados"
              value={formatNumber(data.kpis.monitoredAssets)}
              caption={`${formatNumber(data.kpis.activeGuarantees)} garantías activas · ${formatMoney(data.kpis.guaranteedValueUsd, 'USD', true)}`}
              testId="kpi-assets"
            />
            <Stat
              label="Productores"
              value={formatNumber(ops?.producers ?? 0)}
              caption="con solicitudes en la entidad"
              testId="kpi-producers"
            />
          </StatRow>
          {ops?.demoRequests ? (
            <Callout tone="info">
              <span data-testid="dashboard-demo-note">
                Los indicadores, el riesgo y el valor de la cartera incluyen solo datos reales.{' '}
                {plural(
                  ops.demoRequests,
                  'solicitud de demostración',
                  'solicitudes de demostración',
                )}{' '}
                quedan fuera y se listan marcadas como DEMO.
              </span>
            </Callout>
          ) : null}

          <Grid columns="main-side">
            <ActionRequests />
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
                      <strong className="tabular" style={{ color: 'var(--color-text)' }}>
                        {data.alertsBySeverity[s] ?? 0}
                      </strong>
                    </Link>
                  ))}
                </div>
              </div>
            </Panel>
          </Grid>

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
        </div>
      ) : null}
    </>
  );
}

/** Solicitudes en las que la entidad tiene algo que hacer (documentación a revisar, fallas). */
function ActionRequests() {
  const router = useRouter();
  const query = useQuery({
    queryKey: ['guarantee-requests'],
    queryFn: () => api<GuaranteeRequest[]>('/guarantee-requests'),
  });
  const rows = (query.data ?? [])
    .filter(
      (r) =>
        (r.documentation?.summary.attention ?? 0) > 0 ||
        r.stage === 'VERIFICATION_FAILED' ||
        (r.documentation?.summary.mandatoryMissing ?? 0) > 0,
    )
    .slice(0, 6);
  return (
    <Panel
      title="Solicitudes que requieren seguimiento"
      subtitle="Documentación inconsistente, a revisar o pendiente del productor."
      actions={
        <LinkButton href="/requests" variant="ghost" size="sm">
          Ver todas
        </LinkButton>
      }
      flush
    >
      {query.isPending ? (
        <div style={{ padding: 16 }}>
          <Skeleton height={20} />
        </div>
      ) : (
        <DataTable<GuaranteeRequest>
          caption="Solicitudes que requieren seguimiento"
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={(r) => router.push(`/requests/${r.id}`)}
          empty={
            <EmptyState icon="check" title="Nada pendiente">
              No hay documentación para revisar ni solicitudes trabadas.
            </EmptyState>
          }
          columns={[
            {
              key: 'producer',
              header: 'Productor',
              render: (r) => (
                <span className={styles.inline}>
                  <CellTitle
                    title={r.producer.name}
                    subtitle={r.asset?.name ?? 'Sin activo declarado'}
                  />
                  {r.dataSource === 'DEMO' ? <DemoBadge /> : null}
                </span>
              ),
            },
            {
              key: 'why',
              header: 'Motivo',
              render: (r) => {
                const s = r.documentation?.summary;
                if (r.stage === 'VERIFICATION_FAILED') return 'La verificación falló';
                if (s && s.attention > 0)
                  return `${plural(s.attention, 'documento', 'documentos')} a revisar`;
                if (s && s.mandatoryMissing > 0)
                  return plural(
                    s.mandatoryMissing,
                    'documento obligatorio pendiente',
                    'documentos obligatorios pendientes',
                  );
                return '—';
              },
            },
            { key: 'when', header: 'Creada', render: (r) => formatRelative(r.createdAt) },
          ]}
        />
      )}
    </Panel>
  );
}

const plural = (n: number, one: string, many: string) =>
  `${formatNumber(n)} ${n === 1 ? one : many}`;
