/**
 * Escáner de Bovinos: tipos y reglas de calidad de la evidencia.
 *
 * Modos (cada uno mide algo distinto; no son intercambiables):
 *  - FIXED (escáner fijo / paso): cámara quieta en un punto de paso (manga, tranquera, puerta
 *    de corral). Cuenta los animales que cruzan la línea; comparable con lo declarado si todo el
 *    rodeo pasa por ese punto.
 *  - SWEEP (escáner móvil / barrido): operador quieto que gira la cámara sobre el rodeo; conteo
 *    neto por la línea central. COTA INFERIOR.
 *  - PEN (escáner de corral): animales QUIETOS (corral, aguada, agrupamiento). La cámara apunta
 *    al grupo y puede recorrerlo; cuenta animales únicos uniendo vistas de forma conservadora.
 *    COTA INFERIOR (no ve los animales tapados).
 *  - PHOTO (analizar foto): una o varias fotos del mismo grupo; animales únicos, solo se suman
 *    zonas de fotos que se solapan. COTA INFERIOR.
 *  - CHUTE (Manga + RFID): escaneo INDIVIDUAL. Un bovino quieto en la manga y la lectura de su
 *    caravana electrónica: se asocia RFID ↔ bovino observado (ver chute-matching.ts). La
 *    identidad la da el RFID; YOLOX solo detecta y ByteTrack solo sigue. Sin reconocimiento
 *    visual. El conteo es de caravanas distintas confirmadas (comparable si pasa todo el rodeo).
 *
 * El conteo del celular es preliminar; el oficial es el recalculado por el servidor.
 */

export const SCAN_MODES = ['FIXED', 'SWEEP', 'PEN', 'PHOTO', 'CHUTE'] as const;
export type ScanMode = (typeof SCAN_MODES)[number];

/** Modos que cuentan animales quietos (únicos) en lugar de cruces de una línea. */
export const STILL_MODES: readonly ScanMode[] = ['PEN', 'PHOTO'];

export const SCAN_MODE_LABELS: Record<ScanMode, string> = {
  FIXED: 'Escáner fijo (paso)',
  SWEEP: 'Escáner móvil (barrido)',
  PEN: 'Escáner de corral',
  PHOTO: 'Análisis de fotos',
  CHUTE: 'Manga + RFID (individual)',
};
/**
 * ¿El conteo es cota inferior? Solo el paso completo (FIXED) y la manga con lecturas RFID reales
 * son comparables con lo declarado. Manga con lecturas SIMULADAS (o sin dato): cota inferior.
 */
export function isLowerBound(mode: ScanMode, rfidSimulated?: boolean | null): boolean {
  if (mode === 'FIXED') return false;
  if (mode === 'CHUTE') return rfidSimulated !== false;
  return true;
}

