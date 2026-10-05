import type { EvidenceMethod, CaptureOrigin, CountBasis } from '../domain/collateral.types.js';
import { assessEvidenceQuality, type EvidenceQuality } from '../domain/evidence-quality.js';

/**
 * Traduce la evidencia que ya registra la plataforma (verificaciones, escaneos, inspecciones) a
 * observaciones del motor de garantía. Sin efectos: lo usa CollateralService.
 */
export interface EvidenceRow {
  id: string;
  type: string;
  deviceId: string | null;
  capturedAt: Date;
  hasLocation: boolean;
  metadata: Record<string, unknown>;
  sourceSimulated: boolean;
}

export interface RunRow {
  runId: string;
  completedAt: Date;
  detected: number | null;
  confidence: number | null;
  locationVerified: boolean | null;
  basis: string | null;
  evidence: EvidenceRow[];
}

export interface CandidateObservation {
  kind: 'VERIFICACION' | 'INSPECCION';
  refId: string;
  count: number;
  basis: CountBasis;
  method: EvidenceMethod;
  observedAt: Date;
  captureOrigin: CaptureOrigin;
  quality: EvidenceQuality;
  locationVerified: boolean | null;
  evidenceIds: string[];
  confidence: number | null;
}

const SCAN_METHOD: Record<string, EvidenceMethod> = {
  FIXED: 'ESCANER_FIJO',
  CHUTE: 'MANGA_RFID',
  SWEEP: 'VIDEO',
  PEN: 'VIDEO',
  PHOTO: 'FOTO',
};

/** Método dominante de una verificación: el de mayor techo de calidad entre su evidencia. */
export function methodOf(evidence: EvidenceRow[]): EvidenceMethod {
  const methods = evidence.map((e) =>
    e.type === 'SCAN' ? (SCAN_METHOD[String(e.metadata.mode)] ?? 'VIDEO') : 'FOTO',
  );
  for (const m of ['MANGA_RFID', 'ESCANER_FIJO', 'VIDEO'] as EvidenceMethod[])
    if (methods.includes(m)) return m;
  return 'FOTO';
}

export function originOf(e: EvidenceRow): CaptureOrigin {
  if (e.type === 'SCAN') return 'CAPTURA_EN_CAMPO'; // el escáner solo captura desde la app
  if (e.deviceId) return 'DISPOSITIVO_FIJO';
  const declared = e.metadata.captureOrigin;
  if (declared === 'CAPTURA_EN_CAMPO' || declared === 'ARCHIVO_CARGADO') return declared;
  return 'DESCONOCIDO';
}

/** El peor origen manda (una foto de galería entre capturas en campo baja la calidad). */
function worstOrigin(origins: CaptureOrigin[]): CaptureOrigin {
  if (origins.includes('ARCHIVO_CARGADO')) return 'ARCHIVO_CARGADO';
  if (origins.includes('DESCONOCIDO')) return 'DESCONOCIDO';
  if (origins.includes('DISPOSITIVO_FIJO')) return 'DISPOSITIVO_FIJO';
  return origins.length ? 'CAPTURA_EN_CAMPO' : 'DESCONOCIDO';
}

export function observationFromRun(run: RunRow): CandidateObservation | null {
  if (run.detected === null || run.evidence.length === 0) return null;
  const method = methodOf(run.evidence);
  const basis: CountBasis = run.basis === 'CENSUS' ? 'CENSO' : 'COTA_INFERIOR';
  const origin = worstOrigin(run.evidence.map(originOf));
  const statuses = run.evidence
    .map((e) => e.metadata.evidenceStatus)
    .filter((s): s is string => typeof s === 'string');
  const evidenceStatus = statuses.includes('VALIDATED')
    ? 'VALIDATED'
    : statuses.includes('INCONCLUSIVE')
      ? 'INCONCLUSIVE'
      : statuses.length
        ? 'INSUFFICIENT'
        : null;
  const simulated = run.evidence.some(
    (e) => e.sourceSimulated || e.metadata.simulated === true || e.metadata.lowerBound === true,
  );
  const quality = assessEvidenceQuality({
    method,
    basis,
    // Origen desconocido (cargas anteriores a este registro) se trata como archivo cargado.
    captureOrigin: origin === 'DESCONOCIDO' ? 'ARCHIVO_CARGADO' : origin,
    evidenceStatus: evidenceStatus as 'VALIDATED' | 'INCONCLUSIVE' | 'INSUFFICIENT' | null,
    hasCaptureLocation: run.evidence.some((e) => e.hasLocation),
    confidence: run.confidence,
    simulated,
  });
  if (origin === 'DESCONOCIDO')
    quality.reasons.push(
      'Origen de captura no registrado (carga anterior): se considera archivo cargado.',
    );
  const newest = run.evidence.reduce((a, e) => (e.capturedAt > a ? e.capturedAt : a), new Date(0));
  return {
    kind: 'VERIFICACION',
    refId: run.runId,
    count: Math.round(run.detected),
    basis,
    method,
    observedAt: newest.getTime() > 0 ? newest : run.completedAt,
    captureOrigin: origin,
    quality,
    locationVerified: run.locationVerified,
    evidenceIds: run.evidence.map((e) => e.id),
    confidence: run.confidence,
  };
}

export interface InspectionRow {
  id: string;
  performedAt: Date;
  observedHeads: number;
  fullCount: boolean;
  hasLocation: boolean;
  locationVerified: boolean | null;
  evidenceIds: string[];
  result: string;
}

export function observationFromInspection(row: InspectionRow): CandidateObservation {
  const basis: CountBasis = row.fullCount ? 'CENSO' : 'COTA_INFERIOR';
  const quality = assessEvidenceQuality({
    method: 'INSPECCION',
    basis,
    captureOrigin: 'CAPTURA_EN_CAMPO',
    hasCaptureLocation: row.hasLocation,
    evidenceStatus: row.result === 'NO_DETERMINABLE' ? 'INCONCLUSIVE' : null,
  });
  return {
    kind: 'INSPECCION',
    refId: row.id,
    count: row.observedHeads,
    basis,
    method: 'INSPECCION',
    observedAt: row.performedAt,
    captureOrigin: 'CAPTURA_EN_CAMPO',
    quality,
    locationVerified: row.locationVerified,
    evidenceIds: row.evidenceIds,
    confidence: null,
  };
}

/**
 * Observación vigente: el conteo completo (censo) más reciente dentro de la antigüedad máxima; si
 * no hay, la observación más reciente. Una vista parcial posterior no "pisa" un censo vigente
 * (mostrar una parte del rodeo no prueba un faltante).
 */
export function pickObservation(
  candidates: CandidateObservation[],
  now: Date,
  maxEvidenceAgeDays: number,
): { chosen: CandidateObservation | null; why: string } {
  const sorted = [...candidates].sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());
  const limit = now.getTime() - maxEvidenceAgeDays * 86_400_000;
  const census = sorted.find(
    (c) =>
      c.basis === 'CENSO' && c.quality.level !== 'INSUFICIENTE' && c.observedAt.getTime() >= limit,
  );
  if (census)
    return { chosen: census, why: 'Conteo completo más reciente dentro de la antigüedad máxima.' };
  const usable = sorted.find((c) => c.quality.level !== 'INSUFICIENTE') ?? sorted[0] ?? null;
  return {
    chosen: usable,
    why: usable
      ? 'Observación más reciente (no hay conteo completo vigente).'
      : 'Sin observaciones.',
  };
}
