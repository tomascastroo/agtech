/**
 * Escáner de Bovinos: tipos y reglas de calidad del escaneo.
 *
 * Modos:
 *  - FIXED (escáner fijo): cámara quieta en un punto de paso (manga, tranquera, puerta de
 *    corral). Cuenta los animales que cruzan la línea; comparable con lo declarado si todo el
 *    rodeo pasa por ese punto.
 *  - SWEEP (escáner móvil): operador quieto que gira la cámara sobre el rodeo; conteo neto por
 *    la línea central. Es una COTA INFERIOR del stock.
 *
 * El conteo del celular es preliminar; el oficial es el recalculado por el servidor.
 */

export const SCAN_MODES = ['FIXED', 'SWEEP'] as const;
export type ScanMode = (typeof SCAN_MODES)[number];

export const SCAN_STATUSES = ['UPLOADING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export const SCAN_FRAME_KINDS = ['SAMPLE', 'KEY'] as const;
export type ScanFrameKind = (typeof SCAN_FRAME_KINDS)[number];

export type ScanQuality = 'COMPLETE' | 'LIMITED' | 'INSUFFICIENT';

export interface ScanLine {
  orientation: 'vertical' | 'horizontal';
  position: number;
}

/** Límites de una sesión (se validan al crear la sesión y al subir cuadros). */
export const SCAN_LIMITS = {
  maxFrames: 1200,
  maxKeyFrames: 12,
  maxFrameBytes: 1_500_000,
  maxDurationS: 300,
  minSampledFps: 2,
  maxSampledFps: 15,
} as const;

/** Resultado oficial del servidor (forma persistida en scan_sessions.server_result). */
export interface OfficialScanResult {
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
  >;
  maxDisplacementM: number | null;
  sweptDegrees: number | null;
}

/** Calificación del escaneo, solo con magnitudes medidas. */
export function assessScanQuality(input: QualityInput): {
  quality: ScanQuality;
  reasons: string[];
} {
  const insufficient: string[] = [];
  const limited: string[] = [];
  if (input.frames < 10 || input.durationS < 3) insufficient.push('Escaneo demasiado corto');
  if (input.official.confirmedTracks === 0) insufficient.push('No se siguió ningún bovino');
  if (input.frames > 0 && input.official.blurryFrames / input.frames > 0.3) {
    limited.push('Más del 30 % de los cuadros están desenfocados');
  }
  const effectiveFps = input.durationS > 0 ? input.frames / input.durationS : 0;
  if (effectiveFps < 3) {
    limited.push(
      `Tasa efectiva de cuadros baja (${effectiveFps.toFixed(1)}/s): puede perder animales`,
    );
  }
  if (input.mode === 'SWEEP') {
    if (input.maxDisplacementM !== null && input.maxDisplacementM > 15) {
      limited.push(
        `El operador se desplazó ${Math.round(input.maxDisplacementM)} m durante el barrido`,
      );
    }
    if (input.sweptDegrees !== null && input.sweptDegrees < 20) {
      limited.push(`Arco barrido corto (${Math.round(input.sweptDegrees)}°)`);
    }
    if (input.official.negativeCrossings > 0 && input.official.positiveCrossings > 0) {
      limited.push('Se volvió sobre zonas ya escaneadas (descontado en el conteo neto)');
    }
  }
  if (insufficient.length)
    return { quality: 'INSUFFICIENT', reasons: [...insufficient, ...limited] };
  if (limited.length) return { quality: 'LIMITED', reasons: limited };
  return { quality: 'COMPLETE', reasons: [] };
}
