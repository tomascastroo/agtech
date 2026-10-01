'use client';

import { useState } from 'react';
import { SeverityBadge, SimulatedBadge } from '@/components/domain/StatusBadges';
import styles from '@/components/domain/domain.module.css';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Callout, ErrorState, Loading } from '@/components/ui/Feedback';
import { Input, Select } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { DescriptionList, Grid, Panel } from '@/components/ui/Panel';
import { CellTitle, DataTable } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { api, ApiError } from '@/lib/api/client';
import {
  keys,
  useAlertRules,
  useApiMutation,
  useAuditLogs,
  useIntegrations,
  useOrganization,
  useScoring,
  useSession,
  useUsers,
} from '@/lib/api/queries';
import type { AlertRule } from '@/lib/api/types';
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import { AUDIT_ACTION_LABELS, SEVERITY_LABELS } from '@/lib/labels';
import { useCan } from '@/lib/permissions';

const COMPONENT_LABELS: Record<string, string> = {
  documentation: 'Documentación',
  existence: 'Existencia',
  historical: 'Historial',
  risk: 'Riesgo',
  consistency: 'Consistencia',
};
const COMPONENT_HELP: Record<string, string> = {
  documentation: 'Completitud y vigencia de la documentación exigida.',
  existence: 'Coincidencia entre lo declarado y lo detectado, ponderada por la confianza.',
  historical: 'Regularidad y estabilidad de las verificaciones previas.',
  risk: 'Movilidad del activo, tenencia, seguro, alertas y cobertura de dispositivos.',
  consistency: 'Actualidad de la evidencia, ubicación y cruce con registros externos.',
};
const PARAM_LABELS: Record<string, string> = {
  threshold: 'Umbral',
  thresholdPct: 'Umbral (%)',
  maxAgeHours: 'Antigüedad máx. (h)',
  withinDays: 'Anticipación (días)',
  maxDays: 'Máximo (días)',
};
const CAPABILITY_LABELS: Record<string, string> = {
  COMPUTER_VISION: 'Visión computacional',
  SATELLITE_IMAGERY: 'Imágenes satelitales',
  CAMERA_GATEWAY: 'Cámaras en campo',
  LIVESTOCK_REGISTRY: 'Registro ganadero (SENASA)',
};
const TASK_LABELS: Record<string, string> = {
  SCORING: 'Scoring',
  CHANGE_DETECTION: 'Detección de cambios',
  ANIMAL_COUNTING: 'Conteo de animales',
  IMAGE_QUALITY: 'Calidad de imagen',
  VEGETATION_INDEX: 'Índice de vegetación',
};

