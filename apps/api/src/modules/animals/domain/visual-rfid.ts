/**
 * Conciliación VISUAL + RFID de un rodeo.
 *
 *   bovinos observados (visión)  ↔  bovinos identificados por RFID (caravanas leídas)
 *
 * Coincidencia individual solo cuando se puede afirmar: un escaneo FIJO en la manga (cada animal
 * cruza la línea en un instante conocido) y lecturas de un lector en ese mismo paso. Cada cruce
 * se empareja con la primera lectura de una caravana distinta dentro de ±tolerancia segundos
 * (greedy por cercanía, cada uno se usa una vez). Sin ese paso simultáneo NO hay coincidencias
 * individuales: solo se comparan totales, y así se informa.
 *
 * REAL y SIMULADO no se mezclan: las lecturas simuladas (demo) se informan aparte y nunca se
 * emparejan con un escaneo real.
 *
 * Sin lector físico conectado no hay lecturas REALES: este módulo no inventa integración con
 * hardware; las lecturas llegan por el puente del lector (POST /assets/:id/rfid/observations).
 */

export const RFID_MATCH_TOLERANCE_S = 3;

export type ReconciliationMethod = 'TIME_MATCH' | 'COUNTS_ONLY' | 'NO_RFID' | 'NO_VISUAL';

export interface RfidRead {
  eid: string;
  at: Date;
  status: 'IDENTIFIED' | 'UNKNOWN_TAG' | 'OTHER_ESTABLISHMENT';
  simulated: boolean;
}

export interface VisualCrossing {
  trackId: number;
  at: Date;
}

export interface TimeMatch {
  pairs: { trackId: number; eid: string; deltaS: number }[];
  unmatchedCrossings: number[];
  unmatchedTags: string[];
}

/** Empareja cruces de la línea con caravanas leídas en el mismo paso (±tolerancia). */
export function matchCrossingsToReads(
  crossings: readonly VisualCrossing[],
  reads: readonly RfidRead[],
  toleranceS = RFID_MATCH_TOLERANCE_S,
): TimeMatch {
  // Primera lectura de cada caravana (un lector suele leer la misma varias veces seguidas).
  const firstRead = new Map<string, Date>();
  for (const r of [...reads].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (!firstRead.has(r.eid)) firstRead.set(r.eid, r.at);
  }
  const candidates: { c: number; eid: string; delta: number }[] = [];
  crossings.forEach((crossing, c) => {
    for (const [eid, at] of firstRead) {
      const delta = Math.abs(at.getTime() - crossing.at.getTime()) / 1000;
      if (delta <= toleranceS) candidates.push({ c, eid, delta });
    }
  });
  candidates.sort((a, b) => a.delta - b.delta || a.c - b.c || a.eid.localeCompare(b.eid));
  const usedC = new Set<number>();
  const usedTag = new Set<string>();
  const pairs: TimeMatch['pairs'] = [];
  for (const { c, eid, delta } of candidates) {
    if (usedC.has(c) || usedTag.has(eid)) continue;
    usedC.add(c);
    usedTag.add(eid);
    pairs.push({ trackId: crossings[c]!.trackId, eid, deltaS: Math.round(delta * 100) / 100 });
  }
  return {
    pairs,
    unmatchedCrossings: crossings.filter((_, c) => !usedC.has(c)).map((x) => x.trackId),
    unmatchedTags: [...firstRead.keys()].filter((eid) => !usedTag.has(eid)),
  };
}

export interface ReconciliationInput {
  /** Último conteo visual oficial del activo y su base. */
  observed: number | null;
  observedBasis: 'CENSUS' | 'LOWER_BOUND' | null;
  observedAt: Date | null;
  /** Lecturas RFID del período (reales y simuladas). */
  reads: readonly RfidRead[];
  /** Cruces de un escaneo FIJO con hora, si existe uno con lecturas en el mismo paso. */
  passage: {
    scanId: string;
    observed: number;
    crossings: VisualCrossing[];
    from: Date;
    to: Date;
  } | null;
}

interface SourceSummary {
  tags: number;
  identified: number;
  unknown: number;
  otherEstablishment: number;
}

export interface Reconciliation {
  method: ReconciliationMethod;
  observed: number | null;
  observedBasis: 'CENSUS' | 'LOWER_BOUND' | null;
  observedAt: Date | null;
  real: SourceSummary;
  simulated: SourceSummary;
  /** Solo con TIME_MATCH (paso por la manga con lector en el mismo momento). */
  matches: number | null;
  observedWithoutRfid: number | null;
  rfidWithoutVisual: number | null;
  passage: { scanId: string; observed: number; toleranceS: number; simulated: boolean } | null;
  /** Diferencia de totales (observados − identificados por RFID REAL), siempre como total. */
  totalsDifference: number | null;
  notes: string[];
}

function summarize(reads: readonly RfidRead[]): SourceSummary {
  const byTag = new Map<string, RfidRead['status']>();
  for (const r of reads) byTag.set(r.eid, r.status);
  const statuses = [...byTag.values()];
  return {
    tags: byTag.size,
    identified: statuses.filter((s) => s === 'IDENTIFIED').length,
    unknown: statuses.filter((s) => s === 'UNKNOWN_TAG').length,
    otherEstablishment: statuses.filter((s) => s === 'OTHER_ESTABLISHMENT').length,
  };
}

export function reconcileVisualRfid(input: ReconciliationInput): Reconciliation {
  const real = input.reads.filter((r) => !r.simulated);
  const simulated = input.reads.filter((r) => r.simulated);
  const realSummary = summarize(real);
  const notes: string[] = [];
  if (!real.length)
    notes.push(
      simulated.length
        ? 'Solo hay lecturas RFID SIMULADAS (demo): no se usan para conciliar.'
        : 'Sin lecturas RFID reales: hace falta un lector conectado al puente.',
    );

  const base = {
    observed: input.observed,
    observedBasis: input.observedBasis,
    observedAt: input.observedAt,
    real: realSummary,
    simulated: summarize(simulated),
    totalsDifference:
      input.observed !== null && real.length ? input.observed - realSummary.identified : null,
  };

  if (input.passage) {
    const inPassage = real.filter((r) => r.at >= input.passage!.from && r.at <= input.passage!.to);
    if (inPassage.length) {
      const match = matchCrossingsToReads(input.passage.crossings, inPassage);
      notes.push(
        `Coincidencia por paso por la manga: cada cruce se emparejó con una caravana leída a ±${RFID_MATCH_TOLERANCE_S} s.`,
      );
      return {
        ...base,
        method: 'TIME_MATCH',
        matches: match.pairs.length,
        observedWithoutRfid: match.unmatchedCrossings.length,
        rfidWithoutVisual: match.unmatchedTags.length,
        passage: {
          scanId: input.passage.scanId,
          observed: input.passage.observed,
          toleranceS: RFID_MATCH_TOLERANCE_S,
          simulated: false,
        },
        notes,
      };
    }
  }

  const method: ReconciliationMethod =
    input.observed === null ? 'NO_VISUAL' : real.length ? 'COUNTS_ONLY' : 'NO_RFID';
  if (method === 'COUNTS_ONLY')
    notes.push(
      'Sin un escaneo fijo con lector en el mismo paso: no se puede decir qué animal observado ' +
        'corresponde a qué caravana. Solo se comparan totales.',
    );
  if (method === 'NO_VISUAL') notes.push('Todavía no hay un conteo visual oficial del rodeo.');
  return {
    ...base,
    method,
    matches: null,
    observedWithoutRfid: null,
    rfidWithoutVisual: null,
    passage: null,
    notes,
  };
}
