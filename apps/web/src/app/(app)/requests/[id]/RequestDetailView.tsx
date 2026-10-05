'use client';

import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RequestStageBadge } from '@/components/domain/RequestStageBadge';
import { BovineIndividualsPanel } from '@/components/domain/BovineIndividualsPanel';
import { DataLayersPanel, DemoBanner } from '@/components/domain/DataLayersPanel';
import { DocumentationChecklist } from '@/components/domain/DocumentationChecklist';
import { LivestockMonitorPanel } from '@/components/domain/LivestockMonitorPanel';
import { ScansPanel } from '@/components/domain/ScansPanel';
import {
  DemoBadge,
  OutcomeBadge,
  RiskBadge,
  SeverityBadge,
} from '@/components/domain/StatusBadges';
import styles from '@/components/domain/domain.module.css';
import { Button, LinkButton } from '@/components/ui/Button';
import { Callout, ErrorState, Loading } from '@/components/ui/Feedback';
import { Field, FormRow, Input, Select } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Stat, StatRow } from '@/components/ui/Stat';
import { api, ApiError } from '@/lib/api/client';
import { useApiMutation } from '@/lib/api/queries';
import { DataTable } from '@/components/ui/Table';
import type { CountingBreakdown, CrossSource, GuaranteeRequest, Unit } from '@/lib/api/types';
import { formatDateTime, formatNumber, unitLabel } from '@/lib/format';
import { DOCUMENT_TYPE_LABELS } from '@/lib/labels';

/**
 * Vista de la entidad: separa la declaración del productor (solo lectura), la verificación de
 * AgroGarantías y la evaluación de la entidad (resultado, score y alertas).
 */
