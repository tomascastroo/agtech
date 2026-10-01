'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RequestStageBadge } from '@/components/domain/RequestStageBadge';
import { OutcomeBadge, RiskBadge, SeverityBadge } from '@/components/domain/StatusBadges';
import styles from '@/components/domain/domain.module.css';
import { Button, LinkButton } from '@/components/ui/Button';
import { Callout, ErrorState, Loading } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Stat, StatRow } from '@/components/ui/Stat';
import { api } from '@/lib/api/client';
import { useApiMutation } from '@/lib/api/queries';
import type { GuaranteeRequest, Unit } from '@/lib/api/types';
import { formatNumber, unitLabel } from '@/lib/format';

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
        badge={<RequestStageBadge stage={r.stage} />}
      />
      <div className={styles.stack}>
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
              {r.documentCount} documento(s) · {r.evidenceCount} imagen(es) de campo
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
              <Stat label="Score" value={v.finalScore != null ? `${v.finalScore}/100` : '—'} />
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
        </Panel>

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
