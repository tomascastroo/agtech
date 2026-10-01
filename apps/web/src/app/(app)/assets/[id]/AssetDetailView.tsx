'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { LineChart } from '@/components/charts/LineChart';
import { AlertsTable } from '@/components/domain/AlertsTable';
import { DevicesPanel } from '@/components/domain/DevicesPanel';
import { DocumentsPanel } from '@/components/domain/DocumentsPanel';
import { RfidReadings } from '@/components/domain/RfidReadings';
import { EvidenceGallery, fromEvidenceItem } from '@/components/domain/EvidenceGallery';
import { EvidenceUpload } from '@/components/domain/EvidenceUpload';
import { orderedProperties } from '@/components/domain/MetadataForm';
import {
  AssetStatusBadge,
  OutcomeBadge,
  RunStatusBadge,
  SimulatedBadge,
} from '@/components/domain/StatusBadges';
import styles from '@/components/domain/domain.module.css';
import { MapLegend, MapView, type MapPoint, type MapPolygon } from '@/components/map/MapView';
import { Badge } from '@/components/ui/Badge';
import { Button, LinkButton } from '@/components/ui/Button';
import { Callout, ErrorState, Loading } from '@/components/ui/Feedback';
import { Checkbox, Field, FormRow, Input } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { DescriptionList, Grid, Panel } from '@/components/ui/Panel';
import { Stat, StatRow } from '@/components/ui/Stat';
import { CellTitle, DataTable } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { api, ApiError } from '@/lib/api/client';
import {
  keys,
  useAlerts,
  useAnimals,
  useApiMutation,
  useAsset,
  useDevices,
  useEvidence,
  useMonitoringConfig,
  useSatellite,
  useVerifications,
} from '@/lib/api/queries';
import type { AssetDetail, VerificationRun } from '@/lib/api/types';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  formatQuantity,
  formatRelative,
} from '@/lib/format';
import { ESTABLISHMENT_TYPE_LABELS, STRATEGY_DESCRIPTIONS, TENURE_LABELS } from '@/lib/labels';
import { useCan } from '@/lib/permissions';

