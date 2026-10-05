import type { CollateralState, EvidenceQualityLevel, ProductionType } from './collateral.types.js';
import { QUALITY_POINTS } from './evidence-quality.js';
import type { EngineSettings } from './policy.js';
import { EXPECTS_RFID } from './policy.js';
import type { ReconciliationResult } from './reconciliation.js';

/**
 * Collateral Effectiveness Score: determinista y explicable, SIN machine learning.
 *   1. Diez componentes 0..100, cada uno con su explicación (o null: "sin datos").
 *   2. Promedio ponderado de los componentes con datos.
 *   3. Eslabón más débil: el score no puede superar al peor componente crítico + un margen.
 *   4. Compuertas: condiciones que fijan el estado sin importar el score (sin existencia →
 *      NO_DETERMINABLE, inconsistencia legal → REQUIERE_REVISION, evidencia vieja →
 *      REQUIERE_EVIDENCIA, diferencia no explicada → REQUIERE_INSPECCION, ...).
 */
export const SCORE_COMPONENTS = [
  'existencia',
  'cantidad',
  'identidad',
  'documentacion',
  'ubicacion',
  'recencia',
  'calidad',
  'movimientos',
  'consistencia',
  'historial',
] as const;
export type ScoreComponentCode = (typeof SCORE_COMPONENTS)[number];

export const COMPONENT_LABELS: Record<ScoreComponentCode, string> = {
  existencia: 'Existencia',
  cantidad: 'Cantidad',
  identidad: 'Identidad',
  documentacion: 'Documentación',
  ubicacion: 'Ubicación',
  recencia: 'Recencia',
  calidad: 'Calidad de evidencia',
  movimientos: 'Movimientos',
  consistencia: 'Consistencia',
  historial: 'Historial',
};

/** Componentes que pueden limitar el score (eslabón más débil). */
export const CRITICAL_COMPONENTS: ScoreComponentCode[] = [
  'existencia',
  'cantidad',
  'consistencia',
  'recencia',
];

export const DEFAULT_WEIGHTS: Record<ScoreComponentCode, number> = {
  existencia: 0.15,
  cantidad: 0.15,
  identidad: 0.08,
  documentacion: 0.12,
  ubicacion: 0.08,
  recencia: 0.1,
  calidad: 0.1,
  movimientos: 0.07,
  consistencia: 0.1,
  historial: 0.05,
};

/** En cría la identidad individual (RFID en manga) pesa más. */
export function weightsFor(production: ProductionType): Record<ScoreComponentCode, number> {
  if (!EXPECTS_RFID[production]) return DEFAULT_WEIGHTS;
  return { ...DEFAULT_WEIGHTS, identidad: 0.13, documentacion: 0.1, historial: 0.02 };
}

export interface ScoreComponent {
  code: ScoreComponentCode;
  label: string;
  /** 0..100; null = sin datos para evaluarlo (no suma ni resta). */
  value: number | null;
  weight: number;
  explanation: string;
}

export type GateCode =
  | 'SIN_EXISTENCIA'
  | 'EVIDENCIA_INSUFICIENTE'
  | 'INCONSISTENCIA_DOCUMENTAL'
  | 'UBICACION_FUERA_DE_ZONA'
  | 'IDENTIDAD_INCONSISTENTE'
  | 'DIFERENCIA_MENOR'
  | 'POSIBLE_DOBLE_GARANTIA'
  | 'EVIDENCIA_VENCIDA'
  | 'DIFERENCIA_NO_EXPLICADA'
  | 'NO_DETERMINABLE_REITERADO'
  | 'INSPECCION_NO_CONFORME';

export interface Gate {
  code: GateCode;
  state: Extract<
    CollateralState,
    'NO_DETERMINABLE' | 'REQUIERE_REVISION' | 'REQUIERE_EVIDENCIA' | 'REQUIERE_INSPECCION'
  >;
  explanation: string;
}

export interface DocumentSignal {
  type: string;
  label: string;
  /** Resultado del cruce OCR vs declarado. */
  analysis: 'CONSISTENTE' | 'INCONSISTENTE' | 'REVISION' | 'PENDIENTE' | 'SIN_ANALISIS';
  expired: boolean;
}