function Organization() {
  const can = useCan();
  const session = useSession();
  const org = useOrganization();
  const users = useUsers();
  return (
    <Grid columns="main-side">
      <Panel title="Usuarios" flush>
        {!can('users:read') ? (
          <p className={styles.muted} style={{ padding: 20 }}>
            Tu rol no permite consultar usuarios.
          </p>
        ) : users.isPending ? (
          <Loading />
        ) : (
          <DataTable
            caption="Usuarios"
            rows={users.data ?? []}
            rowKey={(u) => u.id}
            columns={[
              {
                key: 'name',
                header: 'Usuario',
                render: (u) => <CellTitle title={u.fullName} subtitle={u.email} />,
              },
              { key: 'role', header: 'Rol', render: (u) => u.role?.name ?? '—' },
              {
                key: 'status',
                header: 'Estado',
                render: (u) => (
                  <Badge tone={u.status === 'ACTIVE' ? 'success' : 'neutral'} dot>
                    {u.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                  </Badge>
                ),
              },
              {
                key: 'login',
                header: 'Último ingreso',
                render: (u) => formatRelative(u.lastLoginAt),
              },
            ]}
          />
        )}
      </Panel>
      <div className={styles.stack}>
        <Panel title="Organización">
          {org.data ? (
            <DescriptionList
              items={[
                ['Nombre', org.data.name],
                ['Razón social', org.data.legalName],
                ['CUIT', org.data.taxId],
                [
                  'Tipo',
                  org.data.kind === 'BANK'
                    ? 'Banco'
                    : org.data.kind === 'INSURER'
                      ? 'Aseguradora'
                      : org.data.kind,
                ],
              ]}
            />
          ) : (
            <Loading />
          )}
        </Panel>
        <Panel title="Tu sesión">
          {session.data ? (
            <DescriptionList
              items={[
                ['Usuario', session.data.fullName],
                ['Rol', session.data.roleName],
                ['Permisos', `${session.data.permissions.length} permisos`],
              ]}
            />
          ) : null}
        </Panel>
      </div>
    </Grid>
  );
}

function Scoring() {
  const can = useCan();
  const scoring = useScoring();
  const [draft, setDraft] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const save = useApiMutation(
    (body: Record<string, number>) => api('/organization/scoring/weights', { method: 'PUT', body }),
    [keys.scoring],
  );
  if (scoring.isPending) return <Loading />;
  if (scoring.isError) return <ErrorState error={scoring.error} />;
  const weights = draft ?? scoring.data.weights;
  const total = Object.values(weights).reduce((acc, w) => acc + w, 0);
  const editable = can('settings:manage');
  const set = (key: string, percent: number) => {
    setSaved(false);
    setDraft({ ...weights, [key]: Math.round(percent) / 100 });
  };
  const submit = async () => {
    setError(null);
    try {
      await save.mutateAsync(weights);
      setDraft(null);
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No fue posible guardar los pesos.');
    }
  };

  return (
    <Panel
      title="Pesos del score"
      subtitle={`Modelo ${scoring.data.modelVersion}. Los cambios aplican a las verificaciones nuevas; las anteriores conservan los pesos con que se calcularon.`}
    >
      <div className={styles.stack}>
        {Object.keys(COMPONENT_LABELS).map((key) => (
          <div key={key} className={styles.weightRow}>
            <span>
              <strong style={{ fontWeight: 600 }}>{COMPONENT_LABELS[key]}</strong>
              <span className={styles.small} style={{ display: 'block' }}>
                {COMPONENT_HELP[key]}
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={60}
              step={1}
              value={Math.round((weights[key] ?? 0) * 100)}
              onChange={(e) => set(key, Number(e.target.value))}
              disabled={!editable}
              aria-label={`Peso de ${COMPONENT_LABELS[key]}`}
            />
            <span className="tabular" style={{ textAlign: 'right', fontWeight: 600 }}>
              {formatNumber((weights[key] ?? 0) * 100)} %
            </span>
          </div>
        ))}
        <div className={styles.spread}>
          <span
            className={Math.abs(total - 1) < 0.001 ? styles.muted : undefined}
            style={
              Math.abs(total - 1) < 0.001
                ? undefined
                : { color: 'var(--critical-fg)', fontWeight: 600 }
            }
          >
            Suma: {formatNumber(total * 100)} %{' '}
            {Math.abs(total - 1) < 0.001 ? '' : '(debe sumar 100 %)'}
          </span>
          {editable ? (
            <span className={styles.inline}>
              <Button variant="ghost" onClick={() => setDraft({ ...scoring.data.defaults })}>
                Restablecer valores por defecto
              </Button>
              <Button
                variant="primary"
                disabled={!draft || Math.abs(total - 1) > 0.001}
                loading={save.isPending}
                onClick={() => void submit()}
              >
                Guardar pesos
              </Button>
            </span>
          ) : (
            <span className={styles.small}>Solo administradores pueden modificar los pesos.</span>
          )}
        </div>
        {error ? <Callout tone="critical">{error}</Callout> : null}
        {saved ? (
          <Callout tone="success">Pesos actualizados. Quedó registrado en la auditoría.</Callout>
        ) : null}
      </div>
    </Panel>
  );
}

function RuleRow({ rule, editable }: { rule: AlertRule; editable: boolean }) {
  const [params, setParams] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(rule.parameters).map(([k, v]) => [k, String(v)])),
  );
  const [error, setError] = useState<string | null>(null);
  const update = useApiMutation(
    (body: object) => api<AlertRule>(`/alert-rules/${rule.id}`, { method: 'PATCH', body }),
    [keys.rules],
  );
  const patch = async (body: object) => {
    setError(null);
    try {
      await update.mutateAsync(body);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No fue posible actualizar la regla.');
    }
  };
  const dirty = Object.entries(params).some(([k, v]) => Number(v) !== rule.parameters[k]);
  return (
    <tr>
      <td>
        <CellTitle title={rule.name} subtitle={rule.description} />
        {error ? <div style={{ color: 'var(--critical-fg)', fontSize: 12 }}>{error}</div> : null}
      </td>
      <td>
        {editable ? (
          <Select
            aria-label={`Severidad de ${rule.name}`}
            value={rule.severity}
            onChange={(e) => void patch({ severity: e.target.value })}
          >
            {Object.entries(SEVERITY_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </Select>
        ) : (
          <SeverityBadge severity={rule.severity} />
        )}
      </td>
      <td>
        <span className={styles.inline} style={{ flexWrap: 'nowrap' }}>
          {Object.keys(rule.parameters).length === 0 ? (
            <span className={styles.small}>Sin parámetros</span>
          ) : null}
          {Object.entries(params).map(([key, value]) => (
            <label
              key={key}
              className={styles.small}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {PARAM_LABELS[key] ?? key}
              <span style={{ width: 80 }}>
                <Input
                  value={value}
                  inputMode="decimal"
                  disabled={!editable}
                  onChange={(e) => setParams({ ...params, [key]: e.target.value })}
                />
              </span>
            </label>
          ))}
          {editable && dirty ? (
            <Button
              size="sm"
              loading={update.isPending}
              onClick={() =>
                void patch({
                  parameters: Object.fromEntries(
                    Object.entries(params).map(([k, v]) => [k, Number(v)]),
                  ),
                })
              }
            >
              Guardar
            </Button>
          ) : null}
        </span>
      </td>
      <td>
        {editable ? (
          <Button
            size="sm"
            variant={rule.enabled ? 'secondary' : 'ghost'}
            onClick={() => void patch({ enabled: !rule.enabled })}
            aria-pressed={rule.enabled}
          >
            {rule.enabled ? 'Habilitada' : 'Deshabilitada'}
          </Button>
        ) : (
          <Badge tone={rule.enabled ? 'success' : 'neutral'} dot>
            {rule.enabled ? 'Habilitada' : 'Deshabilitada'}
          </Badge>
        )}
      </td>
    </tr>
  );
}

function Rules() {
  const can = useCan();
  const rules = useAlertRules();
  if (rules.isPending) return <Loading />;
  if (rules.isError) return <ErrorState error={rules.error} />;
  return (
    <Panel
      title="Reglas de alerta"
      subtitle="Se evalúan en cada verificación y en el monitoreo continuo. Los cambios se aplican a la organización."
      flush
    >
      <div style={{ overflowX: 'auto' }}>
        <table className={styles.ruleTable}>
          <thead>
            <tr>
              <th scope="col">Regla</th>
              <th scope="col" style={{ width: 170 }}>
                Severidad
              </th>
              <th scope="col">Parámetros</th>
              <th scope="col" style={{ width: 140 }}>
                Estado
              </th>
            </tr>
          </thead>
          <tbody>
            {rules.data.map((rule) => (
              <RuleRow
                key={`${rule.id}-${rule.severity}-${rule.enabled}-${JSON.stringify(rule.parameters)}`}
                rule={rule}
                editable={can('settings:manage')}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Integrations() {
  const integrations = useIntegrations();
  if (integrations.isPending) return <Loading />;
  if (integrations.isError) return <ErrorState error={integrations.error} />;
  const { providers, models } = integrations.data;
  return (
    <div className={styles.stack}>
      <Callout tone="neutral" title="Fuentes simuladas">
        Las fuentes marcadas como “Simulado” son proveedores de desarrollo: generan datos sintéticos
        claramente identificados en la evidencia, el score y los informes. No existe integración
        real con SENASA ni con proveedores comerciales de cámaras en esta instalación.
      </Callout>
      <Panel title="Proveedores" flush>
        <DataTable
          caption="Proveedores"
          rows={providers}
          rowKey={(p) => p.capability}
          columns={[
            {
              key: 'cap',
              header: 'Capacidad',
              render: (p) => CAPABILITY_LABELS[p.capability] ?? p.capability,
            },
            {
              key: 'name',
              header: 'Proveedor',
              render: (p) => <span className={styles.mono}>{p.name}</span>,
            },
            {
              key: 'kind',
              header: 'Tipo',
              render: (p) => (p.simulated ? <SimulatedBadge /> : <Badge tone="info">Real</Badge>),
            },
            {
              key: 'status',
              header: 'Estado',
              render: (p) => (
                <Badge
                  tone={p.status === 'OPERATIVE' ? 'success' : 'critical'}
                  dot
                  title={p.detail ?? undefined}
                >
                  {p.status === 'OPERATIVE' ? 'Operativo' : 'No disponible'}
                </Badge>
              ),
            },
          ]}
        />
      </Panel>
      <Panel
        title="Modelos registrados"
        subtitle="Cada resultado queda vinculado a la versión del modelo que lo produjo."
        flush
      >
        <DataTable
          caption="Modelos"
          rows={models}
          rowKey={(m) => m.code}
          columns={[
            {
              key: 'name',
              header: 'Modelo',
              render: (m) => <CellTitle title={m.name} subtitle={m.code} />,
            },
            { key: 'task', header: 'Tarea', render: (m) => TASK_LABELS[m.task] ?? m.task },
            {
              key: 'provider',
              header: 'Ejecuta',
              render: (m) => <span className={styles.mono}>{m.provider}</span>,
            },
            {
              key: 'versions',
              header: 'Versiones',
              render: (m) => (
                <span className={styles.inline}>
                  {m.versions.map((v) => (
                    <Badge key={v.version} tone={v.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      v{v.version}
                      {v.simulated ? ' · simulado' : ''}
                    </Badge>
                  ))}
                </span>
              ),
            },
          ]}
        />
      </Panel>
    </div>
  );
}

function Audit() {
  const [page, setPage] = useState(1);
  const logs = useAuditLogs(page);
  if (logs.isPending) return <Loading />;
  if (logs.isError) return <ErrorState error={logs.error} />;
  const pages = Math.max(1, Math.ceil(logs.data.total / logs.data.pageSize));
  return (
    <Panel
      title="Registro de auditoría"
      subtitle="Append-only: cada acción relevante queda registrada con actor, recurso, IP y momento."
      flush
      footer={
        <span className={styles.spread}>
          <span>
            Página {page} de {pages} · {logs.data.total} registros
          </span>
          <span className={styles.inline}>
            <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Anterior
            </Button>
            <Button size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Siguiente
            </Button>
          </span>
        </span>
      }
    >
      <DataTable
        caption="Auditoría"
        rows={logs.data.items}
        rowKey={(l) => l.id}
        columns={[
          { key: 'when', header: 'Fecha', render: (l) => formatDateTime(l.createdAt) },
          {
            key: 'action',
            header: 'Acción',
            render: (l) => AUDIT_ACTION_LABELS[l.action] ?? l.action,
          },
          {
            key: 'actor',
            header: 'Actor',
            render: (l) =>
              l.actorType === 'SYSTEM' ? (
                <Badge tone="neutral">Sistema</Badge>
              ) : (
                <span className={styles.mono}>{l.userId?.slice(0, 8)}</span>
              ),
          },
          {
            key: 'resource',
            header: 'Recurso',
            render: (l) => (
              <CellTitle
                title={l.resourceType}
                subtitle={
                  l.resourceId ? <span className={styles.mono}>{l.resourceId}</span> : undefined
                }
              />
            ),
          },
          {
            key: 'ip',
            header: 'IP',
            render: (l) => <span className={styles.mono}>{l.ip ?? '—'}</span>,
          },
        ]}
      />
    </Panel>
  );
}

export function SettingsView() {
  const can = useCan();
  const [tab, setTab] = useState('organization');
  const tabs = [
    { id: 'organization', label: 'Organización' },
    { id: 'scoring', label: 'Scoring' },
    { id: 'rules', label: 'Reglas de alerta' },
    { id: 'integrations', label: 'Integraciones y modelos' },
    ...(can('audit:read') ? [{ id: 'audit', label: 'Auditoría' }] : []),
  ];
  return (
    <>
      <PageHeader
        title="Configuración"
        description="Parámetros de la organización: usuarios, modelo de scoring, reglas de alerta e integraciones."
      />
      <Tabs items={tabs} active={tab} onChange={setTab} />
      <div style={{ marginTop: 20 }}>
        {tab === 'organization' ? <Organization /> : null}
        {tab === 'scoring' ? <Scoring /> : null}
        {tab === 'rules' ? <Rules /> : null}
        {tab === 'integrations' ? <Integrations /> : null}
        {tab === 'audit' ? <Audit /> : null}
      </div>
    </>
  );
}
