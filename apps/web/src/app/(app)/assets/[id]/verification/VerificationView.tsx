'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AssetStatusBadge, DemoBadge, RunStatusBadge } from '@/components/domain/StatusBadges';
import { VerificationProgress } from '@/components/domain/VerificationProgress';
import { VerificationResultView } from '@/components/domain/VerificationResult';
import styles from '@/components/domain/domain.module.css';
import { Button } from '@/components/ui/Button';
import { Callout, ErrorState, Loading } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { DescriptionList, Panel } from '@/components/ui/Panel';
import { api, ApiError } from '@/lib/api/client';
import { keys, useAsset, useDevices, useDocuments, useVerification } from '@/lib/api/queries';
import type { AssetDetail, Paginated, VerificationRun } from '@/lib/api/types';
import { formatQuantity, formatRelative } from '@/lib/format';
import { STRATEGY_DESCRIPTIONS } from '@/lib/labels';
import { useCan } from '@/lib/permissions';

function StartPanel({
  asset,
  onStarted,
}: {
  asset: AssetDetail;
  onStarted: (runId: string) => void;
}) {
  const can = useCan();
  const documents = useDocuments(asset.id);
  const devices = useDevices(asset.id);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const missingDocs = documents.data?.requirements.filter((r) => !r.satisfied).length ?? 0;
  const cameras = (devices.data ?? []).filter(
    (d) => d.device && ['FIXED_CAMERA', 'SOLAR_CAMERA'].includes(d.device.type),
  );
  const online = cameras.filter((d) => d.device?.status === 'ONLINE').length;
  const strategy = asset.assetType.verificationStrategy;

  const start = async () => {
    setError(null);
    setStarting(true);
    try {
      const run = await api<{ id: string }>(`/assets/${asset.id}/verifications`, {
        method: 'POST',
        body: {},
      });
      onStarted(run.id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const active = await api<Paginated<VerificationRun>>(
          `/verifications?assetId=${asset.id}&pageSize=5`,
        ).catch(() => null);
        const running = active?.items.find(
          (r) => r.status === 'PENDING' || r.status === 'PROCESSING',
        );
        if (running) return onStarted(running.id);
      }
      setError(e instanceof ApiError ? e.message : 'No fue posible iniciar la verificación.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <Panel title="Nueva verificación" subtitle={STRATEGY_DESCRIPTIONS[strategy]}>
      <div className={styles.stack}>
        <DescriptionList
          items={[
            ['Declarado', formatQuantity(asset.declaredQuantity, asset.unit)],
            ...(strategy === 'LIVESTOCK_COUNTING' || cameras.length > 0
              ? ([
                  [
                    'Cámaras',
                    cameras.length
                      ? `${online} de ${cameras.length} en línea`
                      : 'Sin cámaras registradas (se usan las imágenes cargadas)',
                  ],
                ] as [string, string][])
              : []),
            [
              'Documentación',
              missingDocs ? `Faltan ${missingDocs} documento(s) requerido(s)` : 'Completa',
            ],
            [
              'Última verificación',
              asset.lastVerifiedAt ? formatRelative(asset.lastVerifiedAt) : 'Nunca',
            ],
          ]}
        />
        {missingDocs > 0 ? (
          <Callout tone="warning">
            La documentación faltante reduce el componente “Documentación” del score.
          </Callout>
        ) : null}
        {error ? <Callout tone="critical">{error}</Callout> : null}
        <div>
          {can('verifications:run') ? (
            <Button
              variant="primary"
              size="lg"
              icon="shield"
              loading={starting}
              onClick={() => void start()}
              data-testid="start-verification"
            >
              Iniciar verificación
            </Button>
          ) : (
            <p className={styles.muted}>Tu rol no permite ejecutar verificaciones.</p>
          )}
        </div>
      </div>
    </Panel>
  );
}

export function VerificationView() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const asset = useAsset(id);
  const startRequested = search.get('start') === '1';
  const runId =
    search.get('run') ?? (startRequested ? null : (asset.data?.lastVerificationRunId ?? null));
  const run = useVerification(runId);
  const lastStatus = useRef<string | null>(null);

  useEffect(() => {
    const status = run.data?.status ?? null;
    if (
      lastStatus.current &&
      lastStatus.current !== status &&
      (status === 'COMPLETED' || status === 'FAILED')
    ) {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.asset(id) }),
        queryClient.invalidateQueries({ queryKey: ['verifications'] }),
        queryClient.invalidateQueries({ queryKey: keys.dashboard }),
        queryClient.invalidateQueries({ queryKey: keys.portfolio }),
        queryClient.invalidateQueries({ queryKey: ['alerts'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ]);
    }
    lastStatus.current = status;
  }, [run.data?.status, id, queryClient]);

  if (asset.isPending) return <Loading />;
  if (asset.isError) return <ErrorState error={asset.error} />;
  const a = asset.data;
  const onStarted = (newRunId: string) => {
    lastStatus.current = 'PENDING';
    router.replace(`/assets/${id}/verification?run=${newRunId}`);
  };
  const inProgress =
    run.data && (run.data.status === 'PENDING' || run.data.status === 'PROCESSING');

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: '/assets', label: 'Activos y garantías' },
          { href: `/assets/${id}`, label: a.name },
        ]}
        title="Verificación"
        badge={
          <>
            {run.data ? (
              <RunStatusBadge status={run.data.status} />
            ) : (
              <AssetStatusBadge status={a.status} />
            )}
            {a.dataSource === 'DEMO' ? <DemoBadge /> : null}
          </>
        }
        description={`${a.name} · ${a.assetType.name} · ${a.establishment.name}`}
        actions={
          runId && run.data && !inProgress ? (
            <Button
              icon="refresh"
              onClick={() => router.replace(`/assets/${id}/verification?start=1`)}
            >
              Nueva verificación
            </Button>
          ) : null
        }
      />
      {!runId ? <StartPanel asset={a} onStarted={onStarted} /> : null}
      {runId && run.isPending ? <Loading label="Cargando verificación…" /> : null}
      {run.isError ? <ErrorState error={run.error} /> : null}
      {run.data && run.data.status !== 'COMPLETED' ? (
        <div className={styles.stack}>
          <Panel title={inProgress ? 'Verificación en curso' : 'Verificación fallida'}>
            <VerificationProgress run={run.data} strategy={a.assetType.verificationStrategy} />
          </Panel>
          {run.data.status === 'FAILED' ? <StartPanel asset={a} onStarted={onStarted} /> : null}
        </div>
      ) : null}
      {run.data && run.data.status === 'COMPLETED' ? (
        <VerificationResultView run={run.data} asset={a} />
      ) : null}
    </>
  );
}