export function RequestDetailView() {
  const { id } = useParams<{ id: string }>();
  const [link, setLink] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['guarantee-requests', id],
    queryFn: () => api<GuaranteeRequest>(`/guarantee-requests/${id}`),
    refetchInterval: (q) => (q.state.data?.stage === 'READY_FOR_VERIFICATION' ? 4000 : 20_000),
  });
  const renew = useApiMutation(() =>
    api<{ url: string }>(`/guarantee-requests/${id}/invitation`, { method: 'POST' }),
  );
  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} />;
  const r = query.data;
  const unit = (r.asset?.unit ?? r.guaranteeType.unit ?? 'UNIT') as Unit;
  const v = r.verification;

  return (
    <>
      <PageHeader
        title={r.asset?.name ?? `Solicitud — ${r.producer.name}`}
        description={`${r.guaranteeType.name ?? r.guaranteeType.code} · solicitada por ${r.requester.name}`}
        breadcrumb={[{ href: '/requests', label: 'Solicitudes de garantía' }]}
        badge={
          <span className={styles.inline}>
            <RequestStageBadge stage={r.stage} />
            {r.dataSource === 'DEMO' ? <DemoBadge /> : null}
          </span>
        }
      />
      <div className={styles.stack}>
        {r.dataSource === 'DEMO' ? <DemoBanner scenario={demoName(r.demoScenario)} /> : null}
        <Panel
          title="1 · Declaración del productor"
          subtitle="Información aportada por el productor; la entidad no puede modificarla."
        >
          <dl className={styles.facts}>
            <dt>Productor</dt>
            <dd>
              {r.producer.name} · CUIT {r.producer.taxId}
            </dd>
            <dt>Establecimiento</dt>
            <dd>
              {r.establishment
                ? `${r.establishment.name} · ${r.establishment.locality ?? ''} ${r.establishment.province}${r.establishment.renspa ? ` · RENSPA ${r.establishment.renspa}` : ''}`
                : 'Pendiente'}
            </dd>
            <dt>Activo declarado</dt>
            <dd>
              {r.asset
                ? `${r.asset.name} · ${formatNumber(r.asset.declaredQuantity)} ${unitLabel(unit, r.asset.declaredQuantity)}`
                : 'Pendiente'}
            </dd>
            <dt>Documentación / evidencia</dt>
            <dd>
              {r.documentation
                ? `${r.documentation.summary.consistent} de ${r.documentation.summary.total - r.documentation.summary.notApplicable} requisitos consistentes`
                : `${r.documentCount} documento(s)`}{' '}
              · {r.evidenceCount} imagen(es) de campo
            </dd>
            <dt>Enviada</dt>
            <dd>
              {r.submittedAt ? new Date(r.submittedAt).toLocaleString('es-AR') : 'Todavía no'}
            </dd>
          </dl>
          {r.missing.length > 0 ? (
            <Callout tone="warning" title="Falta que el productor complete">
              {r.missing.join(', ')}
            </Callout>
          ) : null}
          {r.stage === 'INVITED' || r.stage === 'IN_PROGRESS' ? (
            <div className={styles.inline} style={{ marginTop: 12 }}>
              <Button
                variant="secondary"
                loading={renew.isPending}
                onClick={async () => setLink((await renew.mutateAsync(undefined)).url)}
              >
                Generar nuevo link
              </Button>
              {link ? (
                <Input
                  readOnly
                  value={link}
                  aria-label="Nuevo link"
                  onFocus={(e) => e.currentTarget.select()}
                />
              ) : null}
            </div>
          ) : null}
        </Panel>

        {r.documentation ? (
          <DocumentationChecklist
            requestId={r.id}
            assetId={r.asset?.id ?? null}
            documentation={r.documentation}
            onChange={() => query.refetch()}
          />
        ) : null}

        {r.dataLayers ? <DataLayersPanel layers={r.dataLayers} /> : null}

        <Panel
          title="2 · Verificación de AgroGarantías"
          subtitle="Ejecutada automáticamente al enviar la declaración, con el motor de verificación existente."
        >
          {!v ? (
            <p className={styles.muted}>
              {r.stage === 'READY_FOR_VERIFICATION'
                ? 'Verificación en curso…'
                : 'Se ejecuta cuando el productor envía la declaración.'}
            </p>
          ) : !v.outcome ? (
            <p className={styles.muted}>
              Verificación {v.status === 'FAILED' ? 'fallida' : 'en curso…'}
            </p>
          ) : (
            <StatRow>
              <Stat
                label="Declarados"
                value={`${formatNumber(v.declaredQuantity)} ${unitLabel(unit, v.declaredQuantity ?? 2)}`}
              />
              <Stat
                label="Detectados"
                value={
                  v.detectedQuantity != null
                    ? `${formatNumber(v.detectedQuantity, unit === 'HECTARE' ? 1 : 0)} ${unitLabel(unit, v.detectedQuantity)}`
                    : '—'
                }
              />
              <Stat
                label="Coincidencia"
                value={v.matchPercentage != null ? `${formatNumber(v.matchPercentage, 1)} %` : '—'}
              />
              <Stat
                label="Score"
                value={v.finalScore ?? '—'}
                unit={v.finalScore != null ? '/100' : undefined}
              />
            </StatRow>
          )}
          {v?.outcome ? (
            <div className={styles.inline} style={{ marginTop: 12 }}>
              <OutcomeBadge outcome={v.outcome} />
              {v.riskLevel ? <RiskBadge level={v.riskLevel} /> : null}
              {v.confidence != null ? (
                <span className={styles.muted}>Confianza {formatNumber(v.confidence * 100)} %</span>
              ) : null}
            </div>
          ) : null}
          {v?.counting ? <CountingDetail counting={v.counting} /> : null}
        </Panel>

        {r.asset && r.scans?.length ? <ScansPanel assetId={r.asset.id} /> : null}

        {r.asset && r.scans?.some((s) => s.mode === 'CHUTE') ? (
          <BovineIndividualsPanel assetId={r.asset.id} />
        ) : null}

        {r.asset && r.guaranteeType.code === 'BOVINOS' ? (
          <LivestockMonitorPanel assetId={r.asset.id} />
        ) : null}

        {r.crossSources ? <CrossSourcesPanel sources={r.crossSources} /> : null}

        <InformationRequestsPanel request={r} onDone={() => query.refetch()} />

        <Panel
          title="3 · Evaluación de la entidad"
          subtitle="Resultado, evidencia y alertas para decidir sobre la garantía."
        >
          {r.alerts && r.alerts.length > 0 ? (
            <ul className={styles.stackTight}>
              {r.alerts.map((a) => (
                <li key={a.id} className={styles.inline}>
                  <SeverityBadge severity={a.severity} /> {a.title}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>Sin alertas abiertas.</p>
          )}
          {r.asset ? (
            <div className={styles.inline} style={{ marginTop: 12 }}>
              {v?.runId ? (
                <LinkButton href={`/assets/${r.asset.id}/verification?run=${v.runId}`}>
                  Ver resultado y evidencia
                </LinkButton>
              ) : null}
              <LinkButton href={`/assets/${r.asset.id}`} variant="secondary">
                Ficha del activo
              </LinkButton>
            </div>
          ) : null}
        </Panel>
      </div>
    </>
  );
}

const DEMO_NAMES: Record<string, string> = {
  COMPLETE: 'Demo ganadera completa',
  MISSING_DOCUMENTS: 'Demo con documentación faltante',
  INCONSISTENT: 'Demo con inconsistencia documental',
  READY: 'Demo lista para verificar',
};
const demoName = (code?: string | null) => (code ? (DEMO_NAMES[code] ?? code) : null);

const SOURCE_STATE = {
  CONSISTENT: { label: 'Consistente', tone: 'success' },
  WARNING: { label: 'Revisar', tone: 'warning' },
  NO_DATA: { label: 'Sin datos', tone: 'neutral' },
} as const;

/** Lo que informa cada fuente independiente, lado a lado. No modifica el score. */
function CrossSourcesPanel({ sources }: { sources: CrossSource[] }) {
  return (
    <Panel
      title="Fuentes cruzadas"
      subtitle="Qué dice cada fuente independiente sobre el activo. Informativo: no modifica el score."
    >
      <DataTable
        caption="Fuentes cruzadas"
        rows={sources}
        rowKey={(s) => s.key}
        columns={[
          { key: 'label', header: 'Fuente', render: (s) => s.label },
          {
            key: 'value',
            header: 'Informa',
            render: (s) => (
              <>
                {s.value}
                {s.simulated ? (
                  <>
                    {' '}
                    <Badge tone="warning">SIMULADO</Badge>
                  </>
                ) : null}
              </>
            ),
          },
          {
            key: 'state',
            header: 'Estado',
            render: (s) => (
              <Badge tone={SOURCE_STATE[s.state].tone}>{SOURCE_STATE[s.state].label}</Badge>
            ),
          },
        ]}
      />
    </Panel>
  );
}

const ROLE_LABEL = { PRIMARY: 'Usada', SUPPORTING: 'Respaldo', EXCLUDED: 'Excluida' } as const;

/** Detecciones por foto y animales únicos estimados (las fotos no se suman sin más). */
function CountingDetail({ counting: c }: { counting: CountingBreakdown }) {
  return (
    <div className={styles.stackTight} style={{ marginTop: 16 }}>
      {c.uniqueEstimate != null && c.detectionsSum != null ? (
        <p className={styles.muted}>
          Detecciones sumadas entre fotos: {formatNumber(c.detectionsSum)} · Animales únicos
          estimados: <strong>{formatNumber(c.uniqueEstimate)}</strong>
          {c.confidence != null ? ` · confianza ${formatNumber(c.confidence * 100)} %` : ''}
        </p>
      ) : null}
      {c.possibleOverlap ? (
        <Callout tone="warning" title="Posible duplicación entre evidencias">
          {c.overlapMessage}
        </Callout>
      ) : null}
      <DataTable
        caption="Detecciones por foto"
        rows={c.photos}
        rowKey={(p) => p.evidenceId}
        columns={[
          {
            key: 'photo',
            header: 'Foto',
            render: (p) =>
              `${p.fromCamera ? 'Cámara' : (p.fileName ?? 'Foto')} · ${formatDateTime(p.capturedAt)}`,
          },
          { key: 'role', header: 'Uso', render: (p) => p.exclusionReason ?? ROLE_LABEL[p.role] },
          {
            key: 'count',
            header: 'Detectados',
            numeric: true,
            render: (p) => (p.detectedCount != null ? formatNumber(p.detectedCount) : '—'),
          },
          {
            key: 'conf',
            header: 'Confianza',
            numeric: true,
            render: (p) => (p.confidence != null ? `${formatNumber(p.confidence * 100)} %` : '—'),
          },
        ]}
      />
    </div>
  );
}

/** Pedidos de documentación o evidencia adicional al productor (quedan como tareas en su portal). */
function InformationRequestsPanel({
  request: r,
  onDone,
}: {
  request: GuaranteeRequest;
  onDone: () => unknown;
}) {
  const [kind, setKind] = useState<'DOCUMENT' | 'EVIDENCE'>('EVIDENCE');
  const [documentType, setDocumentType] = useState('ID_CUIT');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useApiMutation((body: object) =>
    api(`/guarantee-requests/${r.id}/information-requests`, { method: 'POST', body }),
  );
  if (!r.asset) return null;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (message.trim().length < 3) return setError('Escribí qué necesitás del productor.');
    try {
      await create.mutateAsync({
        kind,
        documentType: kind === 'DOCUMENT' ? documentType : undefined,
        message: message.trim(),
      });
      setMessage('');
      await onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No fue posible enviar el pedido.');
    }
  };
  return (
    <Panel
      title="Pedidos de información al productor"
      subtitle="Los requisitos del checklist se piden desde Documentación. Acá podés pedir más fotos u otro documento; el productor lo recibe como tarea y su declaración no cambia."
    >
      {r.informationRequests.length > 0 ? (
        <ul className={styles.stackTight} style={{ marginBottom: 12 }}>
          {r.informationRequests.map((i) => (
            <li key={i.id} className={styles.inline}>
              <Badge tone={i.status === 'OPEN' ? 'warning' : 'success'} dot>
                {i.status === 'OPEN' ? 'Pendiente' : 'Respondido'}
              </Badge>
              <span>
                <strong>
                  {i.kind === 'EVIDENCE'
                    ? 'Evidencia'
                    : (r.documentation?.items.find((x) => x.code === i.requirementCode)?.name ??
                      DOCUMENT_TYPE_LABELS[i.documentType ?? ''] ??
                      'Documento')}
                </strong>
                {i.requirementCode ? null : ` — ${i.message}`}
              </span>
              <span className={styles.muted}>
                {new Date(i.createdAt).toLocaleDateString('es-AR')}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={submit} className={styles.stackTight} aria-label="Solicitar información">
        <FormRow columns={2}>
          <Field label="Qué necesitás">
            {(p) => (
              <Select
                {...p}
                value={kind}
                onChange={(e) => setKind(e.target.value as 'DOCUMENT' | 'EVIDENCE')}
              >
                <option value="EVIDENCE">Más evidencia (fotos)</option>
                <option value="DOCUMENT">Documentación adicional</option>
              </Select>
            )}
          </Field>
          {kind === 'DOCUMENT' ? (
            <Field label="Documento">
              {(p) => (
                <Select
                  {...p}
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                >
                  {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}
        </FormRow>
        <Field label="Mensaje para el productor" required>
          {(p) => (
            <Input
              {...p}
              value={message}
              maxLength={500}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ej.: Agregá fotografías del rodeo desde otros sectores del establecimiento."
            />
          )}
        </Field>
        {error ? <Callout tone="critical">{error}</Callout> : null}
        <div>
          <Button type="submit" loading={create.isPending} variant="secondary">
            Solicitar al productor
          </Button>
        </div>
      </form>
    </Panel>
  );
}
