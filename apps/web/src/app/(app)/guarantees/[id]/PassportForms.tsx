'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Feedback';
import { Checkbox, Field, FormRow, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { ApiError } from '@/lib/api/client';
import { useGuaranteeAction, type Passport } from '@/lib/api/collateral';

export type FormKind =
  | 'movement'
  | 'inspection'
  | 'requestInspection'
  | 'legal'
  | 'valuation'
  | 'correction'
  | 'document'
  | 'evidence'
  | 'finalize';

const TITLES: Record<FormKind, string> = {
  movement: 'Registrar movimiento',
  inspection: 'Registrar inspección presencial',
  requestInspection: 'Solicitar inspección presencial',
  legal: 'Datos legales de la garantía',
  valuation: 'Valuación (peso, precio, factor)',
  correction: 'Corregir declaración',
  document: 'Subir documento oficial',
  evidence: 'Nueva evidencia física',
  finalize: 'Finalizar garantía',
};

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
};
const num = (f: FormData, k: string) => {
  const v = str(f, k);
  return v === undefined ? undefined : Number(v.replace(',', '.'));
};
const nullable = (f: FormData, k: string) => str(f, k) ?? null;
const nullableNum = (f: FormData, k: string) => num(f, k) ?? null;

/** Formularios de acción del passport. Cada envío queda en el historial y la auditoría. */
export function PassportForm({
  kind,
  passport,
  inspectionId,
  documentType,
  onClose,
}: {
  kind: FormKind;
  passport: Passport;
  inspectionId?: string | null;
  documentType?: string;
  onClose: () => void;
}) {
  const action = useGuaranteeAction(passport.header.id);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<{
    latitude: number;
    longitude: number;
    accuracyM: number;
  } | null>(null);
  const [gpsState, setGpsState] = useState<'idle' | 'asking' | 'ok' | 'denied'>('idle');
  const origin = useRef<'CAMERA' | 'FILE'>('CAMERA');
  const [nowLocal] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });
  const g = passport;

  const askGps = () => {
    if (!('geolocation' in navigator)) return setGpsState('denied');
    setGpsState('asking');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPosition({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracyM: p.coords.accuracy,
        });
        setGpsState('ok');
      },
      () => setGpsState('denied'),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      switch (kind) {
        case 'movement':
          await action.mutateAsync({
            path: '/movements',
            body: {
              direction: str(f, 'direction'),
              kind: str(f, 'kind'),
              heads: num(f, 'heads'),
              category: str(f, 'category'),
              origin: str(f, 'origin'),
              destination: str(f, 'destination'),
              occurredAt: new Date(`${str(f, 'occurredAt')}T12:00:00`).toISOString(),
              documentId: str(f, 'documentId'),
              dteNumber: str(f, 'dteNumber'),
              notes: str(f, 'notes'),
            },
          });
          break;
        case 'inspection':
          await action.mutateAsync({
            path: inspectionId ? `/inspection/${inspectionId}` : '/inspection/record',
            body: {
              inspectorName: str(f, 'inspectorName'),
              performedAt: new Date(str(f, 'performedAt') ?? Date.now()).toISOString(),
              ...(position ? { latitude: position.latitude, longitude: position.longitude } : {}),
              observedHeads: num(f, 'observedHeads'),
              fullCount: f.get('fullCount') === 'on',
              rfidRead: num(f, 'rfidRead'),
              observations: str(f, 'observations'),
              discrepancies: str(f, 'discrepancy')
                ? [{ topic: 'Observación', description: str(f, 'discrepancy') }]
                : [],
              result: str(f, 'result'),
              signatureName: str(f, 'signatureName'),
              signatureAccepted: f.get('signatureAccepted') === 'on',
            },
          });
          break;
        case 'requestInspection':
          await action.mutateAsync({
            path: '/inspection',
            body: {
              reason: str(f, 'reason'),
              dueAt: str(f, 'dueAt')
                ? new Date(`${str(f, 'dueAt')}T12:00:00`).toISOString()
                : undefined,
            },
          });
          break;
        case 'legal':
          await action.mutateAsync({
            path: '',
            method: 'PATCH',
            body: {
              legalInstrument: str(f, 'legalInstrument'),
              legalIdentifier: nullable(f, 'legalIdentifier'),
              legalStatus: str(f, 'legalStatus'),
              lienPriority: nullableNum(f, 'lienPriority'),
              immobilizationStatus: str(f, 'immobilizationStatus'),
              immobilizationReference: nullable(f, 'immobilizationReference'),
              amount: nullableNum(f, 'amount'),
              debtAmount: nullableNum(f, 'debtAmount'),
              currency: str(f, 'currency'),
              grantedAt: nullable(f, 'grantedAt'),
              expiresAt: nullable(f, 'expiresAt'),
            },
          });
          break;
        case 'valuation':
          await action.mutateAsync({
            path: '',
            method: 'PATCH',
            body: {
              averageWeightKg: nullableNum(f, 'averageWeightKg'),
              weightSource: nullable(f, 'weightSource'),
              pricePerKg: nullableNum(f, 'pricePerKg'),
              priceCurrency: str(f, 'priceCurrency') ?? null,
              priceSource: nullable(f, 'priceSource'),
              priceDate: nullable(f, 'priceDate'),
              qualityFactor: nullableNum(f, 'qualityFactor'),
            },
          });
          break;
        case 'correction':
          await action.mutateAsync({
            path: '/declaration',
            body: { heads: num(f, 'heads'), reason: str(f, 'reason') ?? '' },
          });
          break;
        case 'document': {
          const form = new FormData();
          const file = f.get('file');
          if (!(file instanceof File) || !file.size)
            throw new ApiError(422, 'VALIDATION', 'Elegí el archivo');
          form.set('file', file);
          form.set('type', str(f, 'type') ?? 'OTHER');
          if (str(f, 'title')) form.set('title', str(f, 'title')!);
          if (str(f, 'issuedAt')) form.set('issuedAt', str(f, 'issuedAt')!);
          await action.mutateAsync({ path: '/documents', form });
          break;
        }
        case 'evidence': {
          const file = f.get(origin.current === 'CAMERA' ? 'camera' : 'file');
          if (!(file instanceof File) || !file.size)
            throw new ApiError(422, 'VALIDATION', 'Tomá o elegí una foto');
          const form = new FormData();
          form.set('file', file);
          form.set('captureOrigin', origin.current);
          form.set(
            'capturedAt',
            new Date(Math.min(file.lastModified || Date.now(), Date.now())).toISOString(),
          );
          if (position) {
            form.set('latitude', String(position.latitude));
            form.set('longitude', String(position.longitude));
            form.set('accuracyM', String(Math.round(position.accuracyM)));
            form.set('locationSource', 'DEVICE_GPS');
          }
          if (str(f, 'challengeCode')) form.set('challengeCode', str(f, 'challengeCode')!);
          await action.mutateAsync({ path: '/evidence', form });
          break;
        }
        case 'finalize':
          await action.mutateAsync({ path: '/finalize', body: { reason: str(f, 'reason') ?? '' } });
          break;
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar');
    }
  };

  const footer = (
    <>
      <Button variant="ghost" onClick={onClose}>
        Cancelar
      </Button>
      <Button variant="primary" type="submit" form="passport-form" loading={action.isPending}>
        Guardar
      </Button>
    </>
  );

  let body: ReactNode = null;
  const today = nowLocal.slice(0, 10);
  const docs = g.documents as { id: string; title: string; type: string }[];
  switch (kind) {
    case 'movement':
      body = (
        <>
          <FormRow>
            <Field label="Tipo" required>
              {(p) => (
                <Select {...p} name="direction" defaultValue="EGRESO">
                  <option value="EGRESO">Egreso</option>
                  <option value="INGRESO">Ingreso</option>
                </Select>
              )}
            </Field>
            <Field label="Motivo" required>
              {(p) => (
                <Select {...p} name="kind" defaultValue="VENTA">
                  {['VENTA', 'TRASLADO', 'FAENA', 'MUERTE', 'COMPRA', 'NACIMIENTO', 'OTRO'].map(
                    (k) => (
                      <option key={k} value={k}>
                        {k.charAt(0) + k.slice(1).toLowerCase()}
                      </option>
                    ),
                  )}
                </Select>
              )}
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Cabezas" required>
              {(p) => <Input {...p} name="heads" type="number" min={1} required />}
            </Field>
            <Field label="Fecha" required>
              {(p) => (
                <Input
                  {...p}
                  name="occurredAt"
                  type="date"
                  max={today}
                  defaultValue={today}
                  required
                />
              )}
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Origen">{(p) => <Input {...p} name="origin" />}</Field>
            <Field label="Destino">{(p) => <Input {...p} name="destination" />}</Field>
          </FormRow>
          <FormRow>
            <Field label="Categoría">
              {(p) => <Input {...p} name="category" placeholder="Novillos, vacas…" />}
            </Field>
            <Field label="N° de DT-e">{(p) => <Input {...p} name="dteNumber" />}</Field>
          </FormRow>
          <Field
            label="Documento que lo respalda"
            hint="Sin documento queda como DECLARADO. Con un DT-e cargado queda DOCUMENTADO. Nunca OFICIAL: no hay conexión con SENASA."
          >
            {(p) => (
              <Select {...p} name="documentId" defaultValue="">
                <option value="">Sin documento (declarado)</option>
                {docs
                  .filter((d) =>
                    ['DTE', 'TRAZA_REPORT', 'STOCK_CERTIFICATE', 'OTHER'].includes(d.type),
                  )
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label="Notas">{(p) => <Textarea {...p} name="notes" rows={2} />}</Field>
        </>
      );
      break;
    case 'inspection':
      body = (
        <>
          <Callout tone="info">
            La inspección es un escalamiento: su conteo se cruza con lo esperado igual que cualquier
            otra evidencia. Una vez firmada, el acta no se puede modificar.
          </Callout>
          <FormRow>
            <Field label="Inspector" required>
              {(p) => <Input {...p} name="inspectorName" required />}
            </Field>
            <Field label="Fecha y hora" required>
              {(p) => (
                <Input
                  {...p}
                  name="performedAt"
                  type="datetime-local"
                  required
                  defaultValue={nowLocal}
                />
              )}
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Animales observados" required>
              {(p) => <Input {...p} name="observedHeads" type="number" min={0} required />}
            </Field>
            <Field label="Caravanas RFID leídas">
              {(p) => <Input {...p} name="rfidRead" type="number" min={0} />}
            </Field>
          </FormRow>
          <Checkbox
            name="fullCount"
            label="Conteo completo del rodeo (no una parte)"
            defaultChecked
          />
          <div>
            <Button size="sm" icon="pin" onClick={askGps} loading={gpsState === 'asking'}>
              {gpsState === 'ok'
                ? `Ubicación tomada (±${Math.round(position!.accuracyM)} m)`
                : 'Tomar ubicación GPS'}
            </Button>
            {gpsState === 'denied' ? (
              <span> Sin ubicación: el acta queda sin georreferencia.</span>
            ) : null}
          </div>
          <Field label="Resultado" required>
            {(p) => (
              <Select {...p} name="result" defaultValue="CONFORME">
                <option value="CONFORME">Conforme</option>
                <option value="CON_OBSERVACIONES">Con observaciones</option>
                <option value="NO_CONFORME">No conforme</option>
                <option value="NO_DETERMINABLE">No determinable</option>
              </Select>
            )}
          </Field>
          <Field label="Observaciones">
            {(p) => <Textarea {...p} name="observations" rows={2} />}
          </Field>
          <Field label="Discrepancias">
            {(p) => <Textarea {...p} name="discrepancy" rows={2} />}
          </Field>
          <Field label="Firma (nombre de quien firma)" required>
            {(p) => <Input {...p} name="signatureName" required />}
          </Field>
          <Checkbox
            name="signatureAccepted"
            label="Firmo el acta: lo registrado es lo que observé"
            required
          />
        </>
      );
      break;
    case 'requestInspection':
      body = (
        <>
          <Field label="Motivo" required>
            {(p) => (
              <Textarea
                {...p}
                name="reason"
                rows={3}
                required
                defaultValue={g.header.stateReason ?? ''}
              />
            )}
          </Field>
          <Field label="Fecha límite">
            {(p) => <Input {...p} name="dueAt" type="date" min={today} />}
          </Field>
        </>
      );
      break;
    case 'legal':
      body = (
        <>
          <Callout tone="neutral">
            Datos que informa la entidad. AgroGarantías no los consulta en registros y no los
            presenta como verificados.
          </Callout>
          <FormRow>
            <Field label="Instrumento">
              {(p) => (
                <Select {...p} name="legalInstrument" defaultValue={g.legal.instrument}>
                  <option value="NO_INFORMADO">No informado</option>
                  <option value="PRENDA_FIJA">Prenda fija</option>
                  <option value="PRENDA_FLOTANTE">Prenda flotante</option>
                  <option value="WARRANT">Warrant</option>
                  <option value="OTRO">Otro</option>
                </Select>
              )}
            </Field>
            <Field label="N° de inscripción / warrant">
              {(p) => (
                <Input {...p} name="legalIdentifier" defaultValue={g.legal.identifier ?? ''} />
              )}
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Estado registral">
              {(p) => (
                <Select {...p} name="legalStatus" defaultValue={g.legal.status}>
                  <option value="NO_INFORMADO">No informado</option>
                  <option value="EN_TRAMITE">En trámite</option>
                  <option value="INSCRIPTA">Inscripta</option>
                  <option value="VIGENTE">Vigente</option>
                  <option value="CANCELADA">Cancelada</option>
                </Select>
              )}
            </Field>
            <Field label="Prioridad (grado)">
              {(p) => (
                <Input
                  {...p}
                  name="lienPriority"
                  type="number"
                  min={1}
                  defaultValue={g.legal.lienPriority ?? ''}
                />
              )}
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Inmovilización en SENASA">
              {(p) => (
                <Select
                  {...p}
                  name="immobilizationStatus"
                  defaultValue={g.legal.immobilizationStatus}
                >
                  <option value="NO_INFORMADA">No informada</option>
                  <option value="NO_APLICA">No aplica</option>
                  <option value="SOLICITADA">Solicitada</option>
                  <option value="VIGENTE">Vigente</option>
                  <option value="LEVANTADA">Levantada</option>
                </Select>
              )}
            </Field>
            <Field label="Referencia">
              {(p) => (
                <Input
                  {...p}
                  name="immobilizationReference"
                  defaultValue={g.legal.immobilizationReference ?? ''}
                />
              )}
            </Field>
          </FormRow>
          <FormRow columns={3}>
            <Field label="Monto garantizado">
              {(p) => (
                <Input
                  {...p}
                  name="amount"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={g.legal.amount ?? ''}
                />
              )}
            </Field>
            <Field label="Deuda vigente">
              {(p) => (
                <Input
                  {...p}
                  name="debtAmount"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={g.legal.debtAmount ?? ''}
                />
              )}
            </Field>
            <Field label="Moneda">
              {(p) => (
                <Select {...p} name="currency" defaultValue={g.legal.currency}>
                  <option>USD</option>
                  <option>ARS</option>
                </Select>
              )}
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Otorgamiento">
              {(p) => (
                <Input {...p} name="grantedAt" type="date" defaultValue={g.legal.grantedAt ?? ''} />
              )}
            </Field>
            <Field label="Vencimiento">
              {(p) => (
                <Input {...p} name="expiresAt" type="date" defaultValue={g.legal.expiresAt ?? ''} />
              )}
            </Field>
          </FormRow>
        </>
      );
      break;
    case 'valuation':
      body = (
        <>
          <Callout tone="neutral">
            La cobertura se calcula solo con estos datos y su fuente. Si falta alguno, queda NO
            DETERMINABLE: no se estiman pesos ni precios.
          </Callout>
          <FormRow>
            <Field label="Peso promedio (kg)">
              {(p) => (
                <Input
                  {...p}
                  name="averageWeightKg"
                  type="number"
                  min={1}
                  step="0.1"
                  defaultValue={g.valuation.averageWeightKg ?? ''}
                />
              )}
            </Field>
            <Field label="Fuente del peso">
              {(p) => (
                <Input
                  {...p}
                  name="weightSource"
                  placeholder="Balanza, tropa, informe…"
                  defaultValue={g.valuation.weightSource ?? ''}
                />
              )}
            </Field>
          </FormRow>
          <FormRow columns={3}>
            <Field label="Precio por kg">
              {(p) => (
                <Input
                  {...p}
                  name="pricePerKg"
                  type="number"
                  min={0}
                  step="0.0001"
                  defaultValue={g.valuation.pricePerKg ?? ''}
                />
              )}
            </Field>
            <Field label="Moneda">
              {(p) => (
                <Select
                  {...p}
                  name="priceCurrency"
                  defaultValue={g.valuation.priceCurrency ?? g.legal.currency}
                >
                  <option>USD</option>
                  <option>ARS</option>
                </Select>
              )}
            </Field>
            <Field label="Fecha del precio">
              {(p) => (
                <Input
                  {...p}
                  name="priceDate"
                  type="date"
                  max={today}
                  defaultValue={g.valuation.priceDate ?? ''}
                />
              )}
            </Field>
          </FormRow>
          <Field label="Fuente del precio">
            {(p) => (
              <Input
                {...p}
                name="priceSource"
                placeholder="Mercado Agroganadero, índice…"
                defaultValue={g.valuation.priceSource ?? ''}
              />
            )}
          </Field>
          <Field
            label="Factor de calidad (0 a 1)"
            hint="Descuento por categoría o estado que define la entidad."
          >
            {(p) => (
              <Input
                {...p}
                name="qualityFactor"
                type="number"
                min={0}
                max={1}
                step="0.001"
                defaultValue={g.valuation.qualityFactor ?? ''}
              />
            )}
          </Field>
        </>
      );
      break;
    case 'correction':
      body = (
        <>
          <Callout tone="info">
            La declaración vigente (versión {g.declaration.current?.version}) no se modifica: se
            crea una versión nueva con el motivo, la fecha y tu usuario.
          </Callout>
          <Field label="Cabezas declaradas" required>
            {(p) => (
              <Input
                {...p}
                name="heads"
                type="number"
                min={1}
                required
                defaultValue={g.declaration.current?.heads}
              />
            )}
          </Field>
          <Field label="Motivo" required>
            {(p) => <Textarea {...p} name="reason" rows={2} required />}
          </Field>
        </>
      );
      break;
    case 'document':
      body = (
        <>
          <Callout tone="neutral">
            Es una copia aportada: se lee con OCR y se cruza con lo declarado, pero no equivale a
            una consulta en línea a la fuente oficial.
          </Callout>
          <Field label="Tipo" required>
            {(p) => (
              <Select {...p} name="type" defaultValue={documentType ?? 'DTE'}>
                <option value="RENSPA">Constancia RENSPA</option>
                <option value="STOCK_CERTIFICATE">Existencias SIGSA (SENASA)</option>
                <option value="DTE">DT-e</option>
                <option value="TRAZA_REPORT">Constancia TRAZA</option>
                <option value="PLEDGE_CONTRACT">Contrato de prenda / warrant</option>
                <option value="LIEN_REPORT">Informe de gravámenes</option>
                <option value="IMMOBILIZATION_CERTIFICATE">Constancia de inmovilización</option>
                <option value="OTHER">Otro</option>
              </Select>
            )}
          </Field>
          <Field label="Título">{(p) => <Input {...p} name="title" />}</Field>
          <Field label="Fecha de emisión">
            {(p) => <Input {...p} name="issuedAt" type="date" max={today} />}
          </Field>
          <Field label="Archivo (PDF o imagen)" required>
            {(p) => (
              <Input {...p} name="file" type="file" accept="application/pdf,image/*" required />
            )}
          </Field>
        </>
      );
      break;
    case 'evidence':
      body = (
        <>
          <Callout tone="info">
            Tomá la foto en el campo con la cámara: vale más que un archivo de la galería (que puede
            ser viejo o de otro lugar). Mostrá en la foto el código de desafío si la entidad lo
            pidió.
          </Callout>
          <Field label="Foto con la cámara (recomendado)">
            {(p) => (
              <Input
                {...p}
                name="camera"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={() => (origin.current = 'CAMERA')}
              />
            )}
          </Field>
          <Field
            label="O archivo desde la galería / PC"
            hint="Queda marcado como ARCHIVO CARGADO y su calidad máxima es baja."
          >
            {(p) => (
              <Input
                {...p}
                name="file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={() => (origin.current = 'FILE')}
              />
            )}
          </Field>
          <div>
            <Button size="sm" icon="pin" onClick={askGps} loading={gpsState === 'asking'}>
              {gpsState === 'ok'
                ? `Ubicación tomada (±${Math.round(position!.accuracyM)} m)`
                : 'Tomar ubicación GPS'}
            </Button>
            {gpsState === 'denied' ? <span> Sin GPS: la evidencia pierde calidad.</span> : null}
          </div>
          <Field label="Código de desafío visible en la foto">
            {(p) => <Input {...p} name="challengeCode" maxLength={12} placeholder="p. ej. 4821" />}
          </Field>
        </>
      );
      break;
    case 'finalize':
      body = (
        <>
          <Callout tone="warning">
            La garantía deja de monitorearse. El historial, las verificaciones y las evidencias se
            conservan.
          </Callout>
          <Field label="Motivo" required>
            {(p) => <Textarea {...p} name="reason" rows={2} required />}
          </Field>
        </>
      );
      break;
  }

  return (
    <Modal open title={TITLES[kind]} onClose={onClose} footer={footer}>
      <form
        id="passport-form"
        onSubmit={submit}
        style={{ display: 'grid', gap: 12 }}
        data-testid={`form-${kind}`}
      >
        {body}
        {error ? <Callout tone="critical">{error}</Callout> : null}
      </form>
    </Modal>
  );
}
