'use client';

import { useEffect, useRef, useState } from 'react';
import { Callout } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { api, ApiError } from '@/lib/api/client';
import styles from './producer.module.css';

const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface QueuedPhoto {
  id: string;
  file: File;
  preview: string;
  state: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

interface DevicePosition {
  latitude: number;
  longitude: number;
  accuracyM: number;
  at: number;
}

/** Posiciones más viejas que esto se vuelven a pedir antes de enviar. */
const MAX_POSITION_AGE_MS = 2 * 60_000;

/**
 * Captura de evidencia fotográfica estilo app: cámara del teléfono como acción principal,
 * galería como alternativa, varias fotos sin límite, miniaturas, quitar antes de enviar, fecha
 * de captura del archivo y ubicación GPS del dispositivo con su precisión (pedida con permiso).
 * Si no hay GPS, las fotos se envían sin ubicación de captura: nunca se usa la del
 * establecimiento en su lugar (el servidor puede tomar el GPS EXIF de la imagen si existe).
 */
export function PhotoCapture({
  endpoint,
  guidance,
  onUploaded,
}: {
  endpoint: string;
  guidance?: string | null;
  onUploaded: () => unknown;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueuedPhoto[]>([]);
  const [description, setDescription] = useState('');
  const [position, setPosition] = useState<DevicePosition | null>(null);
  const [locationState, setLocationState] = useState<
    'idle' | 'asking' | 'ok' | 'denied' | 'unavailable'
  >('idle');
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      for (const p of queue) URL.revokeObjectURL(p.preview);
    },
    // Solo al desmontar: libera las vistas previas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** Pide la ubicación al dispositivo (el navegador muestra el permiso la primera vez). */
  const requestPosition = () =>
    new Promise<DevicePosition | null>((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        setLocationState('unavailable');
        return resolve(null);
      }
      setLocationState('asking');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracyM: pos.coords.accuracy,
            at: Date.now(),
          };
          setPosition(next);
          setLocationState('ok');
          resolve(next);
        },
        (err) => {
          setLocationState(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
      );
    });

  const askLocation = () => {
    if (locationState === 'idle') void requestPosition();
  };

  const add = (files: FileList | null) => {
    setError(null);
    setNotice(null);
    const list = Array.from(files ?? []);
    const rejected = list.filter((f) => !ACCEPTED.has(f.type));
    if (rejected.length > 0) setError('Solo se aceptan fotos JPG, PNG o WEBP.');
    const accepted = list.filter((f) => ACCEPTED.has(f.type));
    if (accepted.length === 0) return;
    askLocation();
    setQueue((q) => [
      ...q,
      ...accepted.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        file,
        preview: URL.createObjectURL(file),
        state: 'pending' as const,
      })),
    ]);
  };

  const remove = (id: string) =>
    setQueue((q) => {
      const item = q.find((p) => p.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return q.filter((p) => p.id !== id);
    });

  const upload = async () => {
    setError(null);
    setNotice(null);
    setUploading(true);
    // Ubicación vigente del dispositivo (se renueva si quedó vieja); si no hay, sin ubicación.
    const location =
      position && Date.now() - position.at < MAX_POSITION_AGE_MS
        ? position
        : locationState === 'denied'
          ? null
          : await requestPosition();
    let ok = 0;
    for (const item of queue.filter((p) => p.state !== 'done')) {
      setQueue((q) => q.map((p) => (p.id === item.id ? { ...p, state: 'uploading' } : p)));
      try {
        const form = new FormData();
        form.set('file', item.file);
        // Fecha del archivo (la cámara la fija al momento de la toma); nunca en el futuro.
        form.set(
          'capturedAt',
          new Date(Math.min(item.file.lastModified || Date.now(), Date.now())).toISOString(),
        );
        if (location) {
          form.set('latitude', String(location.latitude));
          form.set('longitude', String(location.longitude));
          form.set('accuracyM', String(Math.round(location.accuracyM * 10) / 10));
          form.set('locationSource', 'DEVICE_GPS');
        }
        if (description.trim()) form.set('description', description.trim());
        await api(endpoint, { method: 'POST', form });
        ok++;
        setQueue((q) => q.map((p) => (p.id === item.id ? { ...p, state: 'done' } : p)));
      } catch (e) {
        const message = e instanceof ApiError ? e.message : 'No se pudo subir';
        setQueue((q) =>
          q.map((p) => (p.id === item.id ? { ...p, state: 'error', error: message } : p)),
        );
      }
    }
    setUploading(false);
    if (ok > 0) {
      setNotice(
        ok === 1 ? '1 foto agregada como evidencia.' : `${ok} fotos agregadas como evidencia.`,
      );
      setQueue((q) => {
        for (const p of q) if (p.state === 'done') URL.revokeObjectURL(p.preview);
        return q.filter((p) => p.state !== 'done');
      });
      setDescription('');
      await onUploaded();
    }
  };

  const pending = queue.filter((p) => p.state !== 'done').length;
  return (
    <div className={styles.list}>
      {guidance ? (
        <p className={styles.muted}>
          <Icon name="info" size={14} /> {guidance}
        </p>
      ) : null}
      <input
        ref={cameraRef}
        className={styles.hiddenInput}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={galleryRef}
        className={styles.hiddenInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(e) => {
          add(e.target.files);
          e.target.value = '';
        }}
      />
      <div className={styles.buttonRow}>
        <button
          type="button"
          className={styles.bigButton}
          onClick={() => cameraRef.current?.click()}
        >
          <Icon name="camera" size={20} /> Tomar foto
        </button>
        <button
          type="button"
          className={`${styles.bigButton} ${styles.bigButtonSecondary}`}
          onClick={() => galleryRef.current?.click()}
        >
          <Icon name="upload" size={20} /> Elegir de galería
        </button>
      </div>

      {queue.length > 0 ? (
        <>
          <div className={styles.thumbs} aria-label="Fotos para enviar">
            {queue.map((p) => (
              <div key={p.id} className={styles.thumb}>
                {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
                <img src={p.preview} alt={p.file.name} />
                {p.state === 'pending' || p.state === 'error' ? (
                  <button
                    type="button"
                    className={styles.thumbRemove}
                    onClick={() => remove(p.id)}
                    aria-label={`Quitar ${p.file.name}`}
                    disabled={uploading}
                  >
                    <Icon name="x" size={14} />
                  </button>
                ) : null}
                {p.state !== 'pending' ? (
                  <span className={styles.thumbState}>
                    {p.state === 'uploading'
                      ? 'Subiendo…'
                      : p.state === 'done'
                        ? 'Lista'
                        : (p.error ?? 'Error')}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          <span className={styles.chip}>
            <Icon name="pin" size={12} />
            {locationState === 'ok' && position
              ? `Ubicación del teléfono · ±${Math.round(position.accuracyM)} m`
              : locationState === 'asking'
                ? 'Obteniendo ubicación del teléfono…'
                : 'Sin ubicación del teléfono'}
          </span>
          {locationState === 'idle' ? (
            <button
              type="button"
              className={`${styles.bigButton} ${styles.bigButtonSecondary}`}
              onClick={() => void requestPosition()}
            >
              <Icon name="pin" size={20} /> Permitir ubicación
            </button>
          ) : null}
          {locationState === 'denied' || locationState === 'unavailable' ? (
            <Callout tone="warning">
              {locationState === 'denied'
                ? 'No diste permiso de ubicación.'
                : 'No se pudo obtener la ubicación del teléfono.'}{' '}
              Podés continuar: las fotos se guardan sin ubicación de captura (si la imagen trae GPS
              propio, se usa ese). La ubicación del establecimiento no se toma como lugar de la
              foto.
            </Callout>
          ) : null}
          <Field label="Descripción (opcional)" hint="Se agrega a todas las fotos de este envío">
            {(props) => (
              <Input
                {...props}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ej.: potrero norte, aguada"
                maxLength={255}
              />
            )}
          </Field>
          <button
            type="button"
            className={styles.bigButton}
            onClick={upload}
            disabled={uploading || pending === 0}
          >
            <Icon name="check" size={20} />
            {uploading ? 'Enviando…' : `Enviar ${pending} foto${pending === 1 ? '' : 's'}`}
          </button>
        </>
      ) : null}
      {error ? <Callout tone="critical">{error}</Callout> : null}
      {notice ? <Callout tone="success">{notice}</Callout> : null}
    </div>
  );
}
