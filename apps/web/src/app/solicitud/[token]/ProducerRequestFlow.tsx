'use client';

import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EvidenceUpload } from '@/components/domain/EvidenceUpload';
import {
  MetadataForm,
  parseMetadata,
  toRawMetadata,
  type RawMetadata,
} from '@/components/domain/MetadataForm';
import { RequestStageBadge } from '@/components/domain/RequestStageBadge';
import domain from '@/components/domain/domain.module.css';
import { LocationPicker, type PickedLocation } from '@/components/map/LocationPicker';
import { Button } from '@/components/ui/Button';
import { Callout, ErrorState, Loading } from '@/components/ui/Feedback';
import { Field, FormRow, Input, Select } from '@/components/ui/Field';
import { Panel } from '@/components/ui/Panel';
import { api, ApiError } from '@/lib/api/client';
import type { GuaranteeRequest, Unit } from '@/lib/api/types';
import { formatNumber, unitLabel } from '@/lib/format';
import {
  DOCUMENT_TYPE_LABELS,
  ESTABLISHMENT_TYPE_LABELS,
  PROVINCES,
  TENURE_LABELS,
} from '@/lib/labels';
import styles from './producer.module.css';

const message = (e: unknown, fallback: string) => {
  if (!(e instanceof ApiError)) return fallback;
  const fields = e.fieldErrors.map((f) => f.message).join('. ');
  return fields ? `${e.message}. ${fields}` : e.message;
};

/**
 * Experiencia del productor (acceso por link, sin cuenta): declara establecimiento y activo y
 * aporta documentación y evidencia. AgroGarantías verifica; la entidad consulta el resultado.
 */
export function ProducerRequestFlow() {
  const { token } = useParams<{ token: string }>();
  const base = `/producer/requests/${token}`;
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['producer-request', token],
    queryFn: () => api<GuaranteeRequest>(base),
    retry: false,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ['producer-request', token] });

  if (query.isPending) return <Loading />;
  if (query.isError)
    return (
      <main className={styles.shell}>
        <ErrorState error={query.error} />
      </main>
    );
  const r = query.data;
  const submitted = r.status === 'READY_FOR_VERIFICATION';

  return (
    <main className={styles.shell}>
      <div className={styles.brand}>
        <strong>AgroGarantías</strong>
        <RequestStageBadge stage={r.stage} />
      </div>

      <Panel
        className={styles.step}
        title="1 · Solicitud"
        subtitle={`Solicitada por ${r.requester.name}`}
      >
        <dl className={domain.facts}>
          <dt>Productor</dt>
          <dd>
            {r.producer.name} · CUIT {r.producer.taxId}
          </dd>
          <dt>Tipo de garantía</dt>
          <dd>{r.guaranteeType.name ?? r.guaranteeType.code}</dd>
          {r.requestedAmount != null ? (
            <>
              <dt>Monto solicitado</dt>
              <dd>
                {r.currency} {formatNumber(r.requestedAmount)}
              </dd>
            </>
          ) : null}
        </dl>
        {submitted ? (
          <Callout tone="success" title="Declaración enviada">
            Tu información quedó registrada y AgroGarantías está verificando el activo.{' '}
            {r.requester.name} recibe el resultado; no hace falta que hagas nada más.
          </Callout>
        ) : r.missing.length > 0 ? (
          <Callout tone="info" title="Falta completar">
            {r.missing.join(', ')}
          </Callout>
        ) : (
          <Callout tone="success">Todo completo: revisá y enviá la declaración al final.</Callout>
        )}
      </Panel>

      <EstablishmentStep request={r} base={base} onDone={refresh} disabled={submitted} />
      {r.establishment ? (
        <AssetStep request={r} base={base} onDone={refresh} disabled={submitted} />
      ) : null}
      {r.asset ? (
        <EvidenceStep request={r} base={base} onDone={refresh} disabled={submitted} />
      ) : null}

      {r.asset && !submitted ? <SubmitStep request={r} base={base} onDone={refresh} /> : null}
    </main>
  );
}

interface StepProps {
  request: GuaranteeRequest;
  base: string;
  onDone: () => unknown;
  disabled?: boolean;
}

