'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Callout, ErrorState, Loading } from '@/components/ui/Feedback';
import { Field, FormRow, Input, Select } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { CellTitle, DataTable } from '@/components/ui/Table';
import { api, ApiError } from '@/lib/api/client';
import { keys, useApiMutation, useDocuments } from '@/lib/api/queries';
import type { DocumentItem } from '@/lib/api/types';
import { openSignedUrl } from '@/lib/download';
import { formatBytes, formatDate } from '@/lib/format';
import { DOCUMENT_STATUS_LABELS, DOCUMENT_TYPE_LABELS } from '@/lib/labels';
import { useCan } from '@/lib/permissions';
import { DocumentAnalysisNote } from './DocumentAnalysisNote';
import { DocumentStatusBadge } from './StatusBadges';
import styles from './domain.module.css';

/** Documentos que pertenecen al establecimiento (se comparten entre sus activos). */
const ESTABLISHMENT_LEVEL = new Set(['RENSPA', 'PROPERTY_DEED', 'LEASE_CONTRACT', 'ID_CUIT']);
const ACCEPT = 'application/pdf,image/jpeg,image/png';

const requirementLabel = (requirement: string) =>
  requirement
    .split('|')
    .map((type) => DOCUMENT_TYPE_LABELS[type] ?? type)
    .join(' o ');

const openDownload = (id: string) =>
  openSignedUrl(() => api<{ url: string }>(`/documents/${id}/download`));

