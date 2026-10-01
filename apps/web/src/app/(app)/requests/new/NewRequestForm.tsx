'use client';

import { useState, type FormEvent } from 'react';
import { Button, LinkButton } from '@/components/ui/Button';
import { Callout, ErrorState, Loading } from '@/components/ui/Feedback';
import { Field, FormRow, Input, Select } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import styles from '@/components/domain/domain.module.css';
import { api, ApiError } from '@/lib/api/client';
import { useApiMutation, useAssetTypes } from '@/lib/api/queries';
import type { GuaranteeRequest } from '@/lib/api/types';

/**
 * Nueva solicitud de garantía: la entidad identifica al productor y el tipo de garantía, y
 * obtiene un link para que el productor declare el activo y aporte la evidencia.
 */
export function NewRequestForm() {
  const types = useAssetTypes();
  const [form, setForm] = useState({
    producerName: '',
    producerTaxId: '',
    producerEmail: '',
    assetTypeCode: 'BOVINOS',
    requestedAmount: '',
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<GuaranteeRequest | null>(null);
  const [copied, setCopied] = useState(false);
  const create = useApiMutation(
    (body: object) => api<GuaranteeRequest>('/guarantee-requests', { method: 'POST', body }),
    [['guarantee-requests']],
  );

  if (types.isPending) return <Loading />;
  if (types.isError) return <ErrorState error={types.error} />;
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (form.producerName.trim().length < 2)
      return setError('Ingresá el nombre o razón social del productor.');
    if (!/^\d{2}-\d{8}-\d$/.test(form.producerTaxId.trim()))
      return setError('El CUIT debe tener el formato NN-NNNNNNNN-N.');
    try {
      setCreated(
        await create.mutateAsync({
          producerName: form.producerName.trim(),
          producerTaxId: form.producerTaxId.trim(),
          producerEmail: form.producerEmail.trim() || undefined,
          assetTypeCode: form.assetTypeCode,
          requestedAmount: form.requestedAmount ? Number(form.requestedAmount) : undefined,
          currency: 'USD',
          notes: form.notes.trim() || undefined,
        }),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No fue posible crear la solicitud.');
    }
  };

  if (created?.invitation) {
    const url = created.invitation.url;
    return (
      <>
        <PageHeader
          title="Solicitud creada"
          breadcrumb={[{ href: '/requests', label: 'Solicitudes de garantía' }]}
        />
        <Panel title="Link de invitación para el productor">
          <div className={styles.stack}>
            <p>
              Compartí este link con <strong>{created.producer.name}</strong>. Con él declara el
              establecimiento, el activo y aporta la documentación y la evidencia. Vence el{' '}
              {new Date(created.invitation.expiresAt).toLocaleDateString('es-AR')}.
            </p>
            <Input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Link de invitación"
            />
            <div className={styles.inline}>
              <Button
                icon="file"
                onClick={async () => {
                  await navigator.clipboard?.writeText(url).catch(() => undefined);
                  setCopied(true);
                }}
              >
                {copied ? 'Link copiado' : 'Copiar link'}
              </Button>
              <LinkButton href={url} external variant="secondary">
                Abrir como productor
              </LinkButton>
              <LinkButton href={`/requests/${created.id}`} variant="ghost">
                Ver solicitud
              </LinkButton>
            </div>
            <Callout tone="info">
              El link es personal: se guarda solo su huella (hash) y se puede regenerar desde la
              solicitud. No se envían emails en esta versión.
            </Callout>
          </div>
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Nueva solicitud de garantía"
        description="El productor declara el activo y aporta la evidencia; AgroGarantías verifica y la entidad evalúa."
        breadcrumb={[{ href: '/requests', label: 'Solicitudes de garantía' }]}
      />
      <Panel>
        <form onSubmit={submit} className={styles.stack} aria-label="Nueva solicitud de garantía">
          <FormRow columns={2}>
            <Field label="Productor (nombre o razón social)" required>
              {(p) => <Input {...p} value={form.producerName} onChange={set('producerName')} />}
            </Field>
            <Field label="CUIT del productor" hint="NN-NNNNNNNN-N" required>
              {(p) => (
                <Input
                  {...p}
                  value={form.producerTaxId}
                  onChange={set('producerTaxId')}
                  placeholder="30-71548963-1"
                />
              )}
            </Field>
          </FormRow>
          <FormRow columns={3}>
            <Field label="Tipo de garantía" required>
              {(p) => (
                <Select {...p} value={form.assetTypeCode} onChange={set('assetTypeCode')}>
                  {types.data.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Monto solicitado (USD)">
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={0}
                  value={form.requestedAmount}
                  onChange={set('requestedAmount')}
                />
              )}
            </Field>
            <Field label="Email del productor" hint="Opcional, solo de referencia">
              {(p) => (
                <Input
                  {...p}
                  type="email"
                  value={form.producerEmail}
                  onChange={set('producerEmail')}
                />
              )}
            </Field>
          </FormRow>
          <Field label="Observaciones de la solicitud">
            {(p) => <Input {...p} value={form.notes} onChange={set('notes')} maxLength={500} />}
          </Field>
          {error ? <Callout tone="critical">{error}</Callout> : null}
          <div className={styles.wizardFooter}>
            <span />
            <Button type="submit" loading={create.isPending}>
              Generar invitación
            </Button>
          </div>
        </form>
      </Panel>
    </>
  );
}