export interface ScoreInput {
  production: ProductionType;
  reconciliation: ReconciliationResult;
  quality: EvidenceQualityLevel | null;
  /** Días desde la última evidencia física; null si nunca hubo. */
  evidenceAgeDays: number | null;
  maxEvidenceAgeDays: number;
  /** La ubicación de captura cae dentro del establecimiento (null si no se pudo comparar). */
  locationVerified: boolean | null;
  documents: DocumentSignal[];
  /** Documentos que el producto de crédito exige para la garantía. */
  requiredDocuments: string[];
  /** Estados de los últimos snapshots (más reciente primero). */
  previousStates: CollateralState[];
  previousScore: number | null;
  /** Alertas abiertas o creadas en los últimos 90 días. */
  recentAlerts: number;
  possibleDoubleGuarantee: boolean;
  /** Resultado de la última inspección presencial (si es la observación vigente). */
  lastInspection: { result: string; isCurrentObservation: boolean } | null;
  /**
   * Verificaciones seguidas (las más recientes) que no permitieron determinar el rodeo. Cuenta
   * verificaciones con evidencia, no recálculos: un recálculo sin evidencia nueva no escala.
   */
  consecutiveNotDeterminable: number;
}

export interface ScoreResult {
  components: ScoreComponent[];
  weightedScore: number | null;
  weakestLink: { code: ScoreComponentCode; value: number; cap: number } | null;
  finalScore: number | null;
  gates: Gate[];
  explanation: string[];
}

const pct = (value: number) => Math.round(Math.max(0, Math.min(100, value)));

function component(
  code: ScoreComponentCode,
  weights: Record<ScoreComponentCode, number>,
  value: number | null,
  explanation: string,
): ScoreComponent {
  return {
    code,
    label: COMPONENT_LABELS[code],
    value: value === null ? null : pct(value),
    weight: weights[code],
    explanation,
  };
}

