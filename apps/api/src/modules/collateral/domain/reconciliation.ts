import type {
  CountBasis,
  EvidenceMethod,
  MovementDirection,
  MovementSourceLevel,
  MovementVerificationState,
} from './collateral.types.js';
import type { Tolerance } from './policy.js';

/**
 * Motor de consistencia: cruza lo DECLARADO, los MOVIMIENTOS, lo ESPERADO, lo OBSERVADO (cámara,
 * escáner, inspección) y la identificación RFID. Nunca asume fraude: habla de inconsistencia,
 * diferencia no explicada, evidencia insuficiente o revisión. Declarado, observado y verificado
 * se mantienen separados; nunca dice "faltan N" cuando la diferencia puede explicarse por
 * movimientos.
 */
export interface ReconciliationMovement {
  direction: MovementDirection;
  heads: number;
  sourceLevel: MovementSourceLevel;
  verificationState: MovementVerificationState;
}

export interface Observation {
  count: number;
  basis: CountBasis;
  method: EvidenceMethod;
  observedAt: Date;
}

export interface RfidSummary {
  /** Caravanas distintas confirmadas (RFID + animal en cámara asociados). */
  identified: number;
  /** Capturas rechazadas por ambigüedad (más de una caravana o más de un animal). */
  ambiguous: number;
  /** Caravanas leídas que pertenecen a otro establecimiento. */
  otherEstablishment: number;
}

export type ConsistencyStatus =
  | 'SIN_OBSERVACION'
  | 'CONSISTENTE'
  | 'DIFERENCIA_MENOR'
  | 'DIFERENCIA_NO_EXPLICADA'
  | 'EVIDENCIA_INSUFICIENTE';

export interface ReconciliationResult {
  declared: number;
  exits: number;
  entries: number;
  /** Movimientos informados sin respaldo documental ni oficial (cabezas). */
  declaredOnlyHeads: number;
  /** Movimientos rechazados (no se usan en el cálculo). */
  rejectedHeads: number;
  expected: number;
  observed: number | null;
  observedBasis: CountBasis | null;
  observedMethod: EvidenceMethod | null;
  /** Observado − esperado (solo si el conteo es comparable); null si no se puede determinar. */
  unexplainedDifference: number | null;
  toleranceHeads: number;
  /** Cabezas que se pueden considerar verificadas físicamente. */
  verifiable: number | null;
  rfid: RfidSummary | null;
  rfidExceedsExpected: boolean;
  status: ConsistencyStatus;
  /** Relato en lenguaje natural, en el orden declarado → movimientos → esperado → observado. */
  narrative: string[];
}

const n = (value: number) => value.toLocaleString('es-AR');
const heads = (value: number) => `${n(value)} ${value === 1 ? 'animal' : 'animales'}`;

const METHOD_TEXT: Record<EvidenceMethod, string> = {
  FOTO: 'La última evidencia visual (foto)',
  VIDEO: 'La última evidencia visual (video/barrido)',
  ESCANER_FIJO: 'El último conteo en paso controlado (escáner fijo)',
  MANGA_RFID: 'El último paso por la manga con RFID',
  INSPECCION: 'La última inspección presencial',
  DOCUMENTO: 'El último documento',
};

export function toleranceHeads(expected: number, tolerance: Tolerance): number {
  return Math.max(tolerance.minHeads, Math.floor(expected * tolerance.relative));
}

