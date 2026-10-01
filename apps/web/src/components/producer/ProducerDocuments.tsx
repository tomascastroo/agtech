'use client';

import { useRef, useState, type FormEvent } from 'react';
import { DocumentAnalysisNote } from '@/components/domain/DocumentAnalysisNote';
import { DocumentStatusBadge } from '@/components/domain/StatusBadges';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Feedback';
import { Field, FormRow, Input, Select } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { api, ApiError } from '@/lib/api/client';
import type { DocumentItem, GuaranteeRequest } from '@/lib/api/types';
import { DOCUMENT_TYPE_LABELS } from '@/lib/labels';
import styles from './producer.module.css';

const WITH_EXPIRY = new Set([
  'INSURANCE_POLICY',
  'SANITARY_CERTIFICATE',
  'LEASE_CONTRACT',
  'RENSPA',
]);
const label = (type: string) => DOCUMENT_TYPE_LABELS[type] ?? type;
const requirementLabel = (alternatives: string[]) => alternatives.map(label).join(' o ');
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-AR') : null);

/**
 * Documentación del productor: checklist de lo requerido por el tipo de activo y documentos
 * cargados (nombre, tipo, estado, fecha, vencimiento). Subir otra versión agrega un documento
 * nuevo: el anterior se conserva para la auditoría.
 */
export function ProducerDocuments({
  request,
  documents,
  endpoint,
  onUploaded,
  suggestedType,
}: {
  request: GuaranteeRequest;
  documents: DocumentItem[];
  endpoint: string;
  onUploaded: () => unknown;
  suggestedType?: string | null;
}) {
  const firstMissing = request.requiredDocuments.find((r) => !r.satisfied)?.alternatives[0];
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(suggestedType ?? firstMissing ?? 'OTHER');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const start = (preset?: string) => {
    setType(preset ?? suggestedType ?? firstMissing ?? 'OTHER');
    setExpiresAt('');
    setError(null);
    setNotice(null);
    setOpen(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setError('Elegí el archivo (PDF, JPG o PNG) o sacale una foto al documento.');
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('type', type);
      form.set('file', file);
      if (expiresAt) form.set('expiresAt', expiresAt);
      await api(endpoint, { method: 'POST', form });
      setNotice(`${label(type)} cargado.`);
      setOpen(false);
      await onUploaded();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No fue posible cargar el documento.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.list}>
      {request.requiredDocuments.length > 0 ? (
        <div>
          <p className={styles.sectionTitle}>Documentación requerida</p>
          {request.requiredDocuments.map((r) => (
            <div key={r.requirement} className={styles.docRow}>
              <span
                className={`${styles.docMark} ${r.satisfied ? styles.docOk : styles.docMissing}`}
              >
                <Icon name={r.satisfied ? 'check' : 'warning'} size={14} />
              </span>
              <span style={{ flex: 1 }}>{requirementLabel(r.alternatives)}</span>
              {!r.satisfied ? (
                <Button size="sm" variant="secondary" onClick={() => start(r.alternatives[0])}>
                  Subir
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {documents.length > 0 ? (
        <div>
          <p className={styles.sectionTitle}>Documentos cargados</p>
          {documents.map((d) => (
            <div key={d.id} className={styles.docRow}>
              <span className={`${styles.docMark} ${styles.docOk}`}>
                <Icon name="document" size={14} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: 'block' }}>{d.title}</strong>
                <span className={styles.muted}>
                  {label(d.type)} · {fmtDate(d.uploadedAt)}
                  {d.expiresAt ? ` · vence ${fmtDate(d.expiresAt)}` : ''}
                </span>
                <DocumentAnalysisNote analysis={d.analysis} />
              </span>
              <DocumentStatusBadge status={d.status} />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => start(d.type)}
                aria-label={`Subir nueva versión de ${d.title}`}
              >
                Nueva versión
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {open ? (
        <form onSubmit={submit} className={styles.card} aria-label="Agregar documento">
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
            {WITH_EXPIRY.has(type) ? (
              <Field label="Vencimiento (si tiene)">
                {(p) => (
                  <Input
                    {...p}
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                  />
                )}
              </Field>
            ) : null}
          </FormRow>
          <Field label="Archivo o foto del documento" hint="PDF, JPG o PNG · máx. 15 MB">
            {(p) => (
              <Input
                {...p}
                ref={fileRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png"
              />
            )}
          </Field>
          {error ? <Callout tone="critical">{error}</Callout> : null}
          <div className={styles.buttonRow}>
            <button type="submit" className={styles.bigButton} disabled={busy}>
              <Icon name="upload" size={20} /> {busy ? 'Subiendo…' : 'Subir documento'}
            </button>
            <button
              type="button"
              className={`${styles.bigButton} ${styles.bigButtonSecondary}`}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className={`${styles.bigButton} ${styles.bigButtonSecondary}`}
          onClick={() => start()}
        >
          <Icon name="plus" size={20} /> Agregar documento
        </button>
      )}
      {notice ? <Callout tone="success">{notice}</Callout> : null}
    </div>
  );
}
