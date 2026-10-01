'use client';

import { useState, type FormEvent } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Callout, ErrorState, Loading } from '@/components/ui/Feedback';
import { Checkbox, Field, FormRow, Input, Select, Textarea } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { CellTitle, DataTable } from '@/components/ui/Table';
import { api, ApiError } from '@/lib/api/client';
import { keys, useApiMutation, useDevices } from '@/lib/api/queries';
import type { DeviceInstallation, GeoPoint } from '@/lib/api/types';
import { formatRelative } from '@/lib/format';
import {
  CONNECTIVITY_LABELS,
  DEVICE_STATUS_LABELS,
  DEVICE_TYPE_LABELS,
  INSTALLATION_STATUS_LABELS,
} from '@/lib/labels';
import { useCan } from '@/lib/permissions';
import { SimulatedBadge } from './StatusBadges';
import styles from './domain.module.css';

const POWER_LABELS: Record<string, string> = {
  SOLAR: 'Solar',
  GRID: 'Red eléctrica',
  BATTERY: 'Batería',
};

const errorText = (e: unknown, fallback: string) => {
  if (!(e instanceof ApiError)) return fallback;
  const fields = e.fieldErrors.map((f) => f.message).join('. ');
  return fields ? `${e.message}: ${fields}` : e.message;
};

