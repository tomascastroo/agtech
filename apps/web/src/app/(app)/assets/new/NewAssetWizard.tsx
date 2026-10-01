'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { DevicesPanel } from '@/components/domain/DevicesPanel';
import { DocumentsPanel } from '@/components/domain/DocumentsPanel';
import { EvidenceUpload } from '@/components/domain/EvidenceUpload';
import {
  MetadataForm,
  parseMetadata,
  toRawMetadata,
  type RawMetadata,
} from '@/components/domain/MetadataForm';
import styles from '@/components/domain/domain.module.css';
import {
  LocationPicker,
  approximateHectares,
  type PickedLocation,
} from '@/components/map/LocationPicker';
import { MapView } from '@/components/map/MapView';
import { Button, LinkButton } from '@/components/ui/Button';
import { Callout, ErrorState, Loading } from '@/components/ui/Feedback';
import { Field, FormRow, Input, Select } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { api, ApiError } from '@/lib/api/client';
import { keys, useApiMutation, useAssetTypes, useEstablishments } from '@/lib/api/queries';
import type { AssetDetail, AssetType, EstablishmentSummary, GeoPoint } from '@/lib/api/types';
import { formatNumber, unitLabel } from '@/lib/format';
import { ESTABLISHMENT_TYPE_LABELS, STRATEGY_DESCRIPTIONS, TENURE_LABELS } from '@/lib/labels';

const STEPS = [
  { id: 'types', label: 'Activos' },
  { id: 'establishment', label: 'Establecimiento' },
  { id: 'info', label: 'Información' },
  { id: 'documents', label: 'Documentación' },
  { id: 'devices', label: 'Dispositivos' },
  { id: 'verify', label: 'Verificación' },
] as const;
type StepId = (typeof STEPS)[number]['id'];

const PROVINCES = [
  'Buenos Aires',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Ciudad Autónoma de Buenos Aires',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego',
  'Tucumán',
];

const SOURCE_LABELS: Record<string, string> = {
  CAMERA: 'cámaras',
  SATELLITE: 'satélite',
  MANUAL_UPLOAD: 'fotos',
  RFID: 'RFID',
  SENSOR: 'sensores',
};

interface AssetDraft {
  name: string;
  declaredQuantity: string;
  declaredValue: string;
  location: PickedLocation | null;
  polygon: [number, number][] | null;
  metadata: RawMetadata;
  errors: Record<string, string>;
  metadataErrors: Record<string, string>;
  createdId: string | null;
}

interface CreatedAsset {
  id: string;
  name: string;
  type: AssetType;
  establishmentId: string;
  location: GeoPoint;
}

const emptyEstablishment = {
  name: '',
  holderName: '',
  holderTaxId: '',
  renspa: '',
  establishmentType: 'CRIA',
  tenure: 'OWNED',
  province: 'Buenos Aires',
  locality: '',
  totalAreaHa: '',
};

const apiMessage = (e: unknown, fallback: string) => {
  if (!(e instanceof ApiError)) return fallback;
  const fields = e.fieldErrors.map((f) => f.message).join('. ');
  return fields ? `${e.message}. ${fields}` : e.message;
};

function Stepper({ current }: { current: StepId }) {
  const index = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className={styles.stepper} aria-label="Pasos del alta">
      {STEPS.map((step, i) => (
        <li
          key={step.id}
          className={`${styles.step} ${i === index ? styles.stepActive : i < index ? styles.stepDone : ''}`}
          aria-current={i === index ? 'step' : undefined}
        >
          <span className={styles.stepIndex}>
            {i < index ? <Icon name="check" size={12} /> : i + 1}
          </span>
          {step.label}
        </li>
      ))}
    </ol>
  );
}