export function computeScore(input: ScoreInput, settings: EngineSettings): ScoreResult {
  const w = weightsFor(input.production);
  const r = input.reconciliation;
  const components: ScoreComponent[] = [];

  // 1. Existencia: hay evidencia física de animales en el establecimiento.
  const verifiable = r.verifiable ?? 0;
  if (r.observed === null && !r.rfid) {
    components.push(
      component('existencia', w, null, 'Sin evidencia física: no se puede afirmar la existencia.'),
    );
  } else if (verifiable <= 0) {
    components.push(component('existencia', w, 0, 'La evidencia no muestra animales.'));
  } else {
    const q = input.quality ? QUALITY_POINTS[input.quality] : 50;
    components.push(
      component(
        'existencia',
        w,
        Math.max(40, q),
        `Se observaron animales (${verifiable.toLocaleString('es-AR')} verificables) con evidencia de calidad ${input.quality ?? 'sin evaluar'}.`,
      ),
    );
  }

  // 2. Cantidad: observado vs esperado.
  if (r.observed === null) {
    components.push(component('cantidad', w, null, 'Sin conteo observado.'));
  } else if (r.observedBasis === 'CENSO') {
    const diff = Math.abs(r.unexplainedDifference ?? 0);
    const value = r.expected > 0 ? 100 * (1 - diff / r.expected) : 0;
    components.push(
      component(
        'cantidad',
        w,
        diff > r.toleranceHeads ? Math.min(value, 50) : value,
        diff === 0
          ? 'El conteo completo coincide con lo esperado.'
          : `Diferencia no explicada de ${diff.toLocaleString('es-AR')} cabezas sobre ${r.expected.toLocaleString('es-AR')} esperadas.`,
      ),
    );
  } else {
    const ratio = r.expected > 0 ? Math.min(1, (r.observed ?? 0) / r.expected) : 0;
    components.push(
      component(
        'cantidad',
        w,
        ratio * 80,
        `Conteo parcial (cota inferior): ${Math.round(ratio * 100)} % de lo esperado observado. Un conteo parcial no supera 80.`,
      ),
    );
  }

  // 3. Identidad: RFID individual asociado a un animal en cámara.
  const expectsRfid = EXPECTS_RFID[input.production];
  if (!r.rfid || r.rfid.identified === 0) {
    components.push(
      component(
        'identidad',
        w,
        expectsRfid ? 30 : 50,
        expectsRfid
          ? 'Sin identificación individual: en cría se espera RFID en los eventos de manga.'
          : 'Sin identificación individual (RFID). Identidad solo por establecimiento.',
      ),
    );
  } else {
    const ratio = r.expected > 0 ? Math.min(1, r.rfid.identified / r.expected) : 0;
    let value = 40 + 60 * ratio;
    const notes = [`${Math.round(ratio * 100)} % de lo esperado identificado por RFID.`];
    if (r.rfid.otherEstablishment > 0 || r.rfidExceedsExpected) {
      value = Math.min(value, 30);
      notes.push('Hay caravanas inconsistentes con el establecimiento o la cantidad esperada.');
    }
    if (r.rfid.ambiguous > 0) notes.push(`${r.rfid.ambiguous} pasos ambiguos descartados.`);
    components.push(component('identidad', w, value, notes.join(' ')));
  }

  // 4. Documentación.
  const byType = new Map(input.documents.map((d) => [d.type, d]));
  const required = input.requiredDocuments;
  let docPoints = 0;
  const missing: string[] = [];
  const inconsistent: string[] = [];
  for (const type of required) {
    const doc = byType.get(type);
    if (!doc || doc.expired) {
      missing.push(doc?.label ?? type);
      continue;
    }
    if (doc.analysis === 'INCONSISTENTE') {
      inconsistent.push(doc.label);
      continue;
    }
    docPoints += doc.analysis === 'CONSISTENTE' ? 1 : 0.6;
  }
  for (const doc of input.documents)
    if (doc.analysis === 'INCONSISTENTE' && !inconsistent.includes(doc.label))
      inconsistent.push(doc.label);
  components.push(
    component(
      'documentacion',
      w,
      required.length ? (docPoints / required.length) * 100 : null,
      [
        required.length
          ? `${required.length - missing.length - inconsistent.length} de ${required.length} documentos requeridos presentes y sin inconsistencias.`
          : 'Sin documentos requeridos definidos.',
        missing.length ? `Faltan o vencieron: ${missing.join(', ')}.` : '',
        inconsistent.length ? `Inconsistencia documental: ${inconsistent.join(', ')}.` : '',
      ]
        .filter(Boolean)
        .join(' '),
    ),
  );

  // 5. Ubicación.
  components.push(
    component(
      'ubicacion',
      w,
      input.locationVerified === null ? null : input.locationVerified ? 100 : 20,
      input.locationVerified === null
        ? 'Sin ubicación de captura comparable con el establecimiento.'
        : input.locationVerified
          ? 'La evidencia se capturó dentro del establecimiento declarado.'
          : 'La evidencia se capturó fuera del establecimiento declarado.',
    ),
  );

  // 6. Recencia.
  if (input.evidenceAgeDays === null) {
    components.push(component('recencia', w, null, 'Nunca hubo evidencia física.'));
  } else {
    const ratio = input.evidenceAgeDays / input.maxEvidenceAgeDays;
    const value = ratio <= 0.5 ? 100 : ratio <= 1 ? 100 - (ratio - 0.5) * 120 : 0;
    components.push(
      component(
        'recencia',
        w,
        value,
        `La última evidencia física tiene ${Math.floor(input.evidenceAgeDays)} días (máximo ${input.maxEvidenceAgeDays}).`,
      ),
    );
  }

  // 7. Calidad.
  components.push(
    component(
      'calidad',
      w,
      input.quality ? QUALITY_POINTS[input.quality] : null,
      input.quality
        ? `Calidad de la evidencia vigente: ${input.quality}.`
        : 'Sin evidencia evaluada.',
    ),
  );

  // 8. Movimientos: respaldo de las variaciones de stock.
  const moved = r.exits + r.entries;
  components.push(
    component(
      'movimientos',
      w,
      moved === 0 ? 100 : 100 - (r.declaredOnlyHeads / moved) * 60,
      moved === 0
        ? 'Sin movimientos registrados desde la declaración.'
        : r.declaredOnlyHeads > 0
          ? `${r.declaredOnlyHeads} de ${moved} cabezas movidas solo declaradas (sin DT-e).`
          : 'Todos los movimientos tienen respaldo documental u oficial.',
    ),
  );

  // 9. Consistencia.
  const consistencyValue: Record<string, number | null> = {
    SIN_OBSERVACION: null,
    CONSISTENTE: 100,
    DIFERENCIA_MENOR: 70,
    DIFERENCIA_NO_EXPLICADA: 20,
    EVIDENCIA_INSUFICIENTE: 50,
  };
  components.push(
    component(
      'consistencia',
      w,
      consistencyValue[r.status] ?? null,
      r.narrative.slice(-2).join(' '),
    ),
  );

  // 10. Historial.
  const negatives = input.previousStates
    .slice(0, 6)
    .filter(
      (s) => s === 'REQUIERE_INSPECCION' || s === 'NO_DETERMINABLE' || s === 'REQUIERE_REVISION',
    ).length;
  components.push(
    component(
      'historial',
      w,
      input.previousStates.length === 0 && input.recentAlerts === 0
        ? null
        : 100 - negatives * 15 - Math.min(30, input.recentAlerts * 5),
      input.previousStates.length === 0
        ? 'Sin historial de verificaciones.'
        : `${negatives} de las últimas ${Math.min(6, input.previousStates.length)} evaluaciones con problemas; ${input.recentAlerts} alertas en 90 días.`,
    ),
  );

  // Promedio ponderado de los componentes con datos.
  const withData = components.filter((c) => c.value !== null);
  const totalWeight = withData.reduce((a, c) => a + c.weight, 0);
  const weightedScore = totalWeight
    ? pct(withData.reduce((a, c) => a + c.value! * c.weight, 0) / totalWeight)
    : null;

  // Eslabón más débil.
  const critical = withData.filter((c) => CRITICAL_COMPONENTS.includes(c.code));
  const weakest = critical.length ? critical.reduce((a, b) => (b.value! < a.value! ? b : a)) : null;
  const weakestLink = weakest
    ? {
        code: weakest.code,
        value: weakest.value!,
        cap: pct(weakest.value! + settings.weakestLinkMargin),
      }
    : null;
  const finalScore =
    weightedScore === null
      ? null
      : weakestLink
        ? Math.min(weightedScore, weakestLink.cap)
        : weightedScore;

  const gates = computeGates(input, r, inconsistent);
  const explanation: string[] = [];
  if (finalScore === null) explanation.push('Score no determinable: sin datos suficientes.');
  else {
    explanation.push(`Promedio ponderado de componentes: ${weightedScore}.`);
    if (weakestLink && weightedScore !== null && weakestLink.cap < weightedScore)
      explanation.push(
        `Limitado por el eslabón más débil: ${COMPONENT_LABELS[weakestLink.code]} (${weakestLink.value}) + ${settings.weakestLinkMargin} = ${weakestLink.cap}.`,
      );
    explanation.push(`Score final: ${finalScore}/100.`);
  }
  for (const g of gates) explanation.push(`Compuerta ${g.code}: ${g.explanation}`);
  return { components, weightedScore, weakestLink, finalScore, gates, explanation };
}

