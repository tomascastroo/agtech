'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { DescriptionList } from '@/components/ui/Panel';
import type { EvidenceItem, VerificationEvidence } from '@/lib/api/types';
import { formatDateTime, formatNumber, formatPercent } from '@/lib/format';
import { SimulatedBadge } from './StatusBadges';
import styles from './domain.module.css';

export interface GalleryItem {
  id: string;
  url: string | null;
  title: string;
  kind: EvidenceItem['type'];
  capturedAt: string;
  location: [number, number] | null;
  sourceName: string;
  simulated: boolean;
  sha256: string | null;
  count?: number | null;
  countLabel?: string;
  confidence?: number | null;
  model?: string | null;
  quality?: number | null;
  issues?: string[];
  role?: VerificationEvidence['role'];
  exclusionReason?: string | null;
  extra?: [string, string][];
}

const QUALITY_ISSUES: Record<string, string> = {
  BLURRY: 'Imagen desenfocada',
  TOO_DARK: 'Imagen oscura',
  TOO_BRIGHT: 'Imagen sobreexpuesta',
  LOW_CONTRAST: 'Bajo contraste',
  LOW_RESOLUTION: 'Baja resolución',
};

const ROLE_LABELS: Record<string, string> = {
  PRIMARY: 'Utilizada',
  SUPPORTING: 'De apoyo',
  EXCLUDED: 'Excluida',
};

function titleFor(item: EvidenceItem): string {
  for (const key of ['installationLabel', 'description', 'originalFileName']) {
    const value = item.metadata[key];
    if (typeof value === 'string' && value) return value;
  }
  if (item.type === 'SATELLITE_SCENE') return 'Escena satelital';
  return item.source?.name ?? 'Imagen';
}

export function fromEvidenceItem(item: EvidenceItem): GalleryItem {
  const serial = typeof item.metadata.deviceSerial === 'string' ? item.metadata.deviceSerial : null;
  return {
    id: item.id,
    url: item.url,
    title: serial ? `${titleFor(item)} · ${serial}` : titleFor(item),
    kind: item.type,
    capturedAt: item.capturedAt,
    location: item.location ? item.location.coordinates : null,
    sourceName: item.source?.name ?? 'Carga manual',
    simulated: item.source?.simulated ?? false,
    sha256: item.sha256,
  };
}

export function fromVerificationEvidence(
  link: VerificationEvidence,
  unitText: string,
): GalleryItem | null {
  if (!link.evidence) return null;
  const base = fromEvidenceItem(link.evidence);
  const isScene = link.evidence.type === 'SATELLITE_SCENE';
  const extra: [string, string][] = [];
  if (isScene) {
    if (link.analysis.ndviMean !== undefined)
      extra.push(['NDVI medio', formatNumber(link.analysis.ndviMean, 2)]);
    if (link.analysis.vegetatedAreaHa !== undefined)
      extra.push(['Sup. con vegetación', `${formatNumber(link.analysis.vegetatedAreaHa, 1)} ha`]);
    if (link.analysis.cloudCoverPct !== undefined)
      extra.push(['Nubosidad', formatPercent(link.analysis.cloudCoverPct, 0)]);
  }
  return {
    ...base,
    count: isScene ? null : link.detectedCount,
    countLabel: unitText,
    confidence: link.confidence,
    model: link.analysis.model
      ? `${link.analysis.model.code} v${link.analysis.model.version}`
      : null,
    simulated: base.simulated || Boolean(link.analysis.model?.simulated),
    quality: link.analysis.quality?.score ?? null,
    issues: link.analysis.quality?.issues ?? [],
    role: link.role,
    exclusionReason: link.exclusionReason,
    extra,
  };
}

const coords = (c: [number, number] | null) =>
  c ? `${c[1].toFixed(5)}, ${c[0].toFixed(5)}` : 'Sin geolocalización';

