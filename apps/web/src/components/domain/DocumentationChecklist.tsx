'use client';

import { useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Feedback';
import { Panel } from '@/components/ui/Panel';
import { Progress } from '@/components/ui/Progress';
import { api, ApiError } from '@/lib/api/client';
import { useApiMutation } from '@/lib/api/queries';
import type { DocumentItem, Documentation, OcrFieldEntry, RequirementItem } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import { DocumentViewer, type ViewableDocument } from './DocumentViewer';
import { DemoBadge, RequirementStatusBadge } from './StatusBadges';
import styles from './documentation.module.css';

export const OCR_FIELD_LABELS: Record<string, string> = {
  RENSPA: 'RENSPA',
  CUIT: 'CUIT',
  HOLDER: 'Titular',
  ESTABLISHMENT: 'Establecimiento',
  LOCALITY: 'Localidad',
  PROVINCE: 'Provincia',
  ISSUED_AT: 'Emisión',
  EXPIRES_AT: 'Vencimiento',
  HEAD_COUNT: 'Cabezas',
  VACCINE: 'Vacuna',
};

/**
 * Checklist documental de la solicitud (vista de la entidad). Cada requisito muestra su estado,
 * el motivo, el documento que lo respalda y lo que leyó el OCR; la entidad puede pedirlo al
 * productor, marcarlo como NO APLICA o volver a procesar el documento.
 */
export function DocumentationChecklist({
  requestId,
  assetId,
  documentation,
  onChange,
}: {
  requestId: string;
  assetId: string | null;
  documentation: Documentation;
  onChange: () => unknown;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const docs = useQuery({
    queryKey: ['asset-documents', assetId],
    queryFn: () => api<{ documents: DocumentItem[] }>(`/assets/${assetId}/documents`),
    enabled: Boolean(assetId),
    refetchInterval: documentation.summary.processing > 0 ? 3000 : false,
  });
  const run = useApiMutation(
    async (action: () => Promise<unknown>) => action(),
    [
      ['guarantee-requests', requestId],
      ['asset-documents', assetId],
    ],
  );
  const act = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await run.mutateAsync(action);
      await onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No fue posible completar la acción.');
    }
  };
  const byId = new Map((docs.data?.documents ?? []).map((d) => [d.id, d]));
  const { summary, product } = documentation;
  const groups = documentation.items.reduce<Record<string, RequirementItem[]>>((acc, item) => {
    (acc[item.categoryLabel] ??= []).push(item);
    return acc;
  }, {});

  return (
    <Panel
      id="documentacion"
      title="Documentación"
      subtitle={
        product ? (
          <>
            {product.name}
            {product.kind === 'REFERENCE' && product.consultedAt
              ? ` · referencia pública consultada el ${new Date(product.consultedAt).toLocaleDateString('es-AR')}`
              : ''}
          </>
        ) : (
          'Checklist de la solicitud'
        )
      }
      actions={
        <span className={styles.summaryCount}>
          <strong className="tabular">{summary.consistent}</strong> de{' '}
          {summary.total - summary.notApplicable} consistentes
        </span>
      }
    >
      <div className={styles.stack}>
        <Progress
          total={summary.total}
          segments={[
            { label: 'Consistentes', value: summary.consistent, tone: 'success' },
            { label: 'Requieren atención', value: summary.attention, tone: 'critical' },
            { label: 'En proceso', value: summary.processing, tone: 'info' },
            { label: 'Pendientes', value: summary.pending, tone: 'warning' },
            { label: 'No aplica', value: summary.notApplicable, tone: 'neutral' },
          ]}
        />
        {product?.kind === 'REFERENCE' ? (
          <p className={styles.note}>
            Requisitos tomados de información pública de la línea; no es la lista oficial de la
            entidad.{' '}
            {product.sources?.map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
                {s.label}
              </a>
            ))}
          </p>
        ) : null}
        {error ? <Callout tone="critical">{error}</Callout> : null}

        {Object.entries(groups).map(([category, items]) => (
          <section key={category} aria-label={category}>
            <h3 className={styles.groupTitle}>{category}</h3>
            <ul className={styles.list}>
              {items.map((item) => {
                const doc = item.document ? byId.get(item.document.id) : undefined;
                const expanded = open === item.code;
                return (
                  <li
                    key={item.code}
                    className={styles.item}
                    data-testid={`requirement-${item.code}`}
                  >
                    <div className={styles.itemMain}>
                      <div className={styles.itemStatus}>
                        <RequirementStatusBadge status={item.status} />
                      </div>
                      <div className={styles.itemBody}>
                        <div className={styles.itemTitle}>
                          <strong>{item.name}</strong>
                          <Badge tone="outline">{item.obligationLabel}</Badge>
                        </div>
                        <p
                          className={styles.reason}
                          data-testid={`requirement-reason-${item.code}`}
                        >
                          {item.reason}
                          {item.condition ? ` · ${item.condition}` : ''}
                        </p>
                        {item.document ? (
                          <p className={styles.meta}>
                            {item.document.title} · {formatDateTime(item.document.uploadedAt)}
                            {item.document.demo ? (
                              <>
                                {' '}
                                <DemoBadge label="Documento de demostración" />
                              </>
                            ) : null}
                          </p>
                        ) : null}
                        {item.requested ? (
                          <p className={styles.meta}>
                            Solicitado al productor el{' '}
                            {new Date(item.requested.at).toLocaleDateString('es-AR')}
                          </p>
                        ) : null}
                        {item.note ? <p className={styles.meta}>Nota: {item.note}</p> : null}
                      </div>
                      <div className={styles.actions}>
                        {item.document ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-expanded={expanded}
                              onClick={() => setOpen(expanded ? null : item.code)}
                            >
                              {expanded ? 'Ocultar documento' : 'Ver documento'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={run.isPending}
                              onClick={() =>
                                act(() =>
                                  api(`/documents/${item.document!.id}/analyze`, {
                                    method: 'POST',
                                  }),
                                )
                              }
                            >
                              Procesar de nuevo
                            </Button>
                          </>
                        ) : null}
                        {item.status !== 'NOT_APPLICABLE' &&
                        item.status !== 'CONSISTENT' &&
                        !item.requested ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              act(() =>
                                api(`/guarantee-requests/${requestId}/information-requests`, {
                                  method: 'POST',
                                  body: { kind: 'DOCUMENT', requirementCode: item.code },
                                }),
                              )
                            }
                          >
                            Solicitar
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            act(() =>
                              api(`/guarantee-requests/${requestId}/requirements/${item.code}`, {
                                method: 'PATCH',
                                body: { notApplicable: item.status !== 'NOT_APPLICABLE' },
                              }),
                            )
                          }
                        >
                          {item.status === 'NOT_APPLICABLE' ? 'Aplica' : 'No aplica'}
                        </Button>
                      </div>
                    </div>
                    {expanded && item.document ? (
                      <div className={styles.docPanel}>
                        <DocumentViewer
                          queryKey={[item.document.id]}
                          title={item.document.title}
                          resolve={() =>
                            api<ViewableDocument>(
                              `/documents/${item.document!.id}/download?inline=1`,
                            )
                          }
                        />
                        {item.validation === 'OCR_CHECK' ? <OcrDetail document={doc} /> : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Panel>
  );
}

/** Lo que leyó el OCR: valor tal como figura, normalizado, confianza y comparación. */
export function OcrDetail({ document }: { document: DocumentItem | undefined }) {
  const a = document?.analysis;
  if (!a) return <p className={styles.ocrEmpty}>Lectura en curso o no disponible.</p>;
  const entries: OcrFieldEntry[] = a.fieldEntries ?? [];
  const checks = a.validationResults.filter((r) => r.check !== 'TEXT');
  if (a.status === 'FAILED')
    return (
      <div className={styles.ocr} data-testid="ocr-detail">
        <p className={styles.meta}>
          <strong>No se pudo leer el documento.</strong> El servicio de lectura no respondió o no
          pudo procesar el archivo. Probá “Procesar de nuevo” más tarde o revisalo a mano.
        </p>
        {a.error ? <p className={styles.ocrEmpty}>Detalle técnico: {a.error}</p> : null}
        <p className={styles.disclaimer}>{a.disclaimer}</p>
      </div>
    );
  return (
    <div className={styles.ocr} data-testid="ocr-detail">
      <p className={styles.meta}>
        {a.method === 'OCR' ? 'OCR' : a.method === 'PDF_TEXT' ? 'Capa de texto del PDF' : 'Lectura'}
        {a.extractionConfidence != null
          ? ` · confianza ${Math.round(a.extractionConfidence * 100)} %`
          : ''}
        {a.engine ? ` · ${a.engine}` : ''}
      </p>
      {entries.length ? (
        <table className={styles.ocrTable}>
          <caption className="visually-hidden">Campos leídos del documento</caption>
          <thead>
            <tr>
              <th scope="col">Campo</th>
              <th scope="col">Leído</th>
              <th scope="col">Normalizado</th>
              <th scope="col" className={styles.num}>
                Confianza
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={`${e.field}-${i}`}>
                <td>{OCR_FIELD_LABELS[e.field] ?? e.field}</td>
                <td className={styles.mono}>{e.original}</td>
                <td className={styles.mono}>{e.normalized}</td>
                <td className={`${styles.num} tabular`}>
                  {e.confidence != null ? `${Math.round(e.confidence * 100)} %` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className={styles.ocrEmpty}>No se encontraron campos reconocibles.</p>
      )}
      {checks.length ? (
        <ul className={styles.checks}>
          {checks.map((c) => (
            <Fragment key={c.check}>
              <li data-status={c.status}>
                <span aria-hidden>
                  {c.status === 'MATCH' ? '✓' : c.status === 'MISMATCH' ? '✕' : '–'}
                </span>{' '}
                {c.message}
              </li>
            </Fragment>
          ))}
        </ul>
      ) : null}
      <p className={styles.disclaimer}>{a.disclaimer}</p>
    </div>
  );
}
