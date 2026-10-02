/**
 * Manga + RFID: asociación de UNA lectura de caravana con UN bovino observado por la cámara.
 *
 *   RFID  = identidad (la caravana electrónica)
 *   YOLOX = detección ("hay un bovino")
 *   ByteTrack = seguimiento ("es el mismo bovino que en el cuadro anterior")
 *   este módulo = asociación: ¿la lectura corresponde, sin ambigüedad, a un único bovino estable
 *   dentro de la zona de captura?
 *
 * No reconoce animales por su aspecto (no hay Re-ID): solo decide si la escena permite asociar.
 * Regla de seguridad: ante cualquier duda, NO se asocia (AMBIGUOUS o INSUFFICIENT_EVIDENCE).
 *
 * Es la decisión OFICIAL (servidor). El celular usa una copia para el resultado preliminar
 * (apps/web/src/lib/scanner/chute-matching.ts); ambas se prueban con el mismo fixture
 * (apps/api/test/fixtures/chute-matching.json).
 */

export const CHUTE_MATCHER_VERSION = 'agro-chute-match/1.0.0';

export type ChuteStatus = 'CONFIRMED' | 'AMBIGUOUS' | 'INSUFFICIENT_EVIDENCE';

export type ChuteReason =
  | 'ONE_STABLE_ANIMAL'
  | 'NO_RFID'
  | 'INVALID_RFID'
  | 'MULTIPLE_RFID'
  | 'RFID_OUT_OF_WINDOW'
  | 'NO_ANIMAL'
  | 'MULTIPLE_ANIMALS'
  | 'UNSTABLE_TRACK'
  | 'ANIMAL_MOVING'
  | 'OCCLUDED'
  | 'PARTIALLY_VISIBLE'
  | 'LOW_QUALITY'
  | 'OVERLAPPING_CAPTURES'
  | 'SAME_ANIMAL_MULTIPLE_RFID'
  | 'RFID_ALREADY_REGISTERED';