function MonitoringPanel({ asset }: { asset: AssetDetail }) {
  const can = useCan();
  const config = useMonitoringConfig(asset.id);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ enabled: true, intervalHours: '', maxEvidenceAgeHours: '' });
  const [error, setError] = useState<string | null>(null);
  const save = useApiMutation(
    (body: object) => api(`/assets/${asset.id}/monitoring`, { method: 'PUT', body }),
    [keys.monitoring(asset.id), keys.portfolio],
  );
  if (config.isPending) return <Loading />;
  const data = config.data;
  if (!data) return <p className={styles.muted}>Sin configuración de monitoreo.</p>;

  const startEdit = () => {
    setForm({
      enabled: data.enabled,
      intervalHours: String(data.intervalHours),
      maxEvidenceAgeHours: String(data.maxEvidenceAgeHours),
    });
    setEditing(true);
  };
  const submit = async () => {
    setError(null);
    try {
      await save.mutateAsync({
        enabled: form.enabled,
        intervalHours: Number(form.intervalHours),
        maxEvidenceAgeHours: Number(form.maxEvidenceAgeHours),
      });
      setEditing(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No fue posible guardar.');
    }
  };

  if (editing) {
    return (
      <div className={styles.stackTight}>
        <Checkbox
          label="Verificación automática activa"
          checked={form.enabled}
          onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
        />
        <FormRow columns={2}>
          <Field label="Frecuencia (horas)" hint="1 a 2160">
            {(props) => (
              <Input
                {...props}
                inputMode="numeric"
                value={form.intervalHours}
                onChange={(e) => setForm({ ...form, intervalHours: e.target.value })}
              />
            )}
          </Field>
          <Field label="Antigüedad máx. de evidencia (horas)">
            {(props) => (
              <Input
                {...props}
                inputMode="numeric"
                value={form.maxEvidenceAgeHours}
                onChange={(e) => setForm({ ...form, maxEvidenceAgeHours: e.target.value })}
              />
            )}
          </Field>
        </FormRow>
        {error ? <Callout tone="critical">{error}</Callout> : null}
        <div className={styles.inline}>
          <Button
            variant="primary"
            size="sm"
            loading={save.isPending}
            onClick={() => void submit()}
          >
            Guardar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }
  const every =
    data.intervalHours % 24 === 0 ? `${data.intervalHours / 24} día(s)` : `${data.intervalHours} h`;
  return (
    <div className={styles.stackTight}>
      <DescriptionList
        items={[
          [
            'Estado',
            data.enabled ? (
              <Badge tone="success" dot>
                Activo
              </Badge>
            ) : (
              <Badge tone="neutral" dot>
                Pausado
              </Badge>
            ),
          ],
          ['Frecuencia', `Cada ${every}`],
          ['Evidencia vigente', `${formatNumber(data.maxEvidenceAgeHours)} h`],
          ['Última ejecución', formatRelative(data.lastRunAt)],
          ['Próxima', data.enabled ? formatDateTime(data.nextRunAt) : '—'],
        ]}
      />
      {can('monitoring:manage') ? (
        <div>
          <Button size="sm" variant="ghost" icon="sliders" onClick={startEdit}>
            Configurar
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Summary({ asset }: { asset: AssetDetail }) {
  const devices = useDevices(asset.id);
  const est = asset.establishment;
  const points: MapPoint[] = [
    {
      id: 'asset',
      coordinates: asset.location.coordinates,
      color: '#0f2a3d',
      selected: true,
      label: asset.name,
    },
    ...(devices.data ?? [])
      .filter((i) => i.location)
      .map((i) => ({
        id: i.id,
        coordinates: i.location!.coordinates,
        color: i.device?.status === 'ONLINE' ? '#1b8f3a' : '#9aa4ac',
        label: i.label,
      })),
  ];
  const polygons: MapPolygon[] = [
    ...(est.boundary
      ? [{ id: 'est', geometry: est.boundary, color: '#0f2a3d', dashed: true }]
      : []),
    ...(asset.area ? [{ id: 'area', geometry: asset.area, color: '#2e7d4f' }] : []),
  ];
  const schema = asset.assetType.metadataSchema;
  const metadata = asset.metadata?.data ?? {};
  const metaItems: [string, string][] = orderedProperties(schema)
    .filter(
      ([key]) => metadata[key] !== undefined && metadata[key] !== null && metadata[key] !== '',
    )
    .map(([key, prop]) => {
      const value = metadata[key];
      const text =
        typeof value === 'number'
          ? `${formatNumber(value, 2)}${prop['x-unit'] ? ` ${prop['x-unit']}` : ''}`
          : typeof value === 'boolean'
            ? value
              ? 'Sí'
              : 'No'
            : prop['x-widget'] === 'date'
              ? formatDate(String(value))
              : String(value as string);
      return [prop.title ?? key, text];
    });

  return (
    <Grid columns="main-side">
      <div className={styles.stack}>
        <Panel title="Ubicación" flush>
          <MapView label={`Mapa de ${asset.name}`} points={points} polygons={polygons} height={340}>
            <MapLegend
              items={[
                { color: '#0f2a3d', label: 'Activo / establecimiento' },
                ...(asset.area ? [{ color: '#2e7d4f', label: 'Superficie declarada' }] : []),
                ...((devices.data?.length ?? 0) > 0
                  ? [{ color: '#1b8f3a', label: 'Cámara en línea' }]
                  : []),
              ]}
            />
          </MapView>
        </Panel>
        <Grid columns="2">
          <Panel title="Activo">
            <DescriptionList
              items={[
                ['Tipo', asset.assetType.name],
                ['Declarado', formatQuantity(asset.declaredQuantity, asset.unit)],
                ['Valor declarado', formatMoney(asset.declaredValue, asset.currency)],
                [
                  'Coordenadas',
                  `${asset.location.coordinates[1].toFixed(5)}, ${asset.location.coordinates[0].toFixed(5)}`,
                ],
                ['Método', STRATEGY_DESCRIPTIONS[asset.assetType.verificationStrategy]],
                ...metaItems,
              ]}
            />
          </Panel>
          <Panel title="Establecimiento">
            <DescriptionList
              items={[
                ['Nombre', est.name],
                ['Titular', est.holderName],
                ['CUIT', est.holderTaxId],
                ['RENSPA', est.renspa ?? '—'],
                [
                  'Explotación',
                  ESTABLISHMENT_TYPE_LABELS[est.establishmentType] ?? est.establishmentType,
                ],
                ['Tenencia', TENURE_LABELS[est.tenure] ?? est.tenure],
                ['Localidad', `${est.locality ? `${est.locality}, ` : ''}${est.province}`],
                ['Superficie', est.totalAreaHa ? `${formatNumber(est.totalAreaHa)} ha` : '—'],
              ]}
            />
          </Panel>
        </Grid>
      </div>
      <div className={styles.stack}>
        <Panel title="Última verificación">
          {asset.lastVerificationRunId ? (
            <div className={styles.stackTight}>
              <div>
                <span className={styles.keyNumber}>{asset.lastScore ?? '—'}</span>
                <span className={styles.muted}> / 100</span>
              </div>
              <StatRow>
                <Stat small label="Declarado" value={formatNumber(asset.declaredQuantity)} />
                <Stat small label="Verificado" value={formatNumber(asset.lastDetectedQuantity)} />
              </StatRow>
              <p className={styles.muted}>{formatDateTime(asset.lastVerifiedAt)}</p>
              <LinkButton
                href={`/assets/${asset.id}/verification?run=${asset.lastVerificationRunId}`}
                size="sm"
              >
                Ver resultado y evidencia
              </LinkButton>
            </div>
          ) : (
            <p className={styles.muted}>El activo todavía no fue verificado.</p>
          )}
        </Panel>
        <Panel title="Garantía">
          {asset.guarantee ? (
            <DescriptionList
              items={[
                [
                  'Estado',
                  <Badge key="g" tone="success" icon="shield">
                    Activa
                  </Badge>,
                ],
                ['Cubierto', formatQuantity(asset.guarantee.coveredQuantity, asset.unit)],
                ['Valuación', formatMoney(asset.guarantee.valuation, asset.guarantee.currency)],
                ['Confirmada', formatDate(asset.guarantee.confirmedAt)],
              ]}
            />
          ) : (
            <p className={styles.muted}>No confirmado como garantía.</p>
          )}
        </Panel>
        <Panel title="Monitoreo continuo">
          <MonitoringPanel asset={asset} />
        </Panel>
      </div>
    </Grid>
  );
}

function History({ asset }: { asset: AssetDetail }) {
  const router = useRouter();
  const runs = useVerifications({ assetId: asset.id });
  const satellite = useSatellite(
    asset.id,
    asset.assetType.verificationStrategy === 'VEGETATION_AREA',
  );
  if (runs.isPending) return <Loading />;
  if (runs.isError) return <ErrorState error={runs.error} />;
  const completed = runs.data.items.filter((r) => r.status === 'COMPLETED' && r.result).reverse();
  return (
    <div className={styles.stack}>
      {completed.length > 1 ? (
        <Panel title="Evolución del score">
          <LineChart
            label="Score por verificación"
            points={completed.map((r) => ({
              x: new Date(r.completedAt!),
              y: r.result!.finalScore,
              label: `${formatDate(r.completedAt)} · ${formatQuantity(r.result!.detectedQuantity, asset.unit)}`,
            }))}
            formatY={(v) => formatNumber(v)}
            formatX={(d) => formatDate(d)}
            yDomain={[0, 100]}
          />
        </Panel>
      ) : null}
      {satellite.data && satellite.data.length > 0 ? (
        <Panel
          title="Observaciones satelitales"
          subtitle="NDVI medio sobre el polígono declarado"
          actions={satellite.data.some((s) => s.scene?.simulated) ? <SimulatedBadge /> : null}
        >
          {satellite.data.filter((s) => s.ndviMean !== null).length > 1 ? (
            <LineChart
              label="NDVI medio por escena"
              points={[...satellite.data]
                .filter((s) => s.ndviMean !== null)
                .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
                .map((s) => ({
                  x: new Date(s.observedAt),
                  y: s.ndviMean!,
                  label: `${formatDate(s.observedAt)} · ${formatNumber(s.vegetatedAreaHa, 1)} ha`,
                }))}
              formatY={(v) => formatNumber(v, 2)}
              formatX={(d) => formatDate(d)}
              yDomain={[0, 1]}
            />
          ) : null}
          <DataTable
            caption="Escenas satelitales"
            rows={satellite.data}
            rowKey={(s) => s.id}
            columns={[
              { key: 'date', header: 'Fecha', render: (s) => formatDate(s.observedAt) },
              {
                key: 'scene',
                header: 'Escena',
                render: (s) => (
                  <CellTitle
                    title={s.scene?.sceneId ?? '—'}
                    subtitle={
                      s.scene ? `${s.scene.provider} · ${s.scene.resolutionM} m` : undefined
                    }
                  />
                ),
              },
              {
                key: 'ndvi',
                header: 'NDVI',
                numeric: true,
                render: (s) => formatNumber(s.ndviMean, 2),
              },
              {
                key: 'area',
                header: 'Con vegetación',
                numeric: true,
                render: (s) =>
                  s.vegetatedAreaHa !== null ? `${formatNumber(s.vegetatedAreaHa, 1)} ha` : '—',
              },
              {
                key: 'cov',
                header: 'Cobertura',
                numeric: true,
                render: (s) =>
                  s.coverageRatio !== null ? formatPercent(s.coverageRatio * 100, 0) : '—',
              },
              {
                key: 'cloud',
                header: 'Nubosidad',
                numeric: true,
                render: (s) => formatPercent(s.scene?.cloudCoverPct, 0),
              },
            ]}
          />
        </Panel>
      ) : null}
      <Panel title="Verificaciones" flush>
        <DataTable<VerificationRun>
          caption="Verificaciones del activo"
          rows={runs.data.items}
          rowKey={(r) => r.id}
          onRowClick={(r) => router.push(`/assets/${asset.id}/verification?run=${r.id}`)}
          columns={[
            {
              key: 'date',
              header: 'Fecha',
              render: (r) => formatDateTime(r.completedAt ?? r.queuedAt),
            },
            {
              key: 'trigger',
              header: 'Origen',
              render: (r) =>
                r.trigger === 'SCHEDULED' ? 'Programada' : r.trigger === 'API' ? 'API' : 'Manual',
            },
            {
              key: 'detected',
              header: 'Verificado',
              numeric: true,
              render: (r) => formatQuantity(r.result?.detectedQuantity, asset.unit),
            },
            {
              key: 'match',
              header: 'Coincidencia',
              numeric: true,
              render: (r) => formatPercent(r.result?.matchPercentage, 1),
            },
            {
              key: 'score',
              header: 'Score',
              numeric: true,
              render: (r) => (r.result ? <strong>{r.result.finalScore}</strong> : '—'),
            },
            {
              key: 'status',
              header: 'Resultado',
              render: (r) =>
                r.result ? (
                  <OutcomeBadge outcome={r.result.outcome} />
                ) : (
                  <RunStatusBadge status={r.status} />
                ),
            },
          ]}
        />
      </Panel>
    </div>
  );
}

function Animals({ asset }: { asset: AssetDetail }) {
  const animals = useAnimals(asset.id, true);
  if (animals.isPending) return <Loading />;
  if (animals.isError) return <ErrorState error={animals.error} />;
  return (
    <Panel
      title="Identificación individual"
      subtitle="Opcional: el conteo por visión computacional no depende de RFID. Permite trazabilidad por animal cuando hay caravanas electrónicas."
      flush
    >
      <DataTable
        caption="Animales identificados"
        rows={animals.data}
        rowKey={(a) => a.id}
        empty={
          <div style={{ padding: 20 }} className={styles.muted}>
            Sin animales identificados individualmente.
          </div>
        }
        columns={[
          {
            key: 'tag',
            header: 'Caravana',
            render: (a) => <CellTitle title={a.officialTag} subtitle={a.breed ?? undefined} />,
          },
          { key: 'cat', header: 'Categoría', render: (a) => a.category },
          { key: 'sex', header: 'Sexo', render: (a) => (a.sex === 'H' ? 'Hembra' : 'Macho') },
          {
            key: 'ids',
            header: 'Identificaciones',
            render: (a) => (
              <span className={styles.inline}>
                {a.identifications.map((i) => (
                  <Badge key={i.identifier} tone="neutral">
                    {i.method} {i.identifier}
                  </Badge>
                ))}
              </span>
            ),
          },
          {
            key: 'obs',
            header: 'Última lectura',
            render: (a) => (a.lastObservation ? formatRelative(a.lastObservation.observedAt) : '—'),
          },
        ]}
      />
    </Panel>
  );
}

export function AssetDetailView() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const can = useCan();
  const asset = useAsset(id);
  const evidence = useEvidence(id);
  const alerts = useAlerts({ assetId: id });
  const [tab, setTab] = useState(search.get('tab') ?? 'summary');

  if (asset.isPending) return <Loading />;
  if (asset.isError) return <ErrorState error={asset.error} />;
  const a = asset.data;
  const openAlerts = alerts.data?.items.filter((x) => x.status !== 'RESOLVED').length ?? 0;
  const tabs = [
    { id: 'summary', label: 'Resumen' },
    { id: 'documents', label: 'Documentación' },
    { id: 'evidence', label: 'Evidencia', count: evidence.data?.length },
    { id: 'devices', label: 'Dispositivos' },
    { id: 'history', label: 'Historial' },
    { id: 'alerts', label: 'Alertas', count: openAlerts },
    ...(a.assetType.category === 'LIVESTOCK'
      ? [{ id: 'animals', label: 'Identificación individual' }]
      : []),
  ];
  const changeTab = (next: string) => {
    setTab(next);
    router.replace(`/assets/${id}${next === 'summary' ? '' : `?tab=${next}`}`, { scroll: false });
  };

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: '/assets', label: 'Activos y garantías' }]}
        title={a.name}
        badge={<AssetStatusBadge status={a.status} />}
        description={`${a.assetType.name} · ${a.establishment.name} · ${a.establishment.locality ? `${a.establishment.locality}, ` : ''}${a.establishment.province}`}
        actions={
          <>
            {a.lastVerificationRunId ? (
              <LinkButton href={`/assets/${a.id}/verification?run=${a.lastVerificationRunId}`}>
                Última verificación
              </LinkButton>
            ) : null}
            {can('verifications:run') ? (
              <LinkButton
                href={`/assets/${a.id}/verification?start=1`}
                variant="primary"
                icon="shield"
              >
                Verificar ahora
              </LinkButton>
            ) : null}
          </>
        }
      />
      <StatRow>
        <Stat
          label="Declarado"
          value={formatNumber(a.declaredQuantity, a.unit === 'HECTARE' ? 1 : 0)}
          caption={formatQuantity(a.declaredQuantity, a.unit).split(' ').slice(1).join(' ')}
          testId="asset-declared"
        />
        <Stat
          label="Último verificado"
          value={formatNumber(a.lastDetectedQuantity, a.unit === 'HECTARE' ? 1 : 0)}
          caption={a.lastVerifiedAt ? formatRelative(a.lastVerifiedAt) : 'sin verificar'}
        />
        <Stat label="Score" value={a.lastScore ?? '—'} caption="sobre 100" />
        <Stat
          label="Valor declarado"
          value={formatMoney(a.declaredValue, a.currency, true)}
          caption={a.guarantee ? 'en garantía' : 'sin garantía confirmada'}
        />
        <Stat
          label="Alertas abiertas"
          value={openAlerts}
          caption={
            openAlerts ? (
              <Link href={`/assets/${a.id}?tab=alerts`} onClick={() => setTab('alerts')}>
                ver alertas
              </Link>
            ) : (
              'sin alertas'
            )
          }
        />
      </StatRow>
      <div style={{ marginTop: 20 }}>
        <Tabs items={tabs} active={tab} onChange={changeTab} />
      </div>
      <div style={{ marginTop: 20 }}>
        {tab === 'summary' ? <Summary asset={a} /> : null}
        {tab === 'documents' ? (
          <Panel title="Documentación">
            <DocumentsPanel assetId={a.id} establishmentId={a.establishment.id} />
          </Panel>
        ) : null}
        {tab === 'evidence' ? (
          <div className={styles.stack}>
            <Panel
              title="Evidencia del activo"
              subtitle="Capturas de cámaras, escenas satelitales y cargas manuales, con hash e instante de captura."
            >
              {evidence.isPending ? (
                <Loading />
              ) : (
                <EvidenceGallery items={(evidence.data ?? []).map(fromEvidenceItem)} />
              )}
            </Panel>
            {can('evidence:write') ? (
              <Panel title="Cargar imágenes">
                <EvidenceUpload assetId={a.id} defaultLocation={a.location} />
              </Panel>
            ) : null}
          </div>
        ) : null}
        {tab === 'devices' ? (
          <Panel title="Dispositivos">
            <DevicesPanel
              assetId={a.id}
              defaultLocation={a.location}
              usesCameras={a.assetType.evidenceSources.includes('CAMERA')}
            />
          </Panel>
        ) : null}
        {tab === 'history' ? <History asset={a} /> : null}
        {tab === 'alerts' ? (
          <Panel title="Alertas del activo" flush>
            {alerts.isPending ? (
              <Loading />
            ) : (
              <AlertsTable alerts={alerts.data?.items ?? []} showAsset={false} />
            )}
          </Panel>
        ) : null}
        {tab === 'animals' ? (
          <div className={styles.stack}>
            <RfidReadings assetId={a.id} />
            <Animals asset={a} />
          </div>
        ) : null}
      </div>
    </>
  );
}