export function reconcile(input: {
  declared: number;
  movements: ReconciliationMovement[];
  observation: Observation | null;
  rfid: RfidSummary | null;
  tolerance: Tolerance;
}): ReconciliationResult {
  const counted = input.movements.filter((m) => m.verificationState !== 'RECHAZADO');
  const sum = (direction: MovementDirection) =>
    counted.filter((m) => m.direction === direction).reduce((acc, m) => acc + m.heads, 0);
  const exits = sum('EGRESO');
  const entries = sum('INGRESO');
  const declaredOnlyHeads = counted
    .filter((m) => m.sourceLevel === 'DECLARADO')
    .reduce((acc, m) => acc + m.heads, 0);
  const rejectedHeads = input.movements
    .filter((m) => m.verificationState === 'RECHAZADO')
    .reduce((acc, m) => acc + m.heads, 0);
  const expected = Math.max(0, input.declared - exits + entries);
  const tolerance = toleranceHeads(expected, input.tolerance);

  const narrative = [`Se declararon ${heads(input.declared)}.`];
  if (exits > 0) narrative.push(`Se registraron ${n(exits)} salidas.`);
  if (entries > 0) narrative.push(`Se registraron ${n(entries)} ingresos.`);
  if (declaredOnlyHeads > 0)
    narrative.push(
      `${n(declaredOnlyHeads)} cabezas de esos movimientos son solo declaradas (sin DT-e ni fuente oficial).`,
    );
  if (rejectedHeads > 0)
    narrative.push(`${n(rejectedHeads)} cabezas de movimientos rechazados no se consideran.`);
  narrative.push(`La cantidad esperada es ${n(expected)}.`);

  const rfid = input.rfid;
  const rfidExceedsExpected = rfid !== null && rfid.identified > expected;
  const obs = input.observation;

  let status: ConsistencyStatus;
  let unexplained: number | null = null;
  let verifiable: number | null = null;

  if (!obs) {
    status = 'SIN_OBSERVACION';
    narrative.push('Todavía no hay evidencia física que permita observar el rodeo.');
  } else if (obs.basis === 'CENSO') {
    unexplained = obs.count - expected;
    verifiable = Math.min(obs.count, expected);
    narrative.push(`${METHOD_TEXT[obs.method]} observó ${heads(obs.count)}.`);
    if (unexplained === 0) {
      status = 'CONSISTENTE';
      narrative.push('Lo observado coincide con lo esperado.');
    } else {
      status = Math.abs(unexplained) <= tolerance ? 'DIFERENCIA_MENOR' : 'DIFERENCIA_NO_EXPLICADA';
      narrative.push(
        `Diferencia no explicada: ${n(Math.abs(unexplained))} ${unexplained < 0 ? 'menos' : 'más'} de lo esperado` +
          (status === 'DIFERENCIA_MENOR'
            ? ` (dentro de la tolerancia de ${n(tolerance)}; requiere revisión).`
            : ` (supera la tolerancia de ${n(tolerance)}).`),
      );
    }
  } else {
    // Cota inferior: muestra una parte del rodeo. Nunca se interpreta como faltante.
    verifiable = Math.min(obs.count, expected);
    narrative.push(
      `${METHOD_TEXT[obs.method]} observó al menos ${heads(obs.count)} (parte del rodeo, no un conteo completo).`,
    );
    if (obs.count >= expected) {
      status = 'CONSISTENTE';
      unexplained = 0;
      narrative.push('La parte observada ya alcanza la cantidad esperada.');
    } else {
      status = 'EVIDENCIA_INSUFICIENTE';
      narrative.push(
        `Evidencia insuficiente para confirmar el total: faltan observar ${n(expected - obs.count)} de los esperados. ` +
          'No implica faltante.',
      );
    }
  }

  if (rfid) {
    narrative.push(`RFID: ${n(rfid.identified)} caravanas identificadas y asociadas a un animal.`);
    if (rfid.ambiguous > 0)
      narrative.push(`${n(rfid.ambiguous)} pasos por la manga se descartaron por ambigüedad.`);
    if (rfid.otherEstablishment > 0)
      narrative.push(
        `${n(rfid.otherEstablishment)} caravanas corresponden a otro establecimiento.`,
      );
    if (rfidExceedsExpected)
      narrative.push(
        'Hay más caravanas identificadas que animales esperados: inconsistencia RFID.',
      );
    // RFID confirmado es un piso de existencia independiente de la cámara.
    if (verifiable === null || rfid.identified > verifiable)
      verifiable = Math.min(rfid.identified, expected);
  }

  return {
    declared: input.declared,
    exits,
    entries,
    declaredOnlyHeads,
    rejectedHeads,
    expected,
    observed: obs?.count ?? null,
    observedBasis: obs?.basis ?? null,
    observedMethod: obs?.method ?? null,
    unexplainedDifference: unexplained,
    toleranceHeads: tolerance,
    verifiable,
    rfid,
    rfidExceedsExpected,
    status,
    narrative,
  };
}
