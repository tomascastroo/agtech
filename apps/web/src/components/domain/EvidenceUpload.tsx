'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Feedback';
import { Field, FormRow, Input } from '@/components/ui/Field';
import { api, ApiError } from '@/lib/api/client';
import { keys, useApiMutation } from '@/lib/api/queries';
import type { EvidenceItem, GeoPoint } from '@/lib/api/types';
import styles from './domain.module.css';

/** Carga manual de imágenes de campo (se registran con hash, fecha y ubicación). */
export function EvidenceUpload({
  assetId,
  defaultLocation,
  endpoint,
  onUploaded,
}: {
  assetId: string;
  defaultLocation: GeoPoint | null;
  /** Destino alternativo (p. ej. el link del productor); por defecto, la API del activo. */
  endpoint?: string;
  onUploaded?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [capturedAt, setCapturedAt] = useState('');
  const [latitude, setLatitude] = useState(
    defaultLocation ? String(defaultLocation.coordinates[1]) : '',
  );
  const [longitude, setLongitude] = useState(
    defaultLocation ? String(defaultLocation.coordinates[0]) : '',
  );
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mutation = useApiMutation(
    (form: FormData) =>
      api<EvidenceItem>(endpoint ?? `/assets/${assetId}/evidence`, { method: 'POST', form }),
    [keys.evidence(assetId)],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const files = Array.from(fileRef.current?.files ?? []);
    if (files.length === 0) return setError('Seleccioná al menos una imagen JPG, PNG o WEBP.');
    try {
      for (const file of files) {
        const form = new FormData();
        if (capturedAt) form.set('capturedAt', new Date(capturedAt).toISOString());
        if (latitude && longitude) {
          form.set('latitude', latitude);
          form.set('longitude', longitude);
        }
        if (description.trim()) form.set('description', description.trim());
        form.set('file', file);
        await mutation.mutateAsync(form);
      }
      onUploaded?.();
      setNotice(
        files.length === 1
          ? 'Imagen incorporada como evidencia.'
          : `${files.length} imágenes incorporadas como evidencia.`,
      );
      if (fileRef.current) fileRef.current.value = '';
      setDescription('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No fue posible cargar la imagen.');
    }
  };

  return (
    <form onSubmit={submit} className={styles.stackTight} aria-label="Cargar evidencia">
      <FormRow columns={2}>
        <Field label="Imágenes" hint="JPG, PNG o WEBP · máx. 20 MB c/u" required>
          {(props) => (
            <Input
              {...props}
              ref={fileRef}
              type="file"
              name="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
            />
          )}
        </Field>
        <Field label="Fecha y hora de captura" hint="Si no se indica, se usa la hora de carga">
          {(props) => (
            <Input
              {...props}
              type="datetime-local"
              value={capturedAt}
              onChange={(e) => setCapturedAt(e.target.value)}
            />
          )}
        </Field>
      </FormRow>
      <FormRow columns={3}>
        <Field label="Latitud">
          {(props) => (
            <Input
              {...props}
              inputMode="decimal"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
            />
          )}
        </Field>
        <Field label="Longitud">
          {(props) => (
            <Input
              {...props}
              inputMode="decimal"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
            />
          )}
        </Field>
        <Field label="Descripción">
          {(props) => (
            <Input
              {...props}
              maxLength={255}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Potrero 4, recorrida"
            />
          )}
        </Field>
      </FormRow>
      {error ? <Callout tone="critical">{error}</Callout> : null}
      {notice ? <Callout tone="success">{notice}</Callout> : null}
      <div>
        <Button type="submit" icon="upload" loading={mutation.isPending}>
          Cargar evidencia
        </Button>
      </div>
    </form>
  );
}
