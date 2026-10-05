import type {
  CaptureOrigin,
  CountBasis,
  EvidenceMethod,
  EvidenceQualityLevel,
} from './collateral.types.js';

/**
 * Calidad de una observación física. Determinista: parte del techo del método y baja un nivel
 * por cada debilidad (archivo cargado, sin GPS, evidencia no concluyente, confianza baja). Cada
 * baja queda explicada.
 */
export interface EvidenceQualityInput {
  method: EvidenceMethod;
  basis: CountBasis;
  captureOrigin: CaptureOrigin;
  /** Estado de la evidencia del escáner/verificación (VALIDATED / INCONCLUSIVE / INSUFFICIENT). */
  evidenceStatus?: 'VALIDATED' | 'INCONCLUSIVE' | 'INSUFFICIENT' | null;
  hasCaptureLocation: boolean;
  /** Confianza de detección 0..1 (visión); null si no aplica (inspección, RFID). */
  confidence?: number | null;
  /** La observación usó lecturas o cámaras simuladas. */
  simulated?: boolean;
}

export interface EvidenceQuality {
  level: EvidenceQualityLevel;
  reasons: string[];
}

const ORDER: EvidenceQualityLevel[] = ['INSUFICIENTE', 'BAJA', 'MEDIA', 'ALTA'];

/** Techo de cada método: una foto nunca es un censo; la manga con RFID sí. */
export const METHOD_CEILING: Record<EvidenceMethod, EvidenceQualityLevel> = {
  MANGA_RFID: 'ALTA',
  ESCANER_FIJO: 'ALTA',
  INSPECCION: 'ALTA',
  VIDEO: 'MEDIA',
  FOTO: 'BAJA',
  DOCUMENTO: 'BAJA',
};

const down = (level: EvidenceQualityLevel, steps = 1): EvidenceQualityLevel =>
  ORDER[Math.max(0, ORDER.indexOf(level) - steps)]!;

const min = (a: EvidenceQualityLevel, b: EvidenceQualityLevel): EvidenceQualityLevel =>
  ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b;

export function assessEvidenceQuality(input: EvidenceQualityInput): EvidenceQuality {
  const reasons: string[] = [];
  let level = METHOD_CEILING[input.method];
  reasons.push(`Método ${input.method}: calidad máxima ${level}.`);

  if (input.evidenceStatus === 'INSUFFICIENT') {
    return {
      level: 'INSUFICIENTE',
      reasons: [...reasons, 'La evidencia quedó marcada como insuficiente al procesarla.'],
    };
  }
  if (input.simulated) {
    // Lecturas simuladas nunca cuentan como evidencia de calidad.
    return {
      level: 'INSUFICIENTE',
      reasons: [...reasons, 'Usa lecturas o cámaras SIMULADAS: no es evidencia del rodeo real.'],
    };
  }
  if (input.captureOrigin === 'ARCHIVO_CARGADO') {
    level = min(level, 'BAJA');
    reasons.push(
      'Archivo cargado (no capturado en campo desde la app): no se puede asegurar cuándo ni dónde se tomó.',
    );
  }
  if (!input.hasCaptureLocation && input.method !== 'INSPECCION') {
    level = down(level);
    reasons.push('Sin ubicación GPS de captura.');
  }
  if (input.evidenceStatus === 'INCONCLUSIVE') {
    level = down(level);
    reasons.push('Evidencia no concluyente (cobertura o nitidez limitadas).');
  }
  if (typeof input.confidence === 'number' && input.confidence < 0.5) {
    level = down(level);
    reasons.push(`Confianza de detección baja (${Math.round(input.confidence * 100)} %).`);
  }
  if (input.basis === 'COTA_INFERIOR') {
    reasons.push('Muestra una parte del rodeo (cota inferior), no un conteo completo.');
  }
  if (level === 'INSUFICIENTE') reasons.push('Calidad insuficiente para verificar.');
  return { level, reasons };
}

/** Valor 0..100 de cada nivel (componente "calidad" del score). */
export const QUALITY_POINTS: Record<EvidenceQualityLevel, number> = {
  ALTA: 100,
  MEDIA: 75,
  BAJA: 45,
  INSUFICIENTE: 10,
};
