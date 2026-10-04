'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { RequestStageBadge } from '@/components/domain/RequestStageBadge';
import { DemoBadge } from '@/components/domain/StatusBadges';
import domain from '@/components/domain/domain.module.css';
import { Badge } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { SearchInput, Select } from '@/components/ui/Field';
import { EmptyState, ErrorState, Loading } from '@/components/ui/Feedback';
import { CellTitle, DataTable } from '@/components/ui/Table';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { api } from '@/lib/api/client';
import { useDemoMode } from '@/lib/api/queries';
import type { GuaranteeRequest, Unit } from '@/lib/api/types';
import { formatNumber, formatRelative, unitLabel } from '@/lib/format';

type Filter = 'ALL' | 'ACTION' | 'VERIFYING' | 'VERIFIED' | 'DEMO';

/** ¿La solicitud necesita algo de la entidad? (documentación inconsistente o para revisar). */
const needsAction = (r: GuaranteeRequest) =>
  (r.documentation?.summary.attention ?? 0) > 0 || r.stage === 'VERIFICATION_FAILED';

const matches = (r: GuaranteeRequest, filter: Filter, text: string) => {
  if (filter === 'ACTION' && !needsAction(r)) return false;
  if (filter === 'VERIFYING' && r.stage !== 'READY_FOR_VERIFICATION') return false;
  if (filter === 'VERIFIED' && r.stage !== 'VERIFIED') return false;
  if (filter === 'DEMO' && r.dataSource !== 'DEMO') return false;
  const q = text.trim().toLowerCase();
  return (
    !q ||
    [r.producer.name, r.producer.taxId, r.asset?.name ?? '', r.establishment?.name ?? '']
      .join(' ')
      .toLowerCase()
      .includes(q)
  );
};

/** Solicitudes de garantía de la entidad: el productor declara, AgroGarantías verifica. */
export function RequestsView() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [text, setText] = useState('');
  const demoMode = useDemoMode();
  const query = useQuery({
    queryKey: ['guarantee-requests'],
    queryFn: () => api<GuaranteeRequest[]>('/guarantee-requests'),
    refetchInterval: 15_000,
  });
  return (
    <>
      <PageHeader
        title="Solicitudes de garantía"
        description="El productor declara su activo y aporta evidencia; AgroGarantías verifica y la entidad evalúa el resultado."
        actions={
          <div className={domain.inline}>
            {demoMode ? (
              <LinkButton href="/requests/new?modo=demo" variant="secondary">
                Simular solicitud
              </LinkButton>
            ) : null}
            <LinkButton href="/requests/new" icon="plus" variant="primary">
              Nueva solicitud
            </LinkButton>
          </div>
        }
      />
      {query.isPending ? <Loading /> : null}
      {query.isError ? <ErrorState error={query.error} /> : null}
      {query.data && query.data.length === 0 ? (
        <EmptyState title="Todavía no hay solicitudes">
          Creá una solicitud y compartí el link con el productor.
        </EmptyState>
      ) : null}
      {query.data && query.data.length > 0 ? (
        <>
          <div className={domain.filters}>
            <SearchInput
              placeholder="Buscar productor, CUIT, establecimiento o activo"
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="Buscar solicitudes"
            />
            <Select
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
              aria-label="Filtrar solicitudes"
            >
              <option value="ALL">Todas</option>
              <option value="ACTION">Requieren acción de la entidad</option>
              <option value="VERIFYING">En verificación</option>
              <option value="VERIFIED">Verificadas</option>
              <option value="DEMO">Demostración</option>
            </Select>
          </div>
          <Panel flush>
            <DataTable<GuaranteeRequest>
              caption="Solicitudes de garantía"
              rows={query.data.filter((r) => matches(r, filter, text))}
              empty={<div style={{ padding: 20 }}>Ninguna solicitud coincide con el filtro.</div>}
              rowKey={(r) => r.id}
              onRowClick={(r) => router.push(`/requests/${r.id}`)}
              columns={[
                {
                  key: 'producer',
                  header: 'Productor',
                  render: (r) => (
                    <span className={domain.inline}>
                      <CellTitle title={r.producer.name} subtitle={`CUIT ${r.producer.taxId}`} />
                      {r.dataSource === 'DEMO' ? <DemoBadge /> : null}
                    </span>
                  ),
                },
                {
                  key: 'asset',
                  header: 'Garantía',
                  render: (r) => (
                    <CellTitle
                      title={r.guaranteeType.name ?? r.guaranteeType.code}
                      subtitle={
                        r.asset
                          ? `${r.asset.name} · ${formatNumber(r.asset.declaredQuantity)} ${unitLabel(r.asset.unit as Unit, r.asset.declaredQuantity)}`
                          : 'Sin declarar'
                      }
                    />
                  ),
                },
                {
                  key: 'docs',
                  header: 'Documentación',
                  render: (r) => {
                    const s = r.documentation?.summary;
                    if (!s) return '—';
                    return (
                      <span className={domain.inline}>
                        <span className="tabular">
                          {s.consistent}/{s.total - s.notApplicable}
                        </span>
                        {s.attention > 0 ? (
                          <Badge tone="critical" icon="warning">
                            {s.attention} a revisar
                          </Badge>
                        ) : s.mandatoryMissing > 0 ? (
                          <Badge tone="warning" dot>
                            {s.mandatoryMissing} pendiente{s.mandatoryMissing === 1 ? '' : 's'}
                          </Badge>
                        ) : null}
                      </span>
                    );
                  },
                },
                {
                  key: 'stage',
                  header: 'Estado',
                  render: (r) => <RequestStageBadge stage={r.stage} />,
                },
                {
                  key: 'created',
                  header: 'Creada',
                  render: (r) => formatRelative(r.createdAt),
                },
                {
                  key: 'score',
                  header: 'Score',
                  numeric: true,
                  render: (r) =>
                    r.verification?.finalScore != null ? `${r.verification.finalScore}/100` : '—',
                },
              ]}
            />
          </Panel>
        </>
      ) : null}
    </>
  );
}