function details(item: GalleryItem): [string, string][] {
  const rows: [string, string][] = [
    ['Captura', formatDateTime(item.capturedAt)],
    ['Fuente', item.sourceName],
    ['Ubicación', coords(item.location)],
  ];
  if (item.model) rows.push(['Modelo', item.model]);
  if (item.confidence !== undefined && item.confidence !== null)
    rows.push(['Confianza', formatPercent(item.confidence * 100, 0)]);
  if (item.quality !== undefined && item.quality !== null)
    rows.push(['Calidad', formatPercent(item.quality * 100, 0)]);
  rows.push(...(item.extra ?? []));
  return rows;
}

/**
 * Galería de evidencia: cada imagen muestra su conteo, modelo, confianza, ubicación y hora,
 * y abre el detalle completo (incluido el hash SHA-256 que la vincula al resultado).
 */
export function EvidenceGallery({
  items,
  emptyText = 'Sin evidencia registrada.',
}: {
  items: GalleryItem[];
  emptyText?: string;
}) {
  const [open, setOpen] = useState<GalleryItem | null>(null);
  if (items.length === 0) return <p className={styles.muted}>{emptyText}</p>;

  return (
    <>
      <div className={styles.gallery} data-testid="evidence-gallery">
        {items.map((item) => (
          <article
            key={item.id}
            className={`${styles.evidenceCard} ${item.role === 'EXCLUDED' ? styles.evidenceCardExcluded : ''}`}
          >
            <button
              type="button"
              className={styles.evidenceImage}
              onClick={() => setOpen(item)}
              aria-label={`Ver detalle de ${item.title}`}
            >
              {item.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal del almacenamiento de objetos
                <img src={item.url} alt={item.title} loading="lazy" />
              ) : null}
              {item.count !== undefined && item.count !== null ? (
                <span className={styles.evidenceOverlay}>
                  <span className={styles.evidenceCount}>
                    {formatNumber(item.count)} {item.countLabel}
                  </span>
                </span>
              ) : null}
            </button>
            <div className={styles.evidenceBody}>
              <div className={styles.evidenceTitle}>
                <span>{item.title}</span>
                {item.simulated ? <SimulatedBadge /> : null}
              </div>
              <dl className={styles.evidenceMeta}>
                {details(item)
                  .slice(0, 5)
                  .map(([term, value]) => (
                    <div key={term} style={{ display: 'contents' }}>
                      <dt>{term}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
              </dl>
              {item.role ? (
                <div className={styles.inline} style={{ marginTop: 4 }}>
                  <Badge tone={item.role === 'EXCLUDED' ? 'warning' : 'neutral'}>
                    {ROLE_LABELS[item.role]}
                  </Badge>
                  {item.exclusionReason ? <span>{item.exclusionReason}</span> : null}
                </div>
              ) : null}
              {item.issues && item.issues.length > 0 ? (
                <div className={styles.inline}>
                  {item.issues.map((issue) => (
                    <Badge key={issue} tone="warning">
                      {QUALITY_ISSUES[issue] ?? issue}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      <Modal open={open !== null} title={open?.title ?? ''} onClose={() => setOpen(null)}>
        {open ? (
          <div className={styles.stackTight}>
            {open.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal del almacenamiento de objetos
              <img src={open.url} alt={open.title} className={styles.lightbox} />
            ) : null}
            <DescriptionList
              items={[
                ...(open.count !== undefined && open.count !== null
                  ? ([['Detectado', `${formatNumber(open.count)} ${open.countLabel ?? ''}`]] as [
                      string,
                      string,
                    ][])
                  : []),
                ...details(open),
                [
                  'SHA-256',
                  <span key="sha" className={styles.mono}>
                    {open.sha256 ?? '—'}
                  </span>,
                ],
                ['Origen', open.simulated ? 'Fuente simulada de desarrollo' : open.sourceName],
              ]}
            />
          </div>
        ) : null}
      </Modal>
    </>
  );
}
