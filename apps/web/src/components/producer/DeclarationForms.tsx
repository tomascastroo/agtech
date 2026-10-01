'use client';

import { useState, type FormEvent } from 'react';
import {
  MetadataForm,
  parseMetadata,
  toRawMetadata,
  type RawMetadata,
} from '@/components/domain/MetadataForm';
import domain from '@/components/domain/domain.module.css';
import { LocationPicker, type PickedLocation } from '@/components/map/LocationPicker';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Feedback';
import { Field, FormRow, Input, Select } from '@/components/ui/Field';
import { api, ApiError } from '@/lib/api/client';
import type { GuaranteeRequest, Unit } from '@/lib/api/types';
import { formatNumber, unitLabel } from '@/lib/format';
import { ESTABLISHMENT_TYPE_LABELS, PROVINCES, TENURE_LABELS } from '@/lib/labels';
import styles from './producer.module.css';

const message = (e: unknown, fallback: string) => {
  if (!(e instanceof ApiError)) return fallback;
  const fields = e.fieldErrors.map((f) => f.message).join('. ');
  return fields ? `${e.message}. ${fields}` : e.message;
};

/** Declaración del productor: establecimiento y activo (se envían a `${base}/establishment|asset`). */
interface StepProps {
  request: GuaranteeRequest;
  base: string;
  onDone: () => unknown;
  disabled?: boolean;
}

export function EstablishmentStep({ request: r, base, onDone, disabled }: StepProps) {
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
      <div>
        <p className={styles.muted}>
          {r.establishment.name} · {r.establishment.locality ? `${r.establishment.locality}, ` : ''}
          {r.establishment.province}
          {r.establishment.renspa ? ` · RENSPA ${r.establishment.renspa}` : ''}
        </p>
      </div>
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
    <div>
      <form onSubmit={submit} className={domain.stack} aria-label="Establecimiento">
        <FormRow columns={2}>
          <Field label="Nombre del establecimiento" required>
            {(p) => <Input {...p} value={form.name} onChange={set('name')} disabled={disabled} />}
          </Field>
          <Field label="RENSPA" hint="NN.NNN.N.NNNNN/NN (si tiene)">
            {(p) => <Input {...p} value={form.renspa} onChange={set('renspa')} />}
          </Field>
        </FormRow>
        <details className={styles.details}>
          <summary>Titular, tipo y tenencia</summary>
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
        </details>
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
    </div>
  );
}

export function AssetStep({ request: r, base, onDone, disabled }: StepProps) {
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
      <div>
        <p className={styles.muted}>
          {r.asset.name} · {formatNumber(r.asset.declaredQuantity)}{' '}
          {unitLabel(r.asset.unit as Unit, r.asset.declaredQuantity)}
        </p>
      </div>
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
    <div>
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
    </div>
  );
}