export const SCAN_STATUSES = ['UPLOADING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export const SCAN_FRAME_KINDS = ['SAMPLE', 'KEY'] as const;
export type ScanFrameKind = (typeof SCAN_FRAME_KINDS)[number];

export type ScanQuality = 'COMPLETE' | 'LIMITED' | 'INSUFFICIENT';

/**
 * Estado de la evidencia para el productor y el banco. Una evidencia parcial nunca se convierte
 * sola en un rechazo: queda NO CONCLUYENTE (cuenta como cota inferior) o INSUFICIENTE (no se usa).
 */
export type EvidenceStatus = 'VALIDATED' | 'INCONCLUSIVE' | 'INSUFFICIENT';
export const EVIDENCE_STATUS_BY_QUALITY: Record<ScanQuality, EvidenceStatus> = {
  COMPLETE: 'VALIDATED',
  LIMITED: 'INCONCLUSIVE',
  INSUFFICIENT: 'INSUFFICIENT',
};
export const EVIDENCE_STATUS_LABELS: Record<EvidenceStatus, string> = {
  VALIDATED: 'VALIDADO',
  INCONCLUSIVE: 'NO CONCLUYENTE',
  INSUFFICIENT: 'EVIDENCIA INSUFICIENTE',
};

/** Instrucciones concretas al productor (mismos códigos que muestra el celular en vivo). */
export const GUIDANCE = {
  MOVE_SLOWER: 'Mové más lento',
  HOLD_STILL: 'Mantené el celular quieto (apoyalo en algo firme)',
  GET_CLOSER: 'Acercate: los animales se ven muy chicos',
  TOO_MANY_HIDDEN: 'Hay demasiados animales ocultos: buscá un lugar más alto o más de costado',
  COVER_MORE: 'Falta cubrir otra zona: hay animales en el borde de lo que filmaste',
  MORE_LIGHT: 'Buscá más luz (poca iluminación)',
  AVOID_GLARE: 'Evitá el contraluz o el sol directo en la cámara',
  SCAN_LONGER: 'Escaneá más tiempo',
  STAY_IN_PLACE: 'Quedate en un punto mientras girás',
  USE_PEN_MODE: 'Los animales están quietos: usá el escáner de corral',
  OVERLAP_PHOTOS: 'Tomá las fotos seguidas, con una parte en común entre una y otra',
  POINT_AT_HERD: 'No se vio ningún bovino: apuntá al rodeo',
  ONE_ANIMAL_AT_A_TIME: 'Dejá un solo bovino en la zona de captura y leé su caravana',
} as const;
export type GuidanceCode = keyof typeof GUIDANCE;

export interface ScanLine {
  orientation: 'vertical' | 'horizontal';
  position: number;
}

/** Límites de una sesión (se validan al crear la sesión y al subir cuadros). */
export const SCAN_LIMITS = {
  maxFrames: 1200,
  maxPhotos: 12,
  /** Manga + RFID: animales por sesión y cuadros de la ventana de cada animal. */
  maxChuteCaptures: 300,
  maxFramesPerCapture: 24,
  maxChuteFrames: 7200,
  maxChuteReadsPerCapture: 8,
  /** Una sesión de manga dura lo que tarda en pasar el rodeo (no el límite de un escaneo). */
  maxChuteDurationS: 4 * 3600,
  maxKeyFrames: 12,
  maxFrameBytes: 1_500_000,
  maxDurationS: 300,
  minSampledFps: 2,
  maxSampledFps: 15,
} as const;

/** Magnitudes medidas por el servidor sobre los cuadros (proporciones 0-1). */
export interface ScanQualityMetrics {
  frames: number;
  blurryRatio: number;
  underexposedRatio: number;
  overexposedRatio: number;
  fastMotionRatio: number;
  occlusionRatio: number;
  smallAnimalRatio: number;
  coverageViews: number | null;
  edgeAnimals: number | null;
  registeredPhotos: number | null;
}

export interface PenResult {
  observed: number;
  uniqueGroups: number;
  tracksCounted: number;
  mergedTracks: number;
  maxSimultaneous: number;
  coverageViews: number;
  revisitRatio: number;
  occlusionRatio: number;
  smallAnimalRatio: number;
  edgeAnimals: number;
  method: string;
}

/** Resultado oficial del servidor (forma persistida en scan_sessions.server_result). */
export interface OfficialScanResult {
  /** Conteo oficial del modo: neto por línea (FIXED/SWEEP) o animales únicos (PEN/PHOTO). */
  observed: number;
  method: string;
  pen: PenResult | null;
  metrics: ScanQualityMetrics | null;
  guidance: { code: GuidanceCode; message: string }[];
  netCount: number;
  positiveCrossings: number;
  negativeCrossings: number;
  maxSimultaneous: number;
  confirmedTracks: number;
  confidence: number;
  framesProcessed: number;
  blurryFrames: number;
  cameraPanPx: number | null;
  warnings: string[];
  limitations: string[];
  model: { code: string; version: string; simulated: boolean };
  tracker: string;
  processingMs: number;
}

export interface QualityInput {
  mode: ScanMode;
  durationS: number;
  frames: number;
  sampledFps: number;
  official: Pick<
    OfficialScanResult,
    'netCount' | 'confirmedTracks' | 'blurryFrames' | 'negativeCrossings' | 'positiveCrossings'
  > & { observed?: number };
  /** Métricas del servidor (ausentes en escaneos procesados antes de que existieran). */
  metrics?: ScanQualityMetrics | null;
  maxDisplacementM: number | null;
  sweptDegrees: number | null;
  /** Umbrales del tipo de producción (ver assets/domain/livestock-profile.ts). */
  thresholds?: Partial<QualityThresholds>;
}

export interface QualityThresholds {
  /** Proporción de detecciones superpuestas a partir de la cual hay "demasiados ocultos". */
  occlusionLimit: number;
  /** Duración mínima de un escaneo con video, por modo (s). */
  minDurationS: Record<Exclude<ScanMode, 'PHOTO' | 'CHUTE'>, number>;
}

export const DEFAULT_THRESHOLDS: QualityThresholds = {
  occlusionLimit: 0.35,
  minDurationS: { FIXED: 3, SWEEP: 5, PEN: 5 },
};

export interface QualityAssessment {
  quality: ScanQuality;
  evidenceStatus: EvidenceStatus;
  reasons: string[];
  guidance: { code: GuidanceCode; message: string }[];
}

const pct = (ratio: number) => `${Math.round(ratio * 100)} %`;

/**
 * Calificación de la evidencia del escaneo, solo con magnitudes medidas:
 *  - INSUFICIENTE: no se puede usar (muy corta, sin animales, mayoría de cuadros inutilizables).
 *  - LIMITADA → NO CONCLUYENTE: se usa como cota inferior, con las razones a la vista.
 *  - COMPLETA → VALIDADA.
 * Cada problema trae una instrucción concreta para el productor.
 */
export function assessScanQuality(input: QualityInput): QualityAssessment {
  const t = { ...DEFAULT_THRESHOLDS, ...input.thresholds };
  const insufficient: string[] = [];
  const limited: string[] = [];
  const guidance = new Set<GuidanceCode>();
  const m = input.metrics ?? null;
  const still = STILL_MODES.includes(input.mode);
  const observed = input.official.observed ?? input.official.netCount;

  if (input.mode === 'PHOTO') {
    if (input.frames < 1) insufficient.push('No hay fotos');
  } else if (input.mode !== 'CHUTE') {
    const minDuration = t.minDurationS[input.mode];
    if (input.frames < 10 || input.durationS < minDuration) {
      insufficient.push(`Escaneo demasiado corto (mínimo ${minDuration} s)`);
      guidance.add('SCAN_LONGER');
    }
  }
  if (still ? observed === 0 : input.official.confirmedTracks === 0) {
    insufficient.push(still ? 'No se observó ningún bovino' : 'No se siguió ningún bovino');
    guidance.add('POINT_AT_HERD');
  }

  const blurry = m?.blurryRatio ?? (input.frames ? input.official.blurryFrames / input.frames : 0);
  if (blurry > 0.6) {
    insufficient.push(`${pct(blurry)} de los cuadros están desenfocados`);
  } else if (blurry > 0.3) {
    limited.push('Más del 30 % de los cuadros están desenfocados');
  }
  if (blurry > 0.3) guidance.add(input.mode === 'FIXED' ? 'HOLD_STILL' : 'MOVE_SLOWER');

  if (m) {
    for (const [ratio, label, code] of [
      [m.underexposedRatio, 'con poca luz', 'MORE_LIGHT'],
      [m.overexposedRatio, 'sobreexpuestos (contraluz)', 'AVOID_GLARE'],
    ] as const) {
      if (ratio > 0.6) insufficient.push(`${pct(ratio)} de los cuadros ${label}`);
      else if (ratio > 0.3) limited.push(`${pct(ratio)} de los cuadros ${label}`);
      if (ratio > 0.3) guidance.add(code);
    }
    if (m.fastMotionRatio > 0.1) {
      if (input.mode === 'FIXED') {
        limited.push(`La cámara se movió en ${pct(m.fastMotionRatio)} de los cuadros`);
        guidance.add('HOLD_STILL');
      } else {
        limited.push(`Movimiento demasiado rápido en ${pct(m.fastMotionRatio)} de los cuadros`);
        guidance.add('MOVE_SLOWER');
      }
    }
    if (m.smallAnimalRatio > 0.5) {
      limited.push(`${pct(m.smallAnimalRatio)} de los animales se ven muy chicos`);
      guidance.add('GET_CLOSER');
    }
    if (m.occlusionRatio > t.occlusionLimit) {
      limited.push(
        `${pct(m.occlusionRatio)} de las detecciones se superponen: puede haber animales ocultos`,
      );
      guidance.add('TOO_MANY_HIDDEN');
    }
    if (still && (m.edgeAnimals ?? 0) > 0) {
      limited.push(`${m.edgeAnimals} animales en el borde de lo cubierto: el grupo puede seguir`);
      guidance.add('COVER_MORE');
    }
    if (
      input.mode === 'PHOTO' &&
      input.frames > 1 &&
      (m.registeredPhotos ?? input.frames) < input.frames
    ) {
      limited.push('Hay fotos que no se solapan con otras: no se suman (se toma el máximo)');
      guidance.add('OVERLAP_PHOTOS');
    }
  }

  if (input.mode !== 'PHOTO') {
    const effectiveFps = input.durationS > 0 ? input.frames / input.durationS : 0;
    if (effectiveFps < 3) {
      limited.push(
        `Tasa efectiva de cuadros baja (${effectiveFps.toFixed(1)}/s): puede perder animales`,
      );
    }
  }
  if (input.mode === 'SWEEP') {
    if (input.maxDisplacementM !== null && input.maxDisplacementM > 15) {
      limited.push(
        `El operador se desplazó ${Math.round(input.maxDisplacementM)} m durante el barrido`,
      );
      guidance.add('STAY_IN_PLACE');
    }
    if (input.sweptDegrees !== null && input.sweptDegrees < 20) {
      limited.push(`Arco barrido corto (${Math.round(input.sweptDegrees)}°)`);
      guidance.add('COVER_MORE');
    }
    if (input.official.negativeCrossings > 0 && input.official.positiveCrossings > 0) {
      limited.push('Se volvió sobre zonas ya escaneadas (descontado en el conteo neto)');
    }
  }
  if (input.mode === 'FIXED') {
    // Animales quietos frente a la línea: el temblor de las cajas genera cruces de ida y vuelta.
    const { positiveCrossings: pos, negativeCrossings: neg } = input.official;
    if (pos > 0 && neg > 0 && Math.min(pos, neg) / Math.max(pos, neg) >= 0.3) {
      limited.push(
        `Cruces en ambos sentidos (+${pos} / −${neg}): animales quietos o que van y vuelven`,
      );
      guidance.add('USE_PEN_MODE');
    }
  }

  const quality: ScanQuality = insufficient.length
    ? 'INSUFFICIENT'
    : limited.length
      ? 'LIMITED'
      : 'COMPLETE';
  return {
    quality,
    evidenceStatus: EVIDENCE_STATUS_BY_QUALITY[quality],
    reasons: [...insufficient, ...limited],
    guidance: [...guidance].map((code) => ({ code, message: GUIDANCE[code] })),
  };
}

/**
 * Calidad de una sesión de Manga + RFID según cómo se resolvieron sus capturas: sin ninguna
 * confirmada no hay evidencia; muchas dudosas la dejan NO CONCLUYENTE.
 */
export function assessChuteQuality(counts: {
  confirmed: number;
  ambiguous: number;
  insufficient: number;
}): QualityAssessment {
  const total = counts.confirmed + counts.ambiguous + counts.insufficient;
  const reasons: string[] = [];
  const guidance = new Set<GuidanceCode>();
  let quality: ScanQuality = 'COMPLETE';
  if (counts.confirmed === 0) {
    quality = 'INSUFFICIENT';
    reasons.push('Ningún bovino quedó asociado a su caravana');
    guidance.add('POINT_AT_HERD');
  } else if (total > 0 && (counts.ambiguous + counts.insufficient) / total > 0.2) {
    quality = 'LIMITED';
    reasons.push(
      `${counts.ambiguous + counts.insufficient} de ${total} lecturas no se pudieron asociar a un único bovino`,
    );
  }
  if (counts.ambiguous > 0) guidance.add('ONE_ANIMAL_AT_A_TIME');
  if (counts.insufficient > 0) guidance.add('HOLD_STILL');
  return {
    quality,
    evidenceStatus: EVIDENCE_STATUS_BY_QUALITY[quality],
    reasons,
    guidance: [...guidance].map((code) => ({ code, message: GUIDANCE[code] })),
  };
}