function EstablishmentStep({ request: r, base, onDone, disabled }: StepProps) {
  const [form, setForm] = useState({
    name: '',
    holderName: r.producer.name,
    holderTaxId: r.producer.taxId,
    renspa: '',
    establishmentType: 'CRIA',
    tenure: 'OWNED',
    province: 'Buenos Aires',
    locality: '',
  });
  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (r.establishment) {
    return (
      <Panel className={styles.step} title="2 · Establecimiento ✓">
        <p className={styles.done}>
          {r.establishment.name} · {r.establishment.locality ? `${r.establishment.locality}, ` : ''}
          {r.establishment.province}
          {r.establishment.renspa ? ` · RENSPA ${r.establishment.renspa}` : ''}
        </p>
      </Panel>
    );
  }
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (form.name.trim().length < 2) return setError('Ingresá el nombre del establecimiento.');
    if (!location) return setError('Marcá la ubicación en el mapa.');
    setBusy(true);
    try {
      await api(`${base}/establishment`, {
        method: 'POST',
        body: {
          ...form,
          name: form.name.trim(),
          renspa: form.renspa.trim() || undefined,
          locality: form.locality.trim() || undefined,
          location,
        },
      });
      await onDone();
    } catch (e) {
      setError(message(e, 'No fue posible registrar el establecimiento.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel
      className={styles.step}
      title="2 · Establecimiento"
      subtitle="Dónde está el activo que ofrecés en garantía."
    >
      <form onSubmit={submit} className={domain.stack} aria-label="Establecimiento">
        <FormRow columns={2}>
          <Field label="Nombre del establecimiento" required>
            {(p) => <Input {...p} value={form.name} onChange={set('name')} disabled={disabled} />}
          </Field>
          <Field label="RENSPA" hint="NN.NNN.N.NNNNN/NN (si tiene)">
            {(p) => <Input {...p} value={form.renspa} onChange={set('renspa')} />}
          </Field>
        </FormRow>
        <FormRow columns={2}>
          <Field label="Titular" required>
            {(p) => <Input {...p} value={form.holderName} onChange={set('holderName')} />}
          </Field>
          <Field label="CUIT del titular" required>
            {(p) => <Input {...p} value={form.holderTaxId} onChange={set('holderTaxId')} />}
          </Field>
        </FormRow>
        <FormRow columns={2}>
          <Field label="Tipo de establecimiento">
            {(p) => (
              <Select {...p} value={form.establishmentType} onChange={set('establishmentType')}>
                {Object.entries(ESTABLISHMENT_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Tenencia">
            {(p) => (
              <Select {...p} value={form.tenure} onChange={set('tenure')}>
                {Object.entries(TENURE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </FormRow>
        <FormRow columns={2}>
          <Field label="Provincia">
            {(p) => (
              <Select {...p} value={form.province} onChange={set('province')}>
                {PROVINCES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Localidad">
            {(p) => <Input {...p} value={form.locality} onChange={set('locality')} />}
          </Field>
        </FormRow>
        <Field label="Ubicación" hint="Tocá el mapa en el casco del establecimiento" required>
          {() => <LocationPicker value={location} onChange={setLocation} />}
        </Field>
        {error ? <Callout tone="critical">{error}</Callout> : null}
        <Button type="submit" loading={busy} disabled={disabled}>
          Guardar establecimiento
        </Button>
      </form>
    </Panel>
  );
}

function AssetStep({ request: r, base, onDone, disabled }: StepProps) {
  const schema = r.guaranteeType.metadataSchema;
  const isArea = r.guaranteeType.verificationStrategy === 'VEGETATION_AREA';
  const unit = (r.guaranteeType.unit ?? 'UNIT') as Unit;
  const point = r.establishment?.point;
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [metadata, setMetadata] = useState<RawMetadata>(() =>
    schema ? toRawMetadata(schema) : {},
  );
  const [metadataErrors, setMetadataErrors] = useState<Record<string, string>>({});
  const [location, setLocation] = useState<PickedLocation | null>(
    point ? { latitude: point.coordinates[1], longitude: point.coordinates[0] } : null,
  );
  const [polygon, setPolygon] = useState<[number, number][] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (r.asset) {
    return (
      <Panel className={styles.step} title="3 · Activo declarado ✓">
        <p className={styles.done}>
          {r.asset.name} · {formatNumber(r.asset.declaredQuantity)}{' '}
          {unitLabel(r.asset.unit as Unit, r.asset.declaredQuantity)}
        </p>
      </Panel>
    );
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const declared = Number(quantity.replace(',', '.'));
    if (name.trim().length < 2) return setError('Ingresá un nombre para el activo.');
    if (!Number.isFinite(declared) || declared <= 0)
      return setError('Ingresá la cantidad declarada.');
    if (isArea && (!polygon || polygon.length < 3))
      return setError('Dibujá el polígono del lote en el mapa.');
    const parsed = schema ? parseMetadata(schema, metadata) : { data: {}, errors: {} };
    setMetadataErrors(parsed.errors);
    if (Object.keys(parsed.errors).length > 0) return setError('Revisá los datos marcados.');
    setBusy(true);
    try {
      await api(`${base}/asset`, {
        method: 'POST',
        body: {
          name: name.trim(),
          declaredQuantity: declared,
          location: location ?? undefined,
          area:
            polygon && polygon.length >= 3
              ? { type: 'Polygon', coordinates: [[...polygon, polygon[0]]] }
              : undefined,
          metadata: parsed.data,
        },
      });
      await onDone();
    } catch (e) {
      setError(message(e, 'No fue posible registrar el activo.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel
      className={styles.step}
      title="3 · Activo"
      subtitle={`${r.guaranteeType.name ?? ''}: qué ofrecés en garantía.`}
    >
      <form onSubmit={submit} className={domain.stack} aria-label="Activo">
        <FormRow columns={2}>
          <Field label="Nombre" required>
            {(p) => (
              <Input
                {...p}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Rodeo de cría"
              />
            )}
          </Field>
          <Field label={`Cantidad declarada (${unitLabel(unit)})`} required>
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            )}
          </Field>
        </FormRow>
        {schema ? (
          <MetadataForm
            schema={schema}
            value={metadata}
            onChange={setMetadata}
            errors={metadataErrors}
          />
        ) : null}
        {isArea ? (
          <Field label="Lote" hint="Dibujá el polígono de la superficie declarada" required>
            {() => (
              <LocationPicker
                value={location}
                onChange={setLocation}
                polygon={polygon}
                onPolygonChange={setPolygon}
                allowPolygon
              />
            )}
          </Field>
        ) : null}
        {error ? <Callout tone="critical">{error}</Callout> : null}
        <Button type="submit" loading={busy} disabled={disabled}>
          Declarar activo
        </Button>
      </form>
    </Panel>
  );
}

function EvidenceStep({ request: r, base, onDone, disabled }: StepProps) {
  const [type, setType] = useState('RENSPA');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isArea = r.guaranteeType.verificationStrategy === 'VEGETATION_AREA';
  const uploadDocument = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!file) return setError('Seleccioná un archivo PDF, JPG o PNG.');
    setBusy(true);
    try {
      const form = new FormData();
      form.set('type', type);
      form.set('file', file);
      await api(`${base}/documents`, { method: 'POST', form });
      setNotice('Documento cargado.');
      setFile(null);
      await onDone();
    } catch (e) {
      setError(message(e, 'No fue posible cargar el documento.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel
      className={styles.step}
      title="4 · Documentación y evidencia"
      subtitle={`${r.documentCount} documento(s) · ${r.evidenceCount} foto(s) cargadas`}
    >
      <div className={domain.stack}>
        {disabled ? null : (
          <>
            <h3 className={domain.sectionTitle}>
              Fotos del activo{' '}
              {isArea ? '(opcional: el lote se verifica por satélite)' : '(obligatorio)'}
            </h3>
            <EvidenceUpload
              assetId={r.asset!.id}
              defaultLocation={r.asset!.location}
              endpoint={`${base}/evidence`}
              onUploaded={() => void onDone()}
            />
            <h3 className={domain.sectionTitle}>Documentación</h3>
            <form
              onSubmit={uploadDocument}
              className={domain.stackTight}
              aria-label="Documentación"
            >
              <FormRow columns={2}>
                <Field label="Tipo de documento">
                  {(p) => (
                    <Select {...p} value={type} onChange={(e) => setType(e.target.value)}>
                      {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Archivo" hint="PDF, JPG o PNG · máx. 15 MB">
                  {(p) => (
                    <Input
                      {...p}
                      type="file"
                      accept="application/pdf,image/jpeg,image/png"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                  )}
                </Field>
              </FormRow>
              {error ? <Callout tone="critical">{error}</Callout> : null}
              {notice ? <Callout tone="success">{notice}</Callout> : null}
              <Button type="submit" variant="secondary" loading={busy}>
                Cargar documento
              </Button>
            </form>
          </>
        )}
      </div>
    </Panel>
  );
}

function SubmitStep({ request: r, base, onDone }: StepProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await api(`${base}/submit`, { method: 'POST' });
      await onDone();
    } catch (e) {
      setError(message(e, 'No fue posible enviar la declaración.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel className={styles.step} title="5 · Enviar declaración">
      <div className={domain.stack}>
        <p>
          Al enviar, tu declaración queda registrada y no puede modificarse. AgroGarantías verifica
          el activo y {r.requester.name} recibe el resultado.
        </p>
        {error ? <Callout tone="critical">{error}</Callout> : null}
        <Button onClick={submit} loading={busy} disabled={r.missing.length > 0} block>
          {r.missing.length > 0 ? `Falta: ${r.missing.join(', ')}` : 'Enviar declaración'}
        </Button>
      </div>
    </Panel>
  );
}