export function DocumentsPanel({
  assetId,
  establishmentId,
  compact,
}: {
  assetId: string;
  establishmentId: string;
  compact?: boolean;
}) {
  const can = useCan();
  const query = useDocuments(assetId);
  const [type, setType] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = useApiMutation(
    (form: FormData) => {
      const target = ESTABLISHMENT_LEVEL.has(String(form.get('type')))
        ? `/establishments/${establishmentId}/documents`
        : `/assets/${assetId}/documents`;
      return api<DocumentItem>(target, { method: 'POST', form });
    },
    [keys.documents(assetId), keys.asset(assetId)],
  );
  const review = useApiMutation(
    ({ id, status }: { id: string; status: 'VALID' | 'REJECTED' }) =>
      api(`/documents/${id}/review`, { method: 'PATCH', body: { status } }),
    [keys.documents(assetId)],
  );

  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} />;
  const { documents, requirements } = query.data;
  const missing = requirements.filter((r) => !r.satisfied);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const file = fileRef.current?.files?.[0];
    if (!type) return setError('Seleccioná el tipo de documento.');
    if (!file) return setError('Seleccioná un archivo PDF, JPG o PNG.');
    const form = new FormData();
    form.set('type', type);
    if (title.trim()) form.set('title', title.trim());
    if (issuedAt) form.set('issuedAt', issuedAt);
    if (expiresAt) form.set('expiresAt', expiresAt);
    form.set('file', file);
    try {
      const created = await upload.mutateAsync(form);
      setNotice(
        `"${created.title}" cargado. Queda pendiente de revisión; la lectura automática se muestra en la tabla.`,
      );
      setType('');
      setTitle('');
      setIssuedAt('');
      setExpiresAt('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No fue posible cargar el documento.');
    }
  };

  return (
    <div className={styles.stack}>
      <div>
        <div className={styles.sectionTitle}>Documentación requerida</div>
        <ul className={styles.requirements} data-testid="document-requirements">
          {requirements.map((r) => (
            <li key={r.requirement} className={styles.requirement}>
              <span
                className={`${styles.requirementName} ${r.satisfied ? styles.requirementOk : styles.requirementMissing}`}
              >
                <Icon name={r.satisfied ? 'check' : 'x'} size={16} />
                <span style={{ color: 'var(--text-primary)' }}>
                  {requirementLabel(r.requirement)}
                </span>
              </span>
              <span className={styles.muted}>
                {r.satisfied ? (DOCUMENT_STATUS_LABELS[r.status ?? ''] ?? 'Cargado') : 'Faltante'}
              </span>
            </li>
          ))}
        </ul>
        {missing.length > 0 ? (
          <p className={styles.muted} style={{ marginTop: 8 }}>
            Faltan {missing.length} documento(s). La documentación incompleta reduce el componente
            “Documentación” del score.
          </p>
        ) : null}
      </div>

      {documents.length > 0 ? (
        <DataTable<DocumentItem>
          caption="Documentos cargados"
          rows={documents}
          rowKey={(d) => d.id}
          columns={[
            {
              key: 'title',
              header: 'Documento',
              render: (d) => (
                <CellTitle
                  title={d.title}
                  subtitle={`${DOCUMENT_TYPE_LABELS[d.type] ?? d.type} · ${d.scope === 'ESTABLISHMENT' ? 'Establecimiento' : 'Activo'}`}
                />
              ),
            },
            {
              key: 'status',
              header: 'Estado',
              render: (d) => (
                <>
                  <DocumentStatusBadge status={d.status} />
                  <DocumentAnalysisNote analysis={d.analysis} />
                </>
              ),
            },
            ...(compact
              ? []
              : [
                  {
                    key: 'issued',
                    header: 'Emisión',
                    render: (d: DocumentItem) => formatDate(d.issuedAt),
                  },
                  {
                    key: 'expires',
                    header: 'Vencimiento',
                    render: (d: DocumentItem) => formatDate(d.expiresAt),
                  },
                  {
                    key: 'size',
                    header: 'Tamaño',
                    numeric: true,
                    render: (d: DocumentItem) => formatBytes(d.sizeBytes),
                  },
                ]),
            {
              key: 'actions',
              header: <span className="visually-hidden">Acciones</span>,
              render: (d) => (
                <span className={styles.inline} style={{ justifyContent: 'flex-end' }}>
                  {can('documents:review') && d.status === 'PENDING_REVIEW' ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="check"
                        onClick={() => review.mutate({ id: d.id, status: 'VALID' })}
                      >
                        Validar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="x"
                        onClick={() => review.mutate({ id: d.id, status: 'REJECTED' })}
                      >
                        Rechazar
                      </Button>
                    </>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="download"
                    onClick={() => void openDownload(d.id)}
                    aria-label={`Descargar ${d.title}`}
                  />
                </span>
              ),
            },
          ]}
        />
      ) : null}

      {can('documents:write') ? (
        <form onSubmit={submit} className={styles.stackTight} aria-label="Cargar documento">
          <div className={styles.sectionTitle}>Cargar documento</div>
          <FormRow columns={2}>
            <Field label="Tipo de documento" required>
              {(props) => (
                <Select
                  {...props}
                  name="type"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  <option value="">Seleccionar…</option>
                  {Object.entries(DOCUMENT_TYPE_LABELS).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Archivo" hint="PDF, JPG o PNG · máx. 15 MB" required>
              {(props) => (
                <Input
                  {...props}
                  ref={fileRef}
                  type="file"
                  name="file"
                  accept={ACCEPT}
                  onChange={() => setError(null)}
                />
              )}
            </Field>
          </FormRow>
          <FormRow columns={3}>
            <Field label="Título (opcional)">
              {(props) => (
                <Input
                  {...props}
                  value={title}
                  maxLength={160}
                  onChange={(e) => setTitle(e.target.value)}
                />
              )}
            </Field>
            <Field label="Fecha de emisión">
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  value={issuedAt}
                  onChange={(e) => setIssuedAt(e.target.value)}
                />
              )}
            </Field>
            <Field label="Vencimiento">
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              )}
            </Field>
          </FormRow>
          {type && ESTABLISHMENT_LEVEL.has(type) ? (
            <p className={styles.small}>
              Este documento se asocia al establecimiento y aplica a todos sus activos.
            </p>
          ) : null}
          {error ? <Callout tone="critical">{error}</Callout> : null}
          {notice ? <Callout tone="success">{notice}</Callout> : null}
          <div>
            <Button type="submit" variant="primary" icon="upload" loading={upload.isPending}>
              Cargar documento
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
