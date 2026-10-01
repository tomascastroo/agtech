'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { PortfolioStateBadge, RiskBadge, SeverityBadge } from '@/components/domain/StatusBadges';
import styles from '@/components/domain/domain.module.css';
import { MapLegend, MapView, STATE_COLORS } from '@/components/map/MapView';
import { Badge } from '@/components/ui/Badge';
import { Button, LinkButton } from '@/components/ui/Button';
import { EmptyState, ErrorState, Loading } from '@/components/ui/Feedback';
import { Checkbox, SearchInput, Select } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { DescriptionList, Panel } from '@/components/ui/Panel';
import { Stat, StatRow } from '@/components/ui/Stat';
import { CellTitle, DataTable } from '@/components/ui/Table';
import { useEvents, usePortfolio } from '@/lib/api/queries';
import type { PortfolioRow } from '@/lib/api/types';
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  formatQuantity,
  formatRelative,
} from '@/lib/format';
import { EVENT_LABELS, PORTFOLIO_STATE_LABELS } from '@/lib/labels';

const STATES = ['OK', 'ALERTA', 'EN_REVISION', 'OBSERVADO'] as const;

function EventsTimeline({ assetId }: { assetId?: string }) {
  const events = useEvents(assetId);
  if (events.isPending) return <Loading />;
  if (events.isError) return <ErrorState error={events.error} />;
  if (events.data.length === 0) return <p className={styles.muted}>Sin eventos registrados.</p>;
  return (
    <ul className={`${styles.timeline} ${styles.scrollPanel}`}>
      {events.data.slice(0, 20).map((e) => (
        <li key={e.id} className={styles.timelineItem}>
          <span
            className={`${styles.timelineDot} ${e.severity === 'CRITICAL' ? styles.timelineDotCritical : e.severity === 'WARNING' ? styles.timelineDotWarning : styles.timelineDotInfo}`}
            aria-hidden
          />
          <div>
            <div>
              {e.message.startsWith(EVENT_LABELS[e.type] ?? e.type) ? (
                e.message
              ) : (
                <>
                  <strong style={{ fontWeight: 600 }}>{EVENT_LABELS[e.type] ?? e.type}</strong> ·{' '}
                  {e.message}
                </>
              )}
            </div>
            <div className={styles.timelineMeta}>{formatDateTime(e.occurredAt)}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function SelectedAsset({ row, onClose }: { row: PortfolioRow; onClose: () => void }) {
  return (
    <Panel
      title={row.assetName}
      subtitle={`${row.assetTypeName} · ${row.establishmentName}`}
      actions={
        <Button variant="ghost" size="sm" icon="x" onClick={onClose} aria-label="Cerrar detalle" />
      }
    >
      <div className={styles.stackTight}>
        <div className={styles.inline}>
          <PortfolioStateBadge state={row.state} />
          {row.riskLevel ? <RiskBadge level={row.riskLevel} /> : null}
        </div>
        <DescriptionList
          items={[
            ['Titular', row.holderName],
            ['Provincia', row.province],
            ['Declarado', formatQuantity(row.declaredQuantity, row.unit)],
            ['Verificado', formatQuantity(row.quantity, row.unit)],
            ['Score', row.lastScore ?? '—'],
            ['Última verificación', formatRelative(row.lastVerifiedAt)],
            ['Valor declarado', formatMoney(row.declaredValue, row.currency)],
            [
              'Alertas abiertas',
              row.openAlerts ? (
                <span key="a" className={styles.inline}>
                  {row.openAlerts}{' '}
                  {row.highestSeverity ? <SeverityBadge severity={row.highestSeverity} /> : null}
                </span>
              ) : (
                '0'
              ),
            ],
          ]}
        />
        <div className={styles.inline}>
          <LinkButton href={`/assets/${row.assetId}`} size="sm" variant="primary">
            Ver activo
          </LinkButton>
          <LinkButton href={`/assets/${row.assetId}/verification`} size="sm">
            Última verificación
          </LinkButton>
        </div>
        <hr className={styles.divider} />
        <div className={styles.sectionTitle}>Eventos del activo</div>
        <EventsTimeline assetId={row.assetId} />
      </div>
    </Panel>
  );
}

export function MonitoringView() {
  const router = useRouter();
  const portfolio = usePortfolio();
  const [state, setState] = useState('');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [onlyGuarantees, setOnlyGuarantees] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const text = search.trim().toLowerCase();
    return (portfolio.data ?? []).filter(
      (r) =>
        (!state || r.state === state) &&
        (!type || r.assetTypeCode === type) &&
        (!onlyGuarantees || r.guaranteeActive) &&
        (!text ||
          `${r.assetName} ${r.establishmentName} ${r.holderName}`.toLowerCase().includes(text)),
    );
  }, [portfolio.data, state, type, search, onlyGuarantees]);
  const types = useMemo(
    () =>
      Array.from(
        new Map((portfolio.data ?? []).map((r) => [r.assetTypeCode, r.assetTypeName])).entries(),
      ),
    [portfolio.data],
  );
  const counts = STATES.reduce<Record<string, number>>(
    (acc, s) => ({ ...acc, [s]: (portfolio.data ?? []).filter((r) => r.state === s).length }),
    {},
  );
  const selected = rows.find((r) => r.assetId === selectedId) ?? null;

  return (
    <>
      <PageHeader
        title="Mis garantías"
        description="Estado de cada activo de la cartera, actualizado con cada verificación programada y cada evento de monitoreo."
      />
      {portfolio.isError ? <ErrorState error={portfolio.error} /> : null}
      {portfolio.isPending ? <Loading /> : null}
      {portfolio.data ? (
        <div className={styles.stack}>
          <StatRow>
            {STATES.map((s) => (
              <Stat
                key={s}
                label={PORTFOLIO_STATE_LABELS[s]!}
                value={formatNumber(counts[s])}
                accent={STATE_COLORS[s]}
                caption={
                  s === 'OK'
                    ? 'verificados sin alertas'
                    : s === 'ALERTA'
                      ? 'con alertas críticas o de advertencia'
                      : s === 'EN_REVISION'
                        ? 'en alta o verificación'
                        : 'con observaciones'
                }
                testId={`state-${s}`}
              />
            ))}
          </StatRow>
          <div className={styles.filters} role="search" style={{ marginBottom: 0 }}>
            <SearchInput
              placeholder="Buscar activo, establecimiento o titular"
              aria-label="Buscar en la cartera"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              aria-label="Filtrar por estado"
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              <option value="">Todos los estados</option>
              {STATES.map((s) => (
                <option key={s} value={s}>
                  {PORTFOLIO_STATE_LABELS[s]}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filtrar por tipo"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">Todos los tipos</option>
              {types.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </Select>
            <Checkbox
              label="Solo garantías confirmadas"
              checked={onlyGuarantees}
              onChange={(e) => setOnlyGuarantees(e.target.checked)}
            />
          </div>
          <div className={styles.mapLayout}>
            <Panel flush>
              <MapView
                label="Mapa de la cartera por estado"
                height={460}
                points={rows.map((r) => ({
                  id: r.assetId,
                  coordinates: r.location.coordinates,
                  color: STATE_COLORS[r.state] ?? '#5b6670',
                  label: `${r.assetName} · ${PORTFOLIO_STATE_LABELS[r.state]}`,
                  selected: r.assetId === selectedId,
                }))}
                onSelect={setSelectedId}
              >
                <MapLegend
                  items={STATES.map((s) => ({
                    color: STATE_COLORS[s]!,
                    label: PORTFOLIO_STATE_LABELS[s]!,
                  }))}
                />
              </MapView>
            </Panel>
            {selected ? (
              <SelectedAsset row={selected} onClose={() => setSelectedId(null)} />
            ) : (
              <Panel
                title="Actividad reciente"
                subtitle="Seleccioná un punto del mapa para ver el detalle del activo."
              >
                <EventsTimeline />
              </Panel>
            )}
          </div>
          <Panel flush footer={`${rows.length} de ${portfolio.data.length} activos`}>
            <DataTable<PortfolioRow>
              caption="Cartera"
              rows={rows}
              rowKey={(r) => r.assetId}
              onRowClick={(r) => router.push(`/assets/${r.assetId}`)}
              empty={
                <EmptyState icon="map" title="No hay activos para los filtros seleccionados" />
              }
              columns={[
                {
                  key: 'asset',
                  header: 'Activo',
                  render: (r) => (
                    <CellTitle
                      title={r.assetName}
                      subtitle={`${r.establishmentName} · ${r.holderName}`}
                    />
                  ),
                },
                { key: 'type', header: 'Tipo', render: (r) => r.assetTypeName },
                {
                  key: 'qty',
                  header: 'Verificado / declarado',
                  numeric: true,
                  render: (r) => (
                    <CellTitle
                      title={formatQuantity(r.quantity, r.unit)}
                      subtitle={`de ${formatNumber(r.declaredQuantity, r.unit === 'HECTARE' ? 1 : 0)}`}
                    />
                  ),
                },
                {
                  key: 'score',
                  header: 'Score',
                  numeric: true,
                  render: (r) => (r.lastScore !== null ? <strong>{r.lastScore}</strong> : '—'),
                },
                {
                  key: 'state',
                  header: 'Estado',
                  render: (r) => <PortfolioStateBadge state={r.state} />,
                },
                {
                  key: 'alerts',
                  header: 'Alertas',
                  render: (r) =>
                    r.openAlerts && r.highestSeverity ? (
                      <Link
                        href={`/assets/${r.assetId}?tab=alerts`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <SeverityBadge severity={r.highestSeverity} />
                      </Link>
                    ) : (
                      <span className={styles.small}>—</span>
                    ),
                },
                {
                  key: 'verified',
                  header: 'Última verificación',
                  render: (r) => formatRelative(r.lastVerifiedAt),
                },
                {
                  key: 'guarantee',
                  header: 'Garantía',
                  render: (r) =>
                    r.guaranteeActive ? (
                      <Badge tone="outline" icon="shield">
                        Activa
                      </Badge>
                    ) : (
                      <span className={styles.small}>—</span>
                    ),
                },
              ]}
            />
          </Panel>
        </div>
      ) : null}
    </>
  );
}
