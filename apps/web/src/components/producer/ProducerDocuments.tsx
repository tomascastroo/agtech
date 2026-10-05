'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { DocumentAnalysisNote } from '@/components/domain/DocumentAnalysisNote';
import { DocumentViewer, type ViewableDocument } from '@/components/domain/DocumentViewer';
import { DocumentStatusBadge } from '@/components/domain/StatusBadges';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Feedback';
import { Field, FormRow, Input, Select } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { api, ApiError } from '@/lib/api/client';
import type { DocumentItem, GuaranteeRequest, RequirementItem } from '@/lib/api/types';
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
  const firstMissing =
    request.documentation?.items.find((r) => r.status === 'PENDING')?.documentTypes[0]?.code ??
    request.requiredDocuments.find((r) => !r.satisfied)?.alternatives[0];
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [type, setType] = useState(suggestedType ?? firstMissing ?? 'OTHER');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Al abrir el formulario desde un requisito, llevarlo a la vista (en el celular queda abajo).
  useEffect(() => {
    if (open) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [open, type]);

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
      {request.documentation ? (
        <div className={styles.list} data-testid="producer-requirements">
          <p className={styles.sectionTitle}>Documentación requerida</p>
          {request.documentation.items
            .filter((r) => r.status !== 'NOT_APPLICABLE')
            // Primero lo obligatorio y lo que la entidad ya pidió.
            .sort((a, b) => priority(a) - priority(b))
            .map((r) => (
              <RequirementCard
                key={r.code}
                item={r}
                requester={request.requester.name}
                onUpload={() => start(r.documentTypes[0]?.code)}
              />
            ))}
        </div>
      ) : request.requiredDocuments.length > 0 ? (
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
            <div key={d.id}>
              <div className={styles.docRow}>
                <span className={`${styles.docMark} ${styles.docOk}`}>
                  <Icon name="document" size={14} />
                </span>
                <span className={styles.docInfo}>
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
                <Button
                  size="sm"
                  variant="ghost"
                  aria-expanded={viewing === d.id}
                  onClick={() => setViewing(viewing === d.id ? null : d.id)}
                >
                  {viewing === d.id ? 'Ocultar' : 'Ver'}
                </Button>
              </div>
              {viewing === d.id ? (
                <DocumentViewer
                  queryKey={['producer', d.id]}
                  title={d.title}
                  resolve={() => api<ViewableDocument>(`${endpoint}/${d.id}/view`)}
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {open ? (
        <form
          ref={formRef}
          onSubmit={submit}
          className={styles.card}
          aria-label="Agregar documento"
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

const PRODUCER_STATUS: Record<
  RequirementItem['status'],
  {
    text: string;
    tone: 'ok' | 'warn' | 'error' | 'neutral';
    icon: 'check' | 'warning' | 'critical' | 'clock' | 'info';
  }
> = {
  PENDING: { text: 'Pendiente', tone: 'warn', icon: 'warning' },
  UPLOADED: { text: 'Documento cargado · en revisión', tone: 'ok', icon: 'check' },
  PROCESSING: { text: 'Documento cargado · leyendo…', tone: 'ok', icon: 'clock' },
  CONSISTENT: { text: 'Datos consistentes', tone: 'ok', icon: 'check' },
  INCONSISTENT: { text: 'No coincide con lo declarado', tone: 'error', icon: 'critical' },
  REVIEW_REQUIRED: { text: 'La entidad lo revisa', tone: 'warn', icon: 'warning' },
  NOT_APPLICABLE: { text: 'No aplica', tone: 'ok', icon: 'check' },
};

/** Un requisito para el productor: qué falta, por qué, quién lo pide y cómo cargarlo. */
function RequirementCard({
  item,
  requester,
  onUpload,
}: {
  item: RequirementItem;
  requester: string;
  onUpload: () => void;
}) {
  // Un requisito condicional o según evaluación que nadie pidió no es una tarea pendiente.
  const optional = item.status === 'PENDING' && item.obligation !== 'MANDATORY' && !item.requested;
  const state = optional
    ? { text: `Solo si ${requester} lo pide`, tone: 'neutral' as const, icon: 'info' as const }
    : PRODUCER_STATUS[item.status];
  const toneClass =
    state.tone === 'ok'
      ? styles.reqOk
      : state.tone === 'error'
        ? styles.reqError
        : state.tone === 'neutral'
          ? styles.muted
          : styles.reqWarn;
  const cardClass =
    item.status === 'CONSISTENT'
      ? styles.reqCardOk
      : item.status === 'INCONSISTENT'
        ? styles.reqCardError
        : (item.status === 'PENDING' && !optional) || item.status === 'REVIEW_REQUIRED'
          ? styles.reqCardAttention
          : '';
  const needsUpload = (item.status === 'PENDING' && !optional) || item.status === 'INCONSISTENT';
  return (
    <div
      className={`${styles.reqCard} ${cardClass}`}
      data-testid={`producer-requirement-${item.code}`}
    >
      <div className={styles.reqHead}>
        <span className={styles.reqName}>{item.name}</span>
        <span className={styles.chip}>{item.obligationLabel}</span>
      </div>
      {item.document ? (
        <span className={`${styles.reqLine} ${styles.reqOk}`}>
          <Icon name="check" size={16} /> Documento cargado
        </span>
      ) : null}
      <span className={`${styles.reqLine} ${toneClass}`} data-status={item.status}>
        <Icon name={state.icon} size={16} /> {state.text}
        {item.status === 'INCONSISTENT' ? ` · ${item.reason}` : ''}
      </span>
      <p className={styles.muted}>
        <strong>Por qué:</strong> {item.purpose}
      </p>
      <p className={styles.muted}>
        <strong>Lo solicita:</strong> {requester}
        {item.requested
          ? ` · pedido el ${new Date(item.requested.at).toLocaleDateString('es-AR')}`
          : item.condition
            ? ` · ${item.condition}`
            : ''}
      </p>
      {needsUpload ? (
        <>
          <p className={styles.muted}>
            <strong>Cómo:</strong> {item.howTo}
          </p>
          <button
            type="button"
            className={`${styles.bigButton} ${styles.bigButtonSecondary}`}
            onClick={onUpload}
          >
            <Icon name="upload" size={20} /> Subí una foto o PDF
          </button>
        </>
      ) : null}
    </div>
  );
}

const priority = (r: RequirementItem) =>
  r.requested || r.status === 'INCONSISTENT' ? 0 : r.obligation === 'MANDATORY' ? 1 : 2;
