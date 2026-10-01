'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ErrorState, Loading } from '@/components/ui/Feedback';
import { Panel } from '@/components/ui/Panel';
import { DataTable } from '@/components/ui/Table';
import { api } from '@/lib/api/client';
import { useApiMutation } from '@/lib/api/queries';
import type { RfidReading } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import { useCan } from '@/lib/permissions';
import styles from './domain.module.css';

const STATUS = {
  IDENTIFIED: { label: 'Identificado', tone: 'success' },
  UNKNOWN_TAG: { label: 'Caravana desconocida', tone: 'warning' },
  OTHER_ESTABLISHMENT: { label: 'De otro establecimiento', tone: 'critical' },
} as const;

interface RfidResponse {
  readings: RfidReading[];
  last30Days: { uniqueTags: number; identifiedTags: number; readings: number };
}

/**
 * Últimas lecturas RFID del activo, tal como llegaron del puente del lector. Las lecturas
 * generadas por la simulación de demo se marcan SIMULADO.
 */
export function RfidReadings({ assetId }: { assetId: string }) {
  const can = useCan();
  const key = ['rfid', assetId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<RfidResponse>(`/assets/${assetId}/rfid/observations`),
  });
  const simulate = useApiMutation(
    () => api(`/assets/${assetId}/rfid/simulate`, { method: 'POST' }),
    [key],
  );
  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} />;
  const { readings, last30Days } = query.data;
  return (
    <Panel
      title="Últimas lecturas RFID"
      subtitle={`Últimos 30 días: ${last30Days.identifiedTags} caravanas identificadas de ${last30Days.uniqueTags} leídas (${last30Days.readings} lecturas).`}
      actions={
        can('devices:write') ? (
          <Button
            size="sm"
            variant="secondary"
            loading={simulate.isPending}
            onClick={() => simulate.mutate(undefined)}
          >
            Simular lectura (demo)
          </Button>
        ) : null
      }
      flush
    >
      <DataTable
        caption="Últimas lecturas RFID"
        rows={readings}
        rowKey={(r) => r.id}
        empty={
          <div style={{ padding: 20 }} className={styles.muted}>
            Sin lecturas RFID. Las lecturas llegan desde el lector a través de la app puente.
          </div>
        }
        columns={[
          {
            key: 'rfid',
            header: 'RFID',
            render: (r) => (
              <span>
                {r.electronicId}
                {r.officialTag ? (
                  <span className={styles.muted}> · caravana {r.officialTag}</span>
                ) : null}
              </span>
            ),
          },
          { key: 'at', header: 'Fecha/hora', render: (r) => formatDateTime(r.observedAt) },
          { key: 'est', header: 'Establecimiento', render: (r) => r.establishmentName },
          {
            key: 'status',
            header: 'Estado',
            render: (r) => (
              <span className={styles.inline}>
                <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                {r.source === 'SIMULATED' ? <Badge tone="warning">SIMULADO</Badge> : null}
              </span>
            ),
          },
        ]}
      />
    </Panel>
  );
}