export function NewAssetWizard() {
  const types = useAssetTypes();
  const establishments = useEstablishments();
  const [step, setStep] = useState<StepId>('types');
  const [selected, setSelected] = useState<string[]>([]);
  const [establishmentMode, setEstablishmentMode] = useState<'existing' | 'new'>('existing');
  const [establishmentId, setEstablishmentId] = useState('');
  const [newEstablishment, setNewEstablishment] = useState(emptyEstablishment);
  const [establishmentLocation, setEstablishmentLocation] = useState<PickedLocation | null>(null);
  const [establishmentBoundary, setEstablishmentBoundary] = useState<[number, number][] | null>(
    null,
  );
  const [drafts, setDrafts] = useState<Record<string, AssetDraft>>({});
  const [created, setCreated] = useState<CreatedAsset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const createEstablishment = useApiMutation(
    (body: object) => api<EstablishmentSummary>('/establishments', { method: 'POST', body }),
    [keys.establishments],
  );
  const createAsset = useApiMutation(
    (body: object) => api<AssetDetail>('/assets', { method: 'POST', body }),
    [['assets'], keys.dashboard, keys.portfolio],
  );

  const selectedTypes = useMemo(
    () =>
      selected
        .map((code) => types.data?.find((t) => t.code === code))
        .filter((t): t is AssetType => Boolean(t)),
    [selected, types.data],
  );
  const establishment = establishments.data?.find((e) => e.id === establishmentId) ?? null;

  if (types.isPending || establishments.isPending) return <Loading />;
  if (types.isError) return <ErrorState error={types.error} />;

  const go = (next: StepId) => {
    setError(null);
    setStep(next);
    window.scrollTo({ top: 0 });
  };

  const toggleType = (code: string) =>
    setSelected((current) =>
      current.includes(code) ? current.filter((c) => c !== code) : [...current, code],
    );

  const initDrafts = (est: { name: string; point: GeoPoint | null }) => {
    setDrafts((current) => {
      const next = { ...current };
      for (const type of selectedTypes) {
        next[type.code] ??= {
          name: `${type.name} — ${est.name}`,
          declaredQuantity: '',
          declaredValue: '',
          location: est.point
            ? { latitude: est.point.coordinates[1], longitude: est.point.coordinates[0] }
            : null,
          polygon: null,
          metadata: toRawMetadata(type.metadataSchema),
          errors: {},
          metadataErrors: {},
          createdId: null,
        };
      }
      return next;
    });
  };

  const submitEstablishment = async () => {
    setError(null);
    if (establishmentMode === 'existing') {
      if (!establishment) return setError('Seleccioná un establecimiento.');
      initDrafts(establishment);
      return go('info');
    }
    const form = newEstablishment;
    if (!form.name.trim() || !form.holderName.trim())
      return setError('Completá el nombre del establecimiento y el titular.');
    if (!/^\d{2}-\d{8}-\d$/.test(form.holderTaxId.trim()))
      return setError('El CUIT debe tener el formato NN-NNNNNNNN-N.');
    if (form.renspa.trim() && !/^\d{2}\.\d{3}\.\d\.\d{5}\/\d{2}$/.test(form.renspa.trim())) {
      return setError('El RENSPA debe tener el formato NN.NNN.N.NNNNN/NN.');
    }
    if (!establishmentLocation)
      return setError('Marcá la ubicación del establecimiento en el mapa.');
    setBusy(true);
    try {
      const est = await createEstablishment.mutateAsync({
        name: form.name.trim(),
        holderName: form.holderName.trim(),
        holderTaxId: form.holderTaxId.trim(),
        renspa: form.renspa.trim() || undefined,
        establishmentType: form.establishmentType,
        tenure: form.tenure,
        province: form.province,
        locality: form.locality.trim() || undefined,
        totalAreaHa: form.totalAreaHa ? Number(form.totalAreaHa) : undefined,
        location: establishmentLocation,
        boundary:
          establishmentBoundary && establishmentBoundary.length >= 3
            ? {
                type: 'Polygon',
                coordinates: [[...establishmentBoundary, establishmentBoundary[0]]],
              }
            : undefined,
      });
      setEstablishmentId(est.id);
      setEstablishmentMode('existing');
      initDrafts(est);
      go('info');
    } catch (e) {
      setError(apiMessage(e, 'No fue posible registrar el establecimiento.'));
    } finally {
      setBusy(false);
    }
  };

  const updateDraft = (code: string, patch: Partial<AssetDraft>) =>
    setDrafts((d) => ({ ...d, [code]: { ...d[code]!, ...patch } }));

  const submitAssets = async () => {
    setError(null);
    let valid = true;
    const parsed: Record<string, Record<string, unknown>> = {};
    const nextDrafts = { ...drafts };
    for (const type of selectedTypes) {
      const draft = drafts[type.code]!;
      if (draft.createdId) continue;
      const errors: Record<string, string> = {};
      if (draft.name.trim().length < 2) errors.name = 'Ingresá un nombre';
      const quantity = Number(draft.declaredQuantity.replace(',', '.'));
      if (!Number.isFinite(quantity) || quantity <= 0)
        errors.declaredQuantity = 'Ingresá una cantidad mayor a cero';
      if (draft.declaredValue && !(Number(draft.declaredValue) >= 0))
        errors.declaredValue = 'Valor inválido';
      if (!draft.location) errors.location = 'Indicá la ubicación';
      if (
        type.verificationStrategy === 'VEGETATION_AREA' &&
        (!draft.polygon || draft.polygon.length < 3)
      ) {
        errors.polygon = 'Dibujá el polígono de la superficie en el mapa';
      }
      const meta = parseMetadata(type.metadataSchema, draft.metadata);
      parsed[type.code] = meta.data;
      nextDrafts[type.code] = { ...draft, errors, metadataErrors: meta.errors };
      if (Object.keys(errors).length > 0 || Object.keys(meta.errors).length > 0) valid = false;
    }
    setDrafts(nextDrafts);
    if (!valid) return setError('Revisá los datos marcados.');

    setBusy(true);
    const done: CreatedAsset[] = [...created];
    try {
      for (const type of selectedTypes) {
        const draft = nextDrafts[type.code]!;
        if (draft.createdId) continue;
        const asset = await createAsset.mutateAsync({
          establishmentId,
          assetTypeCode: type.code,
          name: draft.name.trim(),
          declaredQuantity: Number(draft.declaredQuantity.replace(',', '.')),
          declaredValue: draft.declaredValue ? Number(draft.declaredValue) : undefined,
          currency: 'USD',
          location: draft.location,
          area:
            draft.polygon && draft.polygon.length >= 3
              ? { type: 'Polygon', coordinates: [[...draft.polygon, draft.polygon[0]]] }
              : undefined,
          metadata: parsed[type.code],
        });
        updateDraft(type.code, { createdId: asset.id });
        done.push({
          id: asset.id,
          name: asset.name,
          type,
          establishmentId,
          location: asset.location,
        });
        setCreated([...done]);
      }
      go('documents');
    } catch (e) {
      setError(apiMessage(e, 'No fue posible registrar el activo.'));
    } finally {
      setBusy(false);
    }
  };

  const context = establishment?.boundary
    ? [{ id: 'est', geometry: establishment.boundary, color: '#0f2a3d', dashed: true }]
    : [];

  return (
    <>
      <PageHeader
        title="Nuevo activo en garantía"
        breadcrumb={[{ href: '/assets', label: 'Activos y garantías' }]}
      />
      <Stepper current={step} />

      {step === 'types' ? (
        <Panel
          title="¿Qué activos querés poner como garantía?"
          subtitle="Podés elegir más de uno; cada activo se verifica con la fuente adecuada."
        >
          <div className={styles.optionGrid} role="group" aria-label="Tipos de activo">
            {types.data.map((type) => {
              const active = selected.includes(type.code);
              return (
                <button
                  key={type.code}
                  type="button"
                  className={`${styles.option} ${active ? styles.optionSelected : ''}`}
                  onClick={() => toggleType(type.code)}
                  aria-pressed={active}
                  data-testid={`asset-type-${type.code}`}
                >
                  {active ? (
                    <span className={styles.optionCheck}>
                      <Icon name="check" size={18} />
                    </span>
                  ) : null}
                  <span className={styles.optionTitle}>{type.name}</span>
                  <span className={styles.optionText}>
                    Se mide en {unitLabel(type.defaultUnit)} ·{' '}
                    {type.evidenceSources.map((s) => SOURCE_LABELS[s] ?? s).join(', ')}
                  </span>
                </button>
              );
            })}
          </div>
          <div className={styles.wizardFooter}>
            <LinkButton href="/assets" variant="ghost">
              Cancelar
            </LinkButton>
            <Button
              variant="primary"
              disabled={selected.length === 0}
              onClick={() => go('establishment')}
            >
              Continuar {selected.length > 0 ? `(${selected.length})` : ''}
            </Button>
          </div>
        </Panel>
      ) : null}

      {step === 'establishment' ? (
        <Panel
          title="¿Dónde están los activos?"
          subtitle="Elegí un establecimiento registrado o da de alta uno nuevo."
        >
          <div className={styles.stack}>
            <div className={`${styles.optionGrid} ${styles.optionWide}`}>
              <button
                type="button"
                className={`${styles.option} ${establishmentMode === 'existing' ? styles.optionSelected : ''}`}
                onClick={() => setEstablishmentMode('existing')}
                aria-pressed={establishmentMode === 'existing'}
              >
                <span className={styles.optionTitle}>Establecimiento registrado</span>
                <span className={styles.optionText}>
                  {establishments.data?.length ?? 0} establecimientos en la cartera.
                </span>
              </button>
              <button
                type="button"
                className={`${styles.option} ${establishmentMode === 'new' ? styles.optionSelected : ''}`}
                onClick={() => setEstablishmentMode('new')}
                aria-pressed={establishmentMode === 'new'}
              >
                <span className={styles.optionTitle}>Nuevo establecimiento</span>
                <span className={styles.optionText}>
                  Titular, CUIT, RENSPA y ubicación en el mapa.
                </span>
              </button>
            </div>

            {establishmentMode === 'existing' ? (
              <>
                <Field label="Establecimiento" required>
                  {(props) => (
                    <Select
                      {...props}
                      name="establishmentId"
                      value={establishmentId}
                      onChange={(e) => setEstablishmentId(e.target.value)}
                    >
                      <option value="">Seleccionar…</option>
                      {establishments.data?.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name} · {e.holderName} · {e.locality ? `${e.locality}, ` : ''}
                          {e.province}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                {establishment ? (
                  <MapView
                    label={`Ubicación de ${establishment.name}`}
                    height={280}
                    points={
                      establishment.point
                        ? [
                            {
                              id: establishment.id,
                              coordinates: establishment.point.coordinates,
                              color: '#0f2a3d',
                              selected: true,
                            },
                          ]
                        : []
                    }
                    polygons={context}
                  />
                ) : null}
              </>
            ) : (
              <>
                <FormRow columns={2}>
                  <Field label="Nombre del establecimiento" required>
                    {(props) => (
                      <Input
                        {...props}
                        name="establishmentName"
                        value={newEstablishment.name}
                        onChange={(e) =>
                          setNewEstablishment({ ...newEstablishment, name: e.target.value })
                        }
                      />
                    )}
                  </Field>
                  <Field label="Titular" required>
                    {(props) => (
                      <Input
                        {...props}
                        name="holderName"
                        value={newEstablishment.holderName}
                        onChange={(e) =>
                          setNewEstablishment({ ...newEstablishment, holderName: e.target.value })
                        }
                      />
                    )}
                  </Field>
                </FormRow>
                <FormRow columns={3}>
                  <Field label="CUIT del titular" required hint="NN-NNNNNNNN-N">
                    {(props) => (
                      <Input
                        {...props}
                        name="holderTaxId"
                        value={newEstablishment.holderTaxId}
                        onChange={(e) =>
                          setNewEstablishment({ ...newEstablishment, holderTaxId: e.target.value })
                        }
                      />
                    )}
                  </Field>
                  <Field label="RENSPA" hint="NN.NNN.N.NNNNN/NN">
                    {(props) => (
                      <Input
                        {...props}
                        name="renspa"
                        value={newEstablishment.renspa}
                        onChange={(e) =>
                          setNewEstablishment({ ...newEstablishment, renspa: e.target.value })
                        }
                      />
                    )}
                  </Field>
                  <Field label="Superficie total (ha)">
                    {(props) => (
                      <Input
                        {...props}
                        inputMode="decimal"
                        value={newEstablishment.totalAreaHa}
                        onChange={(e) =>
                          setNewEstablishment({ ...newEstablishment, totalAreaHa: e.target.value })
                        }
                      />
                    )}
                  </Field>
                </FormRow>
                <FormRow columns={2}>
                  <Field label="Tipo de explotación" required>
                    {(props) => (
                      <Select
                        {...props}
                        value={newEstablishment.establishmentType}
                        onChange={(e) =>
                          setNewEstablishment({
                            ...newEstablishment,
                            establishmentType: e.target.value,
                          })
                        }
                      >
                        {Object.entries(ESTABLISHMENT_TYPE_LABELS).map(([code, label]) => (
                          <option key={code} value={code}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label="Tenencia" required>
                    {(props) => (
                      <Select
                        {...props}
                        value={newEstablishment.tenure}
                        onChange={(e) =>
                          setNewEstablishment({ ...newEstablishment, tenure: e.target.value })
                        }
                      >
                        {Object.entries(TENURE_LABELS).map(([code, label]) => (
                          <option key={code} value={code}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </FormRow>
                <FormRow columns={2}>
                  <Field label="Provincia" required>
                    {(props) => (
                      <Select
                        {...props}
                        value={newEstablishment.province}
                        onChange={(e) =>
                          setNewEstablishment({ ...newEstablishment, province: e.target.value })
                        }
                      >
                        {PROVINCES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label="Localidad">
                    {(props) => (
                      <Input
                        {...props}
                        value={newEstablishment.locality}
                        onChange={(e) =>
                          setNewEstablishment({ ...newEstablishment, locality: e.target.value })
                        }
                      />
                    )}
                  </Field>
                </FormRow>
                <div>
                  <div className={styles.sectionTitle}>Ubicación y límite</div>
                  <LocationPicker
                    value={establishmentLocation}
                    onChange={setEstablishmentLocation}
                    polygon={establishmentBoundary}
                    onPolygonChange={setEstablishmentBoundary}
                    allowPolygon
                  />
                </div>
              </>
            )}
            {error ? <Callout tone="critical">{error}</Callout> : null}
          </div>
          <div className={styles.wizardFooter}>
            <Button variant="ghost" icon="chevronLeft" onClick={() => go('types')}>
              Volver
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void submitEstablishment()}>
              Continuar
            </Button>
          </div>
        </Panel>
      ) : null}

      {step === 'info' ? (
        <div className={styles.stack}>
          {selectedTypes.map((type) => {
            const draft = drafts[type.code];
            if (!draft) return null;
            const isArea = type.verificationStrategy === 'VEGETATION_AREA';
            return (
              <Panel
                key={type.code}
                title={type.name}
                subtitle={STRATEGY_DESCRIPTIONS[type.verificationStrategy]}
                actions={draft.createdId ? <span className={styles.muted}>Registrado</span> : null}
              >
                <fieldset
                  disabled={Boolean(draft.createdId)}
                  style={{ border: 0, padding: 0, margin: 0 }}
                  className={styles.stack}
                >
                  <FormRow columns={3}>
                    <Field label="Nombre del activo" required error={draft.errors.name}>
                      {(props) => (
                        <Input
                          {...props}
                          name={`name-${type.code}`}
                          value={draft.name}
                          maxLength={160}
                          onChange={(e) => updateDraft(type.code, { name: e.target.value })}
                        />
                      )}
                    </Field>
                    <Field
                      label={`Cantidad declarada (${unitLabel(type.defaultUnit)})`}
                      required
                      error={draft.errors.declaredQuantity}
                    >
                      {(props) => (
                        <Input
                          {...props}
                          name={`quantity-${type.code}`}
                          inputMode="decimal"
                          value={draft.declaredQuantity}
                          onChange={(e) =>
                            updateDraft(type.code, { declaredQuantity: e.target.value })
                          }
                        />
                      )}
                    </Field>
                    <Field label="Valor declarado (USD)" error={draft.errors.declaredValue}>
                      {(props) => (
                        <Input
                          {...props}
                          name={`value-${type.code}`}
                          inputMode="decimal"
                          value={draft.declaredValue}
                          onChange={(e) =>
                            updateDraft(type.code, { declaredValue: e.target.value })
                          }
                        />
                      )}
                    </Field>
                  </FormRow>
                  <MetadataForm
                    schema={type.metadataSchema}
                    value={draft.metadata}
                    onChange={(metadata) => updateDraft(type.code, { metadata })}
                    errors={draft.metadataErrors}
                  />
                  <div>
                    <div className={styles.sectionTitle}>
                      {isArea ? 'Ubicación y superficie' : 'Ubicación del activo'}
                    </div>
                    {!draft.createdId ? (
                      <LocationPicker
                        value={draft.location}
                        onChange={(location) => updateDraft(type.code, { location })}
                        polygon={draft.polygon}
                        onPolygonChange={(polygon) => updateDraft(type.code, { polygon })}
                        allowPolygon={isArea}
                        context={context}
                      />
                    ) : null}
                    {draft.polygon && draft.polygon.length >= 3 ? (
                      <p className={styles.muted} style={{ marginTop: 8 }}>
                        Superficie dibujada: {formatNumber(approximateHectares(draft.polygon), 1)}{' '}
                        ha (aproximada).
                      </p>
                    ) : null}
                    {draft.errors.location || draft.errors.polygon ? (
                      <p
                        role="alert"
                        style={{ color: 'var(--critical-fg)', fontSize: 13, marginTop: 6 }}
                      >
                        {draft.errors.location ?? draft.errors.polygon}
                      </p>
                    ) : null}
                  </div>
                </fieldset>
              </Panel>
            );
          })}
          {error ? <Callout tone="critical">{error}</Callout> : null}
          <div className={styles.wizardFooter}>
            <Button
              variant="ghost"
              icon="chevronLeft"
              onClick={() => go('establishment')}
              disabled={created.length > 0}
            >
              Volver
            </Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={() => void submitAssets()}
              data-testid="save-assets"
            >
              Guardar y continuar
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'documents' ? (
        <div className={styles.stack}>
          <Callout tone="info">
            Cargá la documentación requerida. Podés completarla más tarde desde la ficha del activo;
            la documentación faltante reduce el score.
          </Callout>
          {created.map((asset) => (
            <Panel key={asset.id} title={asset.name} subtitle={asset.type.name}>
              <DocumentsPanel assetId={asset.id} establishmentId={asset.establishmentId} compact />
            </Panel>
          ))}
          <div className={styles.wizardFooter}>
            <span />
            <Button variant="primary" onClick={() => go('devices')}>
              Continuar
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'devices' ? (
        <div className={styles.stack}>
          {created.map((asset) => {
            const usesCameras = asset.type.evidenceSources.includes('CAMERA');
            return (
              <Panel
                key={asset.id}
                title={asset.name}
                subtitle={STRATEGY_DESCRIPTIONS[asset.type.verificationStrategy]}
              >
                <div className={styles.stack}>
                  {usesCameras ? (
                    <DevicesPanel assetId={asset.id} defaultLocation={asset.location} usesCameras />
                  ) : (
                    <Callout tone="info" title="Verificación satelital">
                      Este activo se verifica con imágenes satelitales sobre el polígono declarado;
                      no requiere dispositivos en campo.
                    </Callout>
                  )}
                  {asset.type.evidenceSources.includes('MANUAL_UPLOAD') ? (
                    <details>
                      <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                        Cargar fotografías del activo
                      </summary>
                      <div style={{ marginTop: 12 }}>
                        <EvidenceUpload assetId={asset.id} defaultLocation={asset.location} />
                      </div>
                    </details>
                  ) : null}
                </div>
              </Panel>
            );
          })}
          <div className={styles.wizardFooter}>
            <Button variant="ghost" icon="chevronLeft" onClick={() => go('documents')}>
              Volver
            </Button>
            <Button variant="primary" onClick={() => go('verify')}>
              Continuar
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'verify' ? (
        <Panel
          title="Activos registrados"
          subtitle="Ejecutá la primera verificación para obtener el score y habilitar la confirmación como garantía."
        >
          <ul className={styles.requirements}>
            {created.map((asset) => (
              <li key={asset.id} className={styles.requirement}>
                <span className={styles.requirementName}>
                  <Icon name="check" size={16} />
                  <Link href={`/assets/${asset.id}`}>{asset.name}</Link>
                  <span className={styles.muted}>{asset.type.name}</span>
                </span>
                <LinkButton
                  href={`/assets/${asset.id}/verification?start=1`}
                  variant="primary"
                  size="sm"
                  icon="shield"
                >
                  Verificar ahora
                </LinkButton>
              </li>
            ))}
          </ul>
          <div className={styles.wizardFooter}>
            <LinkButton href="/assets" variant="ghost">
              Ir a activos
            </LinkButton>
            <LinkButton href="/dashboard">Ir al panel</LinkButton>
          </div>
        </Panel>
      ) : null}
    </>
  );
}