function computeGates(
  input: ScoreInput,
  r: ReconciliationResult,
  inconsistentDocs: string[],
): Gate[] {
  const gates: Gate[] = [];
  const add = (code: GateCode, state: Gate['state'], explanation: string) =>
    gates.push({ code, state, explanation });

  if (r.observed === null && !r.rfid)
    add('SIN_EXISTENCIA', 'NO_DETERMINABLE', 'No hay evidencia física de existencia.');
  else if (input.quality === 'INSUFICIENTE' && !(r.rfid && r.rfid.identified > 0))
    add(
      'EVIDENCIA_INSUFICIENTE',
      'NO_DETERMINABLE',
      'La única evidencia disponible es de calidad insuficiente.',
    );
  else if (r.status === 'EVIDENCIA_INSUFICIENTE')
    add(
      'EVIDENCIA_INSUFICIENTE',
      'NO_DETERMINABLE',
      'La evidencia muestra solo una parte del rodeo: hace falta un conteo completo (manga, escáner fijo) o inspección.',
    );

  if (inconsistentDocs.length)
    add(
      'INCONSISTENCIA_DOCUMENTAL',
      'REQUIERE_REVISION',
      `Inconsistencia documental en: ${inconsistentDocs.join(', ')}.`,
    );
  if (input.locationVerified === false)
    add(
      'UBICACION_FUERA_DE_ZONA',
      'REQUIERE_REVISION',
      'La evidencia no se capturó en el establecimiento declarado.',
    );
  if (r.rfid && (r.rfid.otherEstablishment > 0 || r.rfidExceedsExpected))
    add(
      'IDENTIDAD_INCONSISTENTE',
      'REQUIERE_REVISION',
      'Caravanas RFID inconsistentes con el establecimiento o con la cantidad esperada.',
    );
  if (r.status === 'DIFERENCIA_MENOR')
    add(
      'DIFERENCIA_MENOR',
      'REQUIERE_REVISION',
      `Diferencia no explicada de ${Math.abs(r.unexplainedDifference ?? 0)} cabezas dentro de la tolerancia.`,
    );
  if (input.possibleDoubleGuarantee)
    add(
      'POSIBLE_DOBLE_GARANTIA',
      'REQUIERE_REVISION',
      'El mismo establecimiento o las mismas caravanas respaldan otra garantía activa.',
    );

  if (input.evidenceAgeDays !== null && input.evidenceAgeDays > input.maxEvidenceAgeDays)
    add(
      'EVIDENCIA_VENCIDA',
      'REQUIERE_EVIDENCIA',
      `La última evidencia física tiene ${Math.floor(input.evidenceAgeDays)} días y el máximo es ${input.maxEvidenceAgeDays}.`,
    );

  if (r.status === 'DIFERENCIA_NO_EXPLICADA')
    add(
      'DIFERENCIA_NO_EXPLICADA',
      'REQUIERE_INSPECCION',
      `Diferencia no explicada de ${Math.abs(r.unexplainedDifference ?? 0)} cabezas (tolerancia ${r.toleranceHeads}).`,
    );
  if (input.consecutiveNotDeterminable >= 2 && gates.some((g) => g.state === 'NO_DETERMINABLE'))
    add(
      'NO_DETERMINABLE_REITERADO',
      'REQUIERE_INSPECCION',
      'Dos evaluaciones seguidas no determinables.',
    );
  if (input.lastInspection?.isCurrentObservation && input.lastInspection.result === 'NO_CONFORME')
    add(
      'INSPECCION_NO_CONFORME',
      'REQUIERE_INSPECCION',
      'La última inspección presencial resultó NO CONFORME.',
    );
  return gates;
}

