'use client';

import { useRouter } from 'next/navigation';
import { useDeferredValue, useState } from 'react';
import { AssetStatusBadge, SeverityBadge } from '@/components/domain/StatusBadges';
import styles from '@/components/domain/domain.module.css';
import { Badge } from '@/components/ui/Badge';
import { Button, LinkButton } from '@/components/ui/Button';
import { EmptyState, ErrorState, Loading } from '@/components/ui/Feedback';
import { SearchInput, Select } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { CellTitle, DataTable } from '@/components/ui/Table';
import { useAssets, useAssetTypes } from '@/lib/api/queries';
import type { AssetSummary } from '@/lib/api/types';
import { formatMoney, formatQuantity, formatRelative } from '@/lib/format';
import { ASSET_STATUS_LABELS } from '@/lib/labels';
import { useCan } from '@/lib/permissions';

export function AssetsView() {
  const router = useRouter();
  const can = useCan();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [assetTypeCode, setAssetTypeCode] = useState('');
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search.trim());
  const types = useAssetTypes();
  const { data, isPending, error } = useAssets({
    search: deferredSearch || undefined,
    status: status || undefined,
    assetTypeCode: assetTypeCode || undefined,
    page,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Activos y garantías"
        description="Activos declarados por los productores, su última verificación y su estado como garantía."
        actions={
          can('assets:write') ? (
            <LinkButton href="/assets/new" variant="primary" icon="plus">
              Nuevo activo
            </LinkButton>
          ) : null
        }
      />
      <div className={styles.filters} role="search">
        <SearchInput
          placeholder="Buscar por activo, establecimiento o titular"
          aria-label="Buscar activos"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          aria-label="Filtrar por estado"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos los estados</option>
          {Object.entries(ASSET_STATUS_LABELS).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filtrar por tipo"
          value={assetTypeCode}
          onChange={(e) => {
            setAssetTypeCode(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos los tipos</option>
          {types.data?.map((t) => (
            <option key={t.code} value={t.code}>
              {t.name}
            </option>
          ))}
        </Select>
      </div>
      {error ? <ErrorState error={error} /> : null}
      <Panel
        flush
        footer={data ? `${data.total} ${data.total === 1 ? 'activo' : 'activos'}` : undefined}
      >
        {isPending ? (
          <Loading />
        ) : data ? (
          <DataTable<AssetSummary>
            caption="Activos"
            rows={data.items}
            rowKey={(a) => a.id}
            onRowClick={(a) => router.push(`/assets/${a.id}`)}
            empty={
              <EmptyState icon="layers" title="No hay activos que coincidan con los filtros">
                Probá con otros criterios de búsqueda.
              </EmptyState>
            }
            columns={[
              {
                key: 'name',
                header: 'Activo',
                render: (a) => (
                  <CellTitle
                    title={a.name}
                    subtitle={
                      a.establishment
                        ? `${a.establishment.name} · ${a.establishment.locality ?? a.establishment.province}`
                        : undefined
                    }
                  />
                ),
              },
              { key: 'type', header: 'Tipo', render: (a) => a.assetType?.name ?? '—' },
              {
                key: 'declared',
                header: 'Declarado',
                numeric: true,
                render: (a) => (
                  <CellTitle
                    title={formatQuantity(a.declaredQuantity, a.unit)}
                    subtitle={formatMoney(a.declaredValue, a.currency, true)}
                  />
                ),
              },
              {
                key: 'detected',
                header: 'Verificado',
                numeric: true,
                render: (a) => formatQuantity(a.lastDetectedQuantity, a.unit),
              },
              {
                key: 'score',
                header: 'Score',
                numeric: true,
                render: (a) => (a.lastScore !== null ? <strong>{a.lastScore}</strong> : '—'),
              },
              {
                key: 'status',
                header: 'Estado',
                render: (a) => (
                  <span className={styles.inline}>
                    <AssetStatusBadge status={a.status} />
                    {a.guaranteeActive ? (
                      <Badge tone="outline" icon="shield">
                        Garantía
                      </Badge>
                    ) : null}
                  </span>
                ),
              },
              {
                key: 'alerts',
                header: 'Alertas',
                render: (a) =>
                  a.openAlerts && a.highestAlertSeverity ? (
                    <SeverityBadge severity={a.highestAlertSeverity} />
                  ) : (
                    <span className={styles.small}>—</span>
                  ),
              },
              {
                key: 'verified',
                header: 'Última verificación',
                render: (a) => formatRelative(a.lastVerifiedAt),
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
