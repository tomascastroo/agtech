'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { RequestStageBadge } from '@/components/domain/RequestStageBadge';
import { LinkButton } from '@/components/ui/Button';
import { EmptyState, ErrorState, Loading } from '@/components/ui/Feedback';
import { CellTitle, DataTable } from '@/components/ui/Table';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { api } from '@/lib/api/client';
import type { GuaranteeRequest, Unit } from '@/lib/api/types';
import { formatNumber, unitLabel } from '@/lib/format';

/** Solicitudes de garantía de la entidad: el productor declara, AgroGarantías verifica. */
export function RequestsView() {
  const router = useRouter();
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
          <LinkButton href="/requests/new" icon="plus">
            Nueva solicitud de garantía
          </LinkButton>
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
        <Panel flush>
          <DataTable<GuaranteeRequest>
            caption="Solicitudes de garantía"
            rows={query.data}
            rowKey={(r) => r.id}
            onRowClick={(r) => router.push(`/requests/${r.id}`)}
            columns={[
              {
                key: 'producer',
                header: 'Productor',
                render: (r) => (
                  <CellTitle title={r.producer.name} subtitle={`CUIT ${r.producer.taxId}`} />
                ),
              },
              {
                key: 'type',
                header: 'Tipo de garantía',
                render: (r) => r.guaranteeType.name ?? r.guaranteeType.code,
              },
              {
                key: 'asset',
                header: 'Declaración del productor',
                render: (r) =>
                  r.asset
                    ? `${r.asset.name} · ${formatNumber(r.asset.declaredQuantity)} ${unitLabel(r.asset.unit as Unit, r.asset.declaredQuantity)}`
                    : '—',
              },
              {
                key: 'stage',
                header: 'Estado',
                render: (r) => <RequestStageBadge stage={r.stage} />,
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
      ) : null}
    </>
  );
}