/** Prioridad de las compuertas para fijar el estado. */
const GATE_PRIORITY: Gate['state'][] = [
  'REQUIERE_INSPECCION',
  'NO_DETERMINABLE',
  'REQUIERE_REVISION',
  'REQUIERE_EVIDENCIA',
];

export interface StateInput {
  gates: Gate[];
  finalScore: number | null;
  /** La garantía terminó (cancelada / liberada). */
  finalized: boolean;
  /** La garantía legal venció (fecha de vencimiento pasada). */
  expired: boolean;
  /** Hay declaración congelada. */
  declared: boolean;
  /** Ya hubo al menos una verificación (inicial) registrada. */
  hasVerification: boolean;
  /** Días desde la última evidencia física. */
  evidenceAgeDays: number | null;
  frequencyDays: number;
}

export function resolveState(
  input: StateInput,
  settings: EngineSettings,
): {
  state: CollateralState;
  reason: string;
} {
  if (input.finalized) return { state: 'FINALIZADA', reason: 'La garantía fue finalizada.' };
  if (input.expired)
    return { state: 'VENCIDA', reason: 'La garantía superó su fecha de vencimiento.' };
  if (!input.declared)
    return {
      state: 'PENDIENTE_DECLARACION',
      reason: 'El productor todavía no envió su declaración.',
    };
  if (!input.hasVerification)
    return {
      state: 'PENDIENTE_VERIFICACION',
      reason: 'Declaración recibida; falta la verificación inicial.',
    };
  for (const state of GATE_PRIORITY) {
    const gate = input.gates.find((g) => g.state === state);
    if (gate) return { state, reason: gate.explanation };
  }
  if (
    input.finalScore !== null &&
    input.finalScore >= settings.minVerifiedScore &&
    input.evidenceAgeDays !== null &&
    input.evidenceAgeDays <= input.frequencyDays
  )
    return {
      state: 'VERIFICADA',
      reason: 'Todo cierra: sin compuertas activas y evidencia dentro de la frecuencia.',
    };
  return {
    state: 'EN_MONITOREO',
    reason:
      input.finalScore !== null && input.finalScore < settings.minVerifiedScore
        ? `Sin compuertas activas, pero el score (${input.finalScore}) está debajo de ${settings.minVerifiedScore}.`
        : 'Sin compuertas activas; la próxima verificación está programada.',
  };
}