/** Zona de captura: rectángulo en fracciones del cuadro (0-1). */
export interface CaptureZone {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export const DEFAULT_CAPTURE_ZONE: CaptureZone = { x1: 0.1, y1: 0.05, x2: 0.9, y2: 0.98 };

export interface ChuteParams {
  /** Ventana alrededor de la lectura: los relojes de la cámara y del lector no coinciden. */
  windowBeforeMs: number;
  windowAfterMs: number;
  /** Cuadros mínimos dentro de la ventana para decidir. */
  minWindowFrames: number;
  /** Puntaje mínimo de una detección para considerarla "un bovino claramente presente". */
  presentScore: number;
  /** Fracción mínima de la caja que debe caer dentro de la zona de captura. */
  minZoneOverlap: number;
  /** Área mínima de la caja (fracción del cuadro): lejos o asomado no cuenta. */
  minAreaFraction: number;
  /** Fracción de cuadros de la ventana en que el bovino candidato debe estar presente. */
  minPresence: number;
  /** Desplazamiento máximo del centro en la ventana, relativo al tamaño del animal. */
  maxMovement: number;
  /** Superposición (IoU) con otra detección a partir de la cual el animal está tapado. */
  occlusionIou: number;
  /** Nitidez mínima (varianza del laplaciano) y brillo aceptable de un cuadro utilizable. */
  minSharpness: number;
  minBrightness: number;
  maxBrightness: number;
  /** Mejores cuadros a conservar por animal. */
  maxBestFrames: number;
  /** Separación mínima entre cuadros elegidos (evita guardar cuadros casi idénticos). */
  minBestGapMs: number;
}

export const DEFAULT_CHUTE_PARAMS: ChuteParams = {
  windowBeforeMs: 1500,
  windowAfterMs: 1000,
  minWindowFrames: 3,
  presentScore: 0.5,
  minZoneOverlap: 0.6,
  minAreaFraction: 0.03,
  minPresence: 0.6,
  maxMovement: 0.35,
  occlusionIou: 0.2,
  minSharpness: 40,
  minBrightness: 35,
  maxBrightness: 225,
  maxBestFrames: 8,
  minBestGapMs: 150,
};

export interface TrackedDetection {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
  trackId: number | null;
  confirmed: boolean;
}

export interface ChuteFrame {
  index: number;
  /** ms desde el inicio de la sesión (reloj del celular, el mismo de la lectura). */
  capturedMs: number;
  detections: TrackedDetection[];
  sharpness: number;
  brightness: number;
}

export interface ChuteRead {
  /** EID ya normalizado (15 dígitos) o null si la lectura no es un EID válido. */
  eid: string | null;
  atMs: number;
}

export interface ChuteMatchInput {
  frameSize: { width: number; height: number };
  zone: CaptureZone;
  reads: ChuteRead[];
  frames: ChuteFrame[];
}

export interface SelectedFrame {
  index: number;
  capturedMs: number;
  box: { x: number; y: number; width: number; height: number };
  score: number;
  sharpness: number;
  brightness: number;
  quality: number;
}

export interface ChuteDecision {
  status: ChuteStatus;
  reason: ChuteReason;
  eid: string | null;
  trackId: number | null;
  readAtMs: number | null;
  /** Mejores cuadros del animal (solo si CONFIRMED). */
  bestFrames: SelectedFrame[];
  metrics: {
    windowFrames: number;
    framesWithAnimal: number;
    maxAnimalsInZone: number;
    presence: number;
    movement: number | null;
    occludedFrames: number;
    meanScore: number | null;
  };
  matcher: string;
}

const area = (d: TrackedDetection) => Math.max(0, d.width) * Math.max(0, d.height);

function iou(a: TrackedDetection, b: TrackedDetection): number {
  const ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const union = area(a) + area(b) - inter;
  return union > 0 ? inter / union : 0;
}

function zoneOverlap(d: TrackedDetection, zone: CaptureZone, w: number, h: number): number {
  const zx1 = zone.x1 * w;
  const zy1 = zone.y1 * h;
  const zx2 = zone.x2 * w;
  const zy2 = zone.y2 * h;
  const ix = Math.max(0, Math.min(d.x + d.width, zx2) - Math.max(d.x, zx1));
  const iy = Math.max(0, Math.min(d.y + d.height, zy2) - Math.max(d.y, zy1));
  const a = area(d);
  return a > 0 ? (ix * iy) / a : 0;
}

/** ¿La caja toca el borde del cuadro? (animal cortado: asomado o saliendo) */
function clipped(d: TrackedDetection, w: number, h: number): boolean {
  const m = 2;
  return d.x <= m || d.y <= m || d.x + d.width >= w - m || d.y + d.height >= h - m;
}

/** Bovinos claramente presentes dentro de la zona de captura en un cuadro. */
export function animalsInZone(
  frame: ChuteFrame,
  input: Pick<ChuteMatchInput, 'frameSize' | 'zone'>,
  p: ChuteParams = DEFAULT_CHUTE_PARAMS,
): TrackedDetection[] {
  const { width: w, height: h } = input.frameSize;
  return frame.detections.filter(
    (d) =>
      d.score >= p.presentScore &&
      area(d) >= p.minAreaFraction * w * h &&
      zoneOverlap(d, input.zone, w, h) >= p.minZoneOverlap,
  );
}

const usable = (f: ChuteFrame, p: ChuteParams) =>
  f.sharpness >= p.minSharpness &&
  f.brightness >= p.minBrightness &&
  f.brightness <= p.maxBrightness;

function decision(
  status: ChuteStatus,
  reason: ChuteReason,
  partial: Partial<Omit<ChuteDecision, 'metrics'>> & {
    metrics?: Partial<ChuteDecision['metrics']>;
  } = {},
): ChuteDecision {
  return {
    status,
    reason,
    eid: partial.eid ?? null,
    trackId: partial.trackId ?? null,
    readAtMs: partial.readAtMs ?? null,
    bestFrames: partial.bestFrames ?? [],
    metrics: {
      windowFrames: 0,
      framesWithAnimal: 0,
      maxAnimalsInZone: 0,
      presence: 0,
      movement: null,
      occludedFrames: 0,
      meanScore: null,
      ...partial.metrics,
    },
    matcher: CHUTE_MATCHER_VERSION,
  };
}

/**
 * Decide si las lecturas de una captura corresponden a un único bovino estable. Orden de las
 * reglas: primero la identidad (RFID), después la escena; ante la primera duda se detiene.
 */
export function matchChuteCapture(
  input: ChuteMatchInput,
  params: Partial<ChuteParams> = {},
): ChuteDecision {
  const p = { ...DEFAULT_CHUTE_PARAMS, ...params };
  const { width: w, height: h } = input.frameSize;

  // 1. Identidad: exactamente una caravana válida.
  if (input.reads.length === 0) return decision('INSUFFICIENT_EVIDENCE', 'NO_RFID');
  if (input.reads.some((r) => r.eid === null))
    return decision('INSUFFICIENT_EVIDENCE', 'INVALID_RFID');
  const eids = [...new Set(input.reads.map((r) => r.eid!))];
  if (eids.length > 1) return decision('AMBIGUOUS', 'MULTIPLE_RFID');
  const eid = eids[0]!;
  const readAtMs = Math.min(...input.reads.map((r) => r.atMs));
  const base = { eid, readAtMs };

  // 2. Ventana temporal alrededor de la lectura (no se asume reloj idéntico).
  const window = input.frames
    .filter(
      (f) =>
        f.capturedMs >= readAtMs - p.windowBeforeMs && f.capturedMs <= readAtMs + p.windowAfterMs,
    )
    .sort((a, b) => a.capturedMs - b.capturedMs);
  if (window.length < p.minWindowFrames)
    return decision('INSUFFICIENT_EVIDENCE', 'RFID_OUT_OF_WINDOW', {
      ...base,
      metrics: { windowFrames: window.length },
    });

  // 3. Cuántos bovinos hay en la zona.
  const inZone = window.map((f) => animalsInZone(f, input, p));
  const counts = inZone.map((z) => z.length);
  const maxAnimalsInZone = Math.max(...counts);
  const framesWithAnimal = counts.filter((c) => c > 0).length;
  const metrics = { windowFrames: window.length, framesWithAnimal, maxAnimalsInZone };
  if (counts.filter((c) => c >= 2).length >= 2)
    return decision('AMBIGUOUS', 'MULTIPLE_ANIMALS', { ...base, metrics });
  if (framesWithAnimal / window.length < p.minPresence)
    return decision(
      'INSUFFICIENT_EVIDENCE',
      framesWithAnimal === 0 ? 'NO_ANIMAL' : 'UNSTABLE_TRACK',
      {
        ...base,
        metrics,
      },
    );

  // 4. Un único track estable: el mismo id durante la ventana (sin cortes ni cambios de id).
  const ids = new Map<number, number>();
  for (const z of inZone)
    for (const d of z)
      if (d.trackId !== null && d.confirmed) ids.set(d.trackId, (ids.get(d.trackId) ?? 0) + 1);
  const [trackId, hits] = [...ids.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  const presence = hits / window.length;
  if (trackId === null || presence < p.minPresence || ids.size > 1)
    return decision('INSUFFICIENT_EVIDENCE', 'UNSTABLE_TRACK', {
      ...base,
      metrics: { ...metrics, presence },
    });

  const own = window
    .map((f, i) => ({ f, d: inZone[i]!.find((x) => x.trackId === trackId) }))
    .filter((x): x is { f: ChuteFrame; d: TrackedDetection } => x.d !== undefined);

  // 5. Quieto o casi quieto: el centro no se desplaza más que una fracción de su tamaño.
  const cx = own.map(({ d }) => d.x + d.width / 2);
  const cy = own.map(({ d }) => d.y + d.height / 2);
  const size = Math.max(...own.map(({ d }) => Math.max(d.width, d.height)), 1);
  const movement =
    Math.hypot(Math.max(...cx) - Math.min(...cx), Math.max(...cy) - Math.min(...cy)) / size;
  const meanScore = own.reduce((a, { d }) => a + d.score, 0) / own.length;
  const m2 = { ...metrics, presence, movement: round(movement), meanScore: round(meanScore) };
  if (movement > p.maxMovement)
    return decision('INSUFFICIENT_EVIDENCE', 'ANIMAL_MOVING', { ...base, trackId, metrics: m2 });

  // 6. Tapado por otro animal o cortado por el borde en la mayoría de los cuadros.
  const occluded = own.filter(({ f, d }) =>
    f.detections.some((o) => o !== d && o.score >= p.presentScore && iou(o, d) >= p.occlusionIou),
  ).length;
  const m3 = { ...m2, occludedFrames: occluded };
  if (occluded / own.length > 0.5)
    return decision('INSUFFICIENT_EVIDENCE', 'OCCLUDED', { ...base, trackId, metrics: m3 });
  const visible = own.filter(({ d }) => !clipped(d, w, h));
  if (visible.length === 0)
    return decision('INSUFFICIENT_EVIDENCE', 'PARTIALLY_VISIBLE', {
      ...base,
      trackId,
      metrics: m3,
    });

  // 7. Calidad: al menos un cuadro nítido y bien expuesto del animal.
  const good = visible.filter(({ f }) => usable(f, p));
  if (good.length === 0)
    return decision('INSUFFICIENT_EVIDENCE', 'LOW_QUALITY', { ...base, trackId, metrics: m3 });

  return decision('CONFIRMED', 'ONE_STABLE_ANIMAL', {
    ...base,
    trackId,
    bestFrames: selectBestFrames(good, w * h, p),
    metrics: m3,
  });
}

/**
 * Mejores cuadros del animal: puntaje por confianza, nitidez, tamaño y exposición, y diversidad
 * (separación mínima en el tiempo) para no guardar cuadros casi idénticos.
 */
export function selectBestFrames(
  candidates: { f: ChuteFrame; d: TrackedDetection }[],
  frameArea: number,
  p: ChuteParams = DEFAULT_CHUTE_PARAMS,
): SelectedFrame[] {
  const maxSharp = Math.max(...candidates.map(({ f }) => f.sharpness), 1);
  const scored = candidates.map(({ f, d }) => {
    const exposure = 1 - Math.min(1, Math.abs(f.brightness - 128) / 128);
    const quality =
      0.4 * d.score +
      0.3 * (f.sharpness / maxSharp) +
      0.2 * Math.min(1, area(d) / (0.25 * frameArea)) +
      0.1 * exposure;
    return {
      index: f.index,
      capturedMs: f.capturedMs,
      box: { x: d.x, y: d.y, width: d.width, height: d.height },
      score: d.score,
      sharpness: f.sharpness,
      brightness: f.brightness,
      quality: round(quality),
    };
  });
  scored.sort((a, b) => b.quality - a.quality || a.index - b.index);
  const chosen: SelectedFrame[] = [];
  for (const s of scored) {
    if (chosen.length >= p.maxBestFrames) break;
    if (chosen.some((c) => Math.abs(c.capturedMs - s.capturedMs) < p.minBestGapMs)) continue;
    chosen.push(s);
  }
  return chosen.sort((a, b) => a.capturedMs - b.capturedMs);
}

/** Datos de cada captura de la sesión necesarios para las reglas entre capturas. */
export interface SessionCapture {
  id: string;
  sequence: number;
  readAtMs: number | null;
  eid: string | null;
  clientTrackId: number | null;
  decision: ChuteDecision;
}

/**
 * Reglas entre capturas de la misma sesión (solo pueden BAJAR una confirmación, nunca subirla):
 *  - lecturas tan cercanas que sus ventanas se pisan: no se sabe a qué animal va cada una;
 *  - el celular siguió al MISMO bovino en dos capturas con caravanas distintas;
 *  - la misma caravana confirmada dos veces: vale la primera.
 */
export function applySessionRules(
  captures: SessionCapture[],
  params: Partial<ChuteParams> = {},
): Map<string, ChuteDecision> {
  const p = { ...DEFAULT_CHUTE_PARAMS, ...params };
  const out = new Map(captures.map((c) => [c.id, c.decision]));
  const downgrade = (id: string, status: ChuteStatus, reason: ChuteReason) => {
    const d = out.get(id)!;
    if (
      d.status === 'CONFIRMED' ||
      (d.status === 'INSUFFICIENT_EVIDENCE' && status === 'AMBIGUOUS')
    )
      out.set(id, { ...d, status, reason, bestFrames: [] });
  };
  const ordered = [...captures].sort((a, b) => a.sequence - b.sequence);
  const span = p.windowBeforeMs + p.windowAfterMs;
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      const [a, b] = [ordered[i]!, ordered[j]!];
      if (a.readAtMs !== null && b.readAtMs !== null && Math.abs(a.readAtMs - b.readAtMs) < span) {
        downgrade(a.id, 'AMBIGUOUS', 'OVERLAPPING_CAPTURES');
        downgrade(b.id, 'AMBIGUOUS', 'OVERLAPPING_CAPTURES');
      }
      if (a.clientTrackId !== null && a.clientTrackId === b.clientTrackId && a.eid !== b.eid) {
        downgrade(a.id, 'AMBIGUOUS', 'SAME_ANIMAL_MULTIPLE_RFID');
        downgrade(b.id, 'AMBIGUOUS', 'SAME_ANIMAL_MULTIPLE_RFID');
      }
    }
  }
  const seen = new Set<string>();
  for (const c of ordered) {
    const d = out.get(c.id)!;
    if (d.status !== 'CONFIRMED' || !d.eid) continue;
    if (seen.has(d.eid)) downgrade(c.id, 'AMBIGUOUS', 'RFID_ALREADY_REGISTERED');
    else seen.add(d.eid);
  }
  return out;
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
