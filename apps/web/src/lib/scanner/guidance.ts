/**
 * Instrucciones concretas al productor mientras escanea. Mismos códigos y textos que la API
 * (apps/api/src/modules/scans/domain/scan.types.ts → GUIDANCE), que además las vuelve a calcular
 * sobre los cuadros con el conteo oficial.
 */
import type { ScanMode } from './store';

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
} as const;
export type GuidanceCode = keyof typeof GUIDANCE;

/** Lo medido en los últimos ~2 s de escaneo. */
export interface LiveWindow {
  /** Ancho del cuadro (px) y desplazamientos de cámara medidos (px por detección). */
  frameWidth: number;
  frameHeight: number;
  shifts: number[];
  /** Detecciones por segundo en la ventana (para pasar el desplazamiento a px/s). */
  detectionsPerSecond: number;
  brightness: number | null;
  /** Altos de las cajas de animales (px) en la ventana. */
  boxHeights: number[];
  overlapped: number;
  strongBoxes: number;
  /** Cajas que tocan el borde izquierdo/derecho del cuadro en la ventana. */
  edgeBoxes: number;
  /** Giro medido por giroscopio/brújula (°/s), si hay. */
  turnRate: number;
  gpsDisplacementM: number;
  elapsedS: number;
}

export const MIN_DURATION_S: Record<Exclude<ScanMode, 'PHOTO'>, number> = {
  FIXED: 3,
  SWEEP: 5,
  PEN: 5,
};

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[s.length >> 1]! : 0;
};

/** Instrucciones vigentes, de la más importante a la menos. */
export function liveGuidance(mode: Exclude<ScanMode, 'PHOTO'>, w: LiveWindow): GuidanceCode[] {
  const out: GuidanceCode[] = [];
  const speed =
    w.shifts.length > 0
      ? (w.shifts.reduce((a, b) => a + Math.abs(b), 0) / w.shifts.length) * w.detectionsPerSecond
      : 0;
  if (mode === 'FIXED') {
    if (speed > 0.15 * w.frameWidth || w.turnRate > 20) out.push('HOLD_STILL');
  } else {
    // Más de ~60 % del ancho del cuadro por segundo: el detector pierde animales.
    if (speed > 0.6 * w.frameWidth || w.turnRate > 45) out.push('MOVE_SLOWER');
    if (mode === 'SWEEP' && w.gpsDisplacementM > 15) out.push('STAY_IN_PLACE');
  }
  if (w.brightness !== null && w.brightness < 40) out.push('MORE_LIGHT');
  if (w.brightness !== null && w.brightness > 220) out.push('AVOID_GLARE');
  if (w.boxHeights.length >= 2 && median(w.boxHeights) < 0.08 * w.frameHeight)
    out.push('GET_CLOSER');
  if (w.strongBoxes >= 4 && w.overlapped / w.strongBoxes > 0.35) out.push('TOO_MANY_HIDDEN');
  // Animales en el borde mientras la cámara está quieta: el grupo sigue fuera de cuadro. Mientras
  // se recorre el grupo es normal que haya animales entrando por el borde.
  if (mode === 'PEN' && w.edgeBoxes > 0 && w.elapsedS > 3 && speed < 0.1 * w.frameWidth)
    out.push('COVER_MORE');
  return out;
}
