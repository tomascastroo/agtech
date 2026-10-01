import type { Anomaly } from '../../../domain/verification.types.js';
import type { VerificationEvidenceEntity } from '../../../infrastructure/verification-evidence.entity.js';

interface QualityShape {
  score?: number;
  dhash?: string;
}

export function quality(link: VerificationEvidenceEntity): QualityShape {
  return ((link.analysis as { quality?: QualityShape }).quality ?? {}) as QualityShape;
}

export function primary(links: VerificationEvidenceEntity[]): VerificationEvidenceEntity[] {
  return links.filter((l) => l.role === 'PRIMARY');
}

export function newestCapture(links: VerificationEvidenceEntity[]): Date | null {
  const times = links.map((l) => l.evidence?.capturedAt?.getTime()).filter((t): t is number => !!t);
  return times.length ? new Date(Math.max(...times)) : null;
}

export function averageQuality(links: VerificationEvidenceEntity[]): number | null {
  const scores = links
    .map((l) => quality(l).score)
    .filter((s): s is number => typeof s === 'number');
  return scores.length
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 1000) / 1000
    : null;
}

/** Dos imágenes distintas con el mismo hash perceptual dentro de una verificación. */
export function duplicateEvidenceAnomaly(links: VerificationEvidenceEntity[]): Anomaly | null {
  const seen = new Map<string, string>();
  const duplicates: string[][] = [];
  for (const link of links) {
    const hash = quality(link).dhash;
    if (!hash) continue;
    const first = seen.get(hash);
    if (first) duplicates.push([first, link.evidenceId]);
    else seen.set(hash, link.evidenceId);
  }
  if (duplicates.length === 0) return null;
  return {
    code: 'DUPLICATE_EVIDENCE',
    severity: 'WARNING',
    message: `Se detectaron ${duplicates.length} imágenes repetidas entre fuentes distintas.`,
    details: { pairs: duplicates },
  };
}

export function lowQualityAnomaly(links: VerificationEvidenceEntity[]): Anomaly | null {
  const excluded = links.filter((l) => l.role === 'EXCLUDED');
  if (excluded.length === 0) return null;
  return {
    code: 'LOW_IMAGE_QUALITY',
    severity: 'INFO',
    message: `${excluded.length} imágenes excluidas del análisis por calidad insuficiente.`,
    details: { evidenceIds: excluded.map((l) => l.evidenceId) },
  };
}