function KitRequestForm({ assetId, onDone }: { assetId: string; onDone: () => void }) {
  const [form, setForm] = useState({
    cameras: '4',
    connectivity: 'LTE_4G',
    solarPower: true,
    rfidReader: false,
    shippingAddress: '',
    contactName: '',
    contactPhone: '',
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);
  const mutation = useApiMutation(
    (body: object) =>
      api<DeviceInstallation>(`/assets/${assetId}/devices/kit-request`, { method: 'POST', body }),
    [keys.devices(assetId)],
  );
  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await mutation.mutateAsync({
        cameras: Number(form.cameras),
        connectivity: form.connectivity,
        solarPower: form.solarPower,
        rfidReader: form.rfidReader,
        shippingAddress: form.shippingAddress.trim(),
        contactName: form.contactName.trim(),
        contactPhone: form.contactPhone.trim(),
        notes: form.notes.trim() || undefined,
      });
      onDone();
    } catch (e) {
      setError(errorText(e, 'No fue posible registrar la solicitud.'));
    }
  };

  return (
    <form onSubmit={submit} className={styles.stackTight} aria-label="Solicitud de kit">
      <FormRow columns={3}>
        <Field label="Cámaras" required>
          {(props) => (
            <Input
              {...props}
              type="number"
              min={1}
              max={20}
              value={form.cameras}
              onChange={(e) => set('cameras', e.target.value)}
            />
          )}
        </Field>
        <Field label="Conectividad" required>
          {(props) => (
            <Select
              {...props}
              value={form.connectivity}
              onChange={(e) => set('connectivity', e.target.value)}
            >
              {Object.entries(CONNECTIVITY_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className={styles.stackTight} style={{ justifyContent: 'flex-end', paddingBottom: 6 }}>
          <Checkbox
            label="Alimentación solar"
            checked={form.solarPower}
            onChange={(e) => set('solarPower', e.target.checked)}
          />
          <Checkbox
            label="Lector RFID"
            checked={form.rfidReader}
            onChange={(e) => set('rfidReader', e.target.checked)}
          />
        </div>
      </FormRow>
      <Field label="Dirección de envío" required>
        {(props) => (
          <Input
            {...props}
            value={form.shippingAddress}
            maxLength={255}
            onChange={(e) => set('shippingAddress', e.target.value)}
            placeholder="Ruta, km, localidad, provincia"
          />
        )}
      </Field>
      <FormRow columns={2}>
        <Field label="Contacto en campo" required>
          {(props) => (
            <Input
              {...props}
              value={form.contactName}
              maxLength={120}
              onChange={(e) => set('contactName', e.target.value)}
            />
          )}
        </Field>
        <Field label="Teléfono" required>
          {(props) => (
            <Input
              {...props}
              type="tel"
              value={form.contactPhone}
              onChange={(e) => set('contactPhone', e.target.value)}
            />
          )}
        </Field>
      </FormRow>
      <Field label="Observaciones">
        {(props) => (
          <Textarea
            {...props}
            rows={2}
            maxLength={1000}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        )}
      </Field>
      {error ? <Callout tone="critical">{error}</Callout> : null}
      <div>
        <Button type="submit" variant="primary" loading={mutation.isPending}>
          Solicitar kit
        </Button>
      </div>
    </form>
  );
}

function RegisterDeviceForm({
  assetId,
  defaultLocation,
  onDone,
}: {
  assetId: string;
  defaultLocation: GeoPoint | null;
  onDone: (online: boolean) => void;
}) {
  const [form, setForm] = useState({
    type: 'FIXED_CAMERA',
    serialNumber: '',
    model: '',
    connectivity: 'LTE_4G',
    powerSource: 'SOLAR',
    label: '',
    latitude: defaultLocation ? String(defaultLocation.coordinates[1]) : '',
    longitude: defaultLocation ? String(defaultLocation.coordinates[0]) : '',
  });
  const [error, setError] = useState<string | null>(null);
  const mutation = useApiMutation(
    (body: object) =>
      api<DeviceInstallation & { connection: boolean }>(`/assets/${assetId}/devices`, {
        method: 'POST',
        body,
      }),
    [keys.devices(assetId)],
  );
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const latitude = form.latitude ? Number(form.latitude) : undefined;
    const longitude = form.longitude ? Number(form.longitude) : undefined;
    try {
      const result = await mutation.mutateAsync({
        type: form.type,
        serialNumber: form.serialNumber.trim(),
        model: form.model.trim() || undefined,
        connectivity: form.connectivity,
        powerSource: form.powerSource,
        label: form.label.trim(),
        latitude,
        longitude,
      });
      onDone(result.connection);
    } catch (e) {
      setError(errorText(e, 'No fue posible registrar el dispositivo.'));
    }
  };

  return (
    <form
      onSubmit={submit}
      className={styles.stackTight}
      aria-label="Registro de dispositivo instalado"
    >
      <FormRow columns={3}>
        <Field label="Tipo" required>
          {(props) => (
            <Select {...props} value={form.type} onChange={(e) => set('type', e.target.value)}>
              {Object.entries(DEVICE_TYPE_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Número de serie" required hint="Letras, números y guiones">
          {(props) => (
            <Input
              {...props}
              value={form.serialNumber}
              maxLength={64}
              onChange={(e) => set('serialNumber', e.target.value)}
            />
          )}
        </Field>
        <Field label="Modelo">
          {(props) => (
            <Input
              {...props}
              value={form.model}
              maxLength={80}
              onChange={(e) => set('model', e.target.value)}
            />
          )}
        </Field>
      </FormRow>
      <FormRow columns={3}>
        <Field label="Ubicación / referencia" required>
          {(props) => (
            <Input
              {...props}
              value={form.label}
              maxLength={120}
              placeholder="Aguada Norte"
              onChange={(e) => set('label', e.target.value)}
            />
          )}
        </Field>
        <Field label="Conectividad" required>
          {(props) => (
            <Select
              {...props}
              value={form.connectivity}
              onChange={(e) => set('connectivity', e.target.value)}
            >
              {Object.entries(CONNECTIVITY_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Alimentación" required>
          {(props) => (
            <Select
              {...props}
              value={form.powerSource}
              onChange={(e) => set('powerSource', e.target.value)}
            >
              {Object.entries(POWER_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </FormRow>
      <FormRow columns={2}>
        <Field label="Latitud">
          {(props) => (
            <Input
              {...props}
              inputMode="decimal"
              value={form.latitude}
              onChange={(e) => set('latitude', e.target.value)}
            />
          )}
        </Field>
        <Field label="Longitud">
          {(props) => (
            <Input
              {...props}
              inputMode="decimal"
              value={form.longitude}
              onChange={(e) => set('longitude', e.target.value)}
            />
          )}
        </Field>
      </FormRow>
      {error ? <Callout tone="critical">{error}</Callout> : null}
      <div>
        <Button type="submit" variant="primary" loading={mutation.isPending}>
          Registrar y probar conexión
        </Button>
      </div>
    </form>
  );
}

/** Instalación de dispositivos: envío de kit o registro de equipos ya instalados. */
export function DevicesPanel({
  assetId,
  defaultLocation,
  usesCameras,
}: {
  assetId: string;
  defaultLocation: GeoPoint | null;
  usesCameras: boolean;
}) {
  const can = useCan();
  const query = useDevices(assetId);
  const [mode, setMode] = useState<'kit' | 'installed' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null);

  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} />;
  const installations = query.data;
  const simulatedGateway = installations.some((i) => i.device?.gateway === 'simulated');

  return (
    <div className={styles.stack}>
      {!usesCameras ? (
        <Callout tone="info" title="Este activo no requiere dispositivos en campo">
          Se verifica con imágenes satelitales y/o fotografías cargadas. Podés sumar cámaras para
          reforzar la evidencia.
        </Callout>
      ) : null}

      {installations.length > 0 ? (
        <DataTable<DeviceInstallation>
          caption="Dispositivos"
          rows={installations}
          rowKey={(i) => i.id}
          columns={[
            {
              key: 'label',
              header: 'Instalación',
              render: (i) => (
                <CellTitle
                  title={i.label}
                  subtitle={
                    i.device
                      ? `${DEVICE_TYPE_LABELS[i.device.type] ?? i.device.type} · ${i.device.serialNumber}`
                      : `Kit de ${i.kitSpec?.cameras ?? 0} cámaras`
                  }
                />
              ),
            },
            {
              key: 'status',
              header: 'Instalación',
              render: (i) => INSTALLATION_STATUS_LABELS[i.status] ?? i.status,
            },
            {
              key: 'signal',
              header: 'Señal',
              render: (i) =>
                i.device ? (
                  <Badge
                    tone={
                      i.device.status === 'ONLINE'
                        ? 'success'
                        : i.device.status === 'OFFLINE'
                          ? 'critical'
                          : 'neutral'
                    }
                    dot
                  >
                    {DEVICE_STATUS_LABELS[i.device.status] ?? i.device.status}
                  </Badge>
                ) : (
                  '—'
                ),
            },
            {
              key: 'conn',
              header: 'Conectividad',
              render: (i) =>
                CONNECTIVITY_LABELS[i.device?.connectivity ?? i.kitSpec?.connectivity ?? ''] ?? '—',
            },
            {
              key: 'seen',
              header: 'Última señal',
              render: (i) => formatRelative(i.device?.lastSeenAt),
            },
          ]}
        />
      ) : usesCameras ? (
        <p className={styles.muted}>Todavía no hay dispositivos asociados a este activo.</p>
      ) : null}
      {simulatedGateway ? (
        <div className={styles.inline}>
          <SimulatedBadge />
          <span className={styles.small}>
            Las cámaras se leen a través del gateway simulado de desarrollo (no hay integración con
            hardware real).
          </span>
        </div>
      ) : null}

      {notice ? <Callout tone={notice.tone}>{notice.text}</Callout> : null}

      {can('devices:write') ? (
        <div className={styles.stackTight}>
          <div className={`${styles.optionGrid} ${styles.optionWide}`}>
            <button
              type="button"
              className={`${styles.option} ${mode === 'kit' ? styles.optionSelected : ''}`}
              onClick={() => setMode('kit')}
              aria-pressed={mode === 'kit'}
            >
              <span className={styles.optionTitle}>
                <Icon name="camera" size={18} />
                Quiero que me envíen el kit
              </span>
              <span className={styles.optionText}>
                Cámaras solares con conectividad 4G y, opcionalmente, lector RFID. Coordinamos la
                instalación.
              </span>
            </button>
            <button
              type="button"
              className={`${styles.option} ${mode === 'installed' ? styles.optionSelected : ''}`}
              onClick={() => setMode('installed')}
              aria-pressed={mode === 'installed'}
            >
              <span className={styles.optionTitle}>
                <Icon name="check" size={18} />
                Ya instalé mis dispositivos
              </span>
              <span className={styles.optionText}>
                Registrá el número de serie y verificamos la conexión del equipo.
              </span>
            </button>
          </div>
          {mode === 'kit' ? (
            <KitRequestForm
              assetId={assetId}
              onDone={() => {
                setMode(null);
                setNotice({
                  tone: 'success',
                  text: 'Solicitud de kit registrada. El estado de envío se actualiza en esta sección.',
                });
              }}
            />
          ) : null}
          {mode === 'installed' ? (
            <RegisterDeviceForm
              assetId={assetId}
              defaultLocation={defaultLocation}
              onDone={(online) => {
                setMode(null);
                setNotice(
                  online
                    ? { tone: 'success', text: 'Dispositivo registrado y en línea.' }
                    : {
                        tone: 'warning',
                        text: 'Dispositivo registrado, pero todavía no reporta señal. Mientras tanto podés cargar imágenes manualmente en la pestaña Evidencia.',
                      },
                );
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
