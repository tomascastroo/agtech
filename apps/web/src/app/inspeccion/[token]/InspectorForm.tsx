'use client';

import { useParams } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import styles from '@/components/producer/producer.module.css';
import { Callout, ErrorState, Loading } from '@/components/ui/Feedback';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { api, ApiError } from '@/lib/api/client';
import { PRODUCTION_LABELS, type InspectorView } from '@/lib/api/collateral';
import { formatDate } from '@/lib/format';

type Position = { latitude: number; longitude: number; accuracyM: number };

/**
 * Inspección por link (sin cuenta). El inspector cuenta a ciegas (no ve lo declarado), toma fotos
 * con GPS desde la cámara y firma el acta. Después el link deja de servir.
 */
export function InspectorForm() {
  const { token } = useParams<{ token: string }>();
  const query = useQuery({
    queryKey: ['inspection-link', token],
    queryFn: () => api<InspectorView>(`/inspections/${token}`, { redirectOnUnauthorized: false }),
    retry: false,
  });
  const [position, setPosition] = useState<Position | null>(null);
  const [gps, setGps] = useState<'idle' | 'asking' | 'ok' | 'denied'>('idle');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const camera = useRef<HTMLInputElement>(null);

  const askGps = () =>
    new Promise<Position | null>((resolve) => {
      if (!('geolocation' in navigator)) {
        setGps('denied');
        return resolve(null);
      }
      setGps('asking');
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const pos = {
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
            accuracyM: p.coords.accuracy,
          };
          setPosition(pos);
          setGps('ok');
          resolve(pos);
        },
        () => {
          setGps('denied');
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 15_000 },
      );
    });

  if (query.isPending) return <Loading />;
  if (query.isError)
    return (
      <main className={styles.main}>
        <ErrorState error={query.error} />
      </main>
    );
  const v = query.data;

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setError(null);
    setUploading(true);
    const pos = position ?? (await askGps());
    try {
      for (const file of files) {
        const form = new FormData();
        form.set('file', file);
        form.set('captureOrigin', 'CAMERA');
        form.set(
          'capturedAt',
          new Date(Math.min(file.lastModified || Date.now(), Date.now())).toISOString(),
        );
        if (pos) {
          form.set('latitude', String(pos.latitude));
          form.set('longitude', String(pos.longitude));
          form.set('accuracyM', String(Math.round(pos.accuracyM)));
          form.set('locationSource', 'DEVICE_GPS');
        }
        const r = await api<{ evidenceId: string }>(`/inspections/${token}/evidence`, {
          method: 'POST',
          form,
          redirectOnUnauthorized: false,
        });
        setPhotos((p) => [...p, r.evidenceId]);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo subir la foto');
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const pos = position ?? (await askGps());
    setBusy(true);
    try {
      const name = String(f.get('inspectorName') ?? '').trim();
      await api(`/inspections/${token}/record`, {
        method: 'POST',
        redirectOnUnauthorized: false,
        body: {
          inspectorName: name,
          performedAt: new Date().toISOString(),
          ...(pos ? { latitude: pos.latitude, longitude: pos.longitude } : {}),
          observedHeads: Number(f.get('observedHeads')),
          fullCount: f.get('fullCount') === 'on',
          rfidRead: f.get('rfidRead') ? Number(f.get('rfidRead')) : undefined,
          observations: String(f.get('observations') ?? '').trim() || undefined,
          discrepancies: String(f.get('discrepancy') ?? '').trim()
            ? [{ topic: 'Observación', description: String(f.get('discrepancy')).trim() }]
            : [],
          result: String(f.get('result')),
          signatureName: String(f.get('signatureName') ?? '').trim(),
          signatureAccepted: f.get('signatureAccepted') === 'on',
        },
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo registrar el acta');
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <main className={styles.main} data-testid="inspection-done">
        <section className={styles.card}>
          <p className={styles.cardTitle}>
            <Icon name="check" size="md" /> Acta firmada y enviada
          </p>
          <p className={styles.muted}>
            La entidad ya ve el resultado. Este link dejó de servir: el acta no se puede modificar.
          </p>
        </section>
      </main>
    );

  return (
    <main className={styles.main} data-testid="inspector-form">
      {v.guarantee.demo ? (
        <Callout tone="warning" title="Datos de demostración">
          Esta inspección es de una garantía ficticia.
        </Callout>
      ) : null}
      <section className={styles.card}>
        <p className={styles.cardTitle}>Inspección presencial · {v.guarantee.code}</p>
        <p className={styles.muted}>
          Pedida por {v.requester ?? 'la entidad'}
          {v.dueAt ? ` · antes del ${formatDate(v.dueAt)}` : ''}. Link válido hasta el{' '}
          {formatDate(v.expiresAt)}.
        </p>
        <p>
          <strong>{v.establishment?.name ?? 'Establecimiento'}</strong>
          {v.establishment?.locality ? ` · ${v.establishment.locality}` : ''}
          {v.establishment?.province ? `, ${v.establishment.province}` : ''}
          <br />
          Productor: {v.producer} · {v.assetName ?? 'Rodeo'} ·{' '}
          {PRODUCTION_LABELS[v.guarantee.productionType] ?? v.guarantee.productionType}
        </p>
        {v.establishment?.location ? (
          <a
            href={`https://www.google.com/maps?q=${v.establishment.location.latitude},${v.establishment.location.longitude}`}
            target="_blank"
            rel="noreferrer"
          >
            Cómo llegar
          </a>
        ) : null}
        {v.reason ? <p className={styles.muted}>Motivo: {v.reason}</p> : null}
        <Callout tone="info">
          Contá los animales sin conocer lo declarado: tu conteo tiene que ser independiente.
        </Callout>
      </section>

      <section className={styles.card}>
        <p className={styles.cardTitle}>Fotos de la inspección</p>
        <p className={styles.muted}>
          Sacalas con la cámara en el lugar: quedan con ubicación GPS y hora.
        </p>
        <input
          ref={camera}
          className={styles.hiddenInput}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={(e) => {
            // Se copia la lista antes de limpiar el input (la subida espera el GPS).
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            void upload(files);
          }}
        />
        <button
          type="button"
          className={styles.bigButton}
          disabled={uploading}
          onClick={() => camera.current?.click()}
        >
          <Icon name="camera" size="lg" /> {uploading ? 'Subiendo…' : 'Tomar foto'}
        </button>
        <p className={styles.muted} data-testid="inspection-photos">
          {photos.length + v.photos} foto(s) cargada(s) ·{' '}
          {gps === 'ok'
            ? `GPS ±${Math.round(position!.accuracyM)} m`
            : gps === 'denied'
              ? 'Sin GPS: activá la ubicación del teléfono'
              : 'Se pide la ubicación al tomar la primera foto'}
        </p>
      </section>

      <form className={`${styles.card} ${styles.list}`} onSubmit={submit}>
        <p className={styles.cardTitle}>Acta</p>
        <Field label="Tu nombre" required>
          {(p) => <Input {...p} name="inspectorName" required autoComplete="name" />}
        </Field>
        <Field label="Animales contados" required>
          {(p) => (
            <Input {...p} name="observedHeads" type="number" min={0} inputMode="numeric" required />
          )}
        </Field>
        <Checkbox name="fullCount" label="Conté todo el rodeo (no una parte)" defaultChecked />
        <Field label="Caravanas RFID leídas">
          {(p) => <Input {...p} name="rfidRead" type="number" min={0} inputMode="numeric" />}
        </Field>
        <Field label="Resultado" required>
          {(p) => (
            <Select {...p} name="result" defaultValue="CONFORME">
              <option value="CONFORME">Conforme</option>
              <option value="CON_OBSERVACIONES">Con observaciones</option>
              <option value="NO_CONFORME">No conforme</option>
              <option value="NO_DETERMINABLE">No se pudo determinar</option>
            </Select>
          )}
        </Field>
        <Field label="Observaciones">
          {(p) => <Textarea {...p} name="observations" rows={3} />}
        </Field>
        <Field label="Diferencias encontradas">
          {(p) => <Textarea {...p} name="discrepancy" rows={2} />}
        </Field>
        <Field label="Firma (tu nombre completo)" required>
          {(p) => <Input {...p} name="signatureName" required />}
        </Field>
        <Checkbox
          name="signatureAccepted"
          label="Firmo el acta: lo registrado es lo que observé"
          required
        />
        {error ? <Callout tone="critical">{error}</Callout> : null}
        <button type="submit" className={styles.bigButton} disabled={busy || uploading}>
          {busy ? 'Enviando…' : 'Firmar y enviar acta'}
        </button>
      </form>
    </main>
  );
}
