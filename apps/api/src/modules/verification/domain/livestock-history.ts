/**
 * Historial del rodeo verificación tras verificación (monitoreo recurrente de la garantía) y
 * detección de cambios relevantes entre una verificación y la anterior.
 *
 * Regla de prudencia: un conteo que es cota inferior (fotos, barridos, corrales) no prueba una
 * caída del stock; si baja, se informa como cambio de cobertura (INFO), no como faltante. Solo dos
 * conteos de censo (paso por la manga) consecutivos permiten afirmar una caída.
 */
import type { VerificationOutcome } from './verification.types.js';

export interface LivestockHistoryRow {
  runId: string;
  date: Date;
  declared: number | null;
  observed: number | null;
  basis: 'CENSUS' | 'LOWER_BOUND' | null;
  /** Caravanas distintas IDENTIFICADAS por RFID real en los 30 días previos (null: sin lecturas). */
  rfidIdentified: number | null;
  /** Lecturas simuladas del período (se muestran aparte; no se comparan). */
  rfidSimulated: number;
  /** min(observados, declarados) / declarados. */
  coverage: number | null;
  status: VerificationOutcome | null;
}

export type ChangeSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface LivestockChange {
  code:
    | 'DECLARED_CHANGED'
    | 'CENSUS_DROP'
    | 'OBSERVED_LOWER'
    | 'OBSERVED_HIGHER'
    | 'RFID_DROP'
    | 'COVERAGE_DROP'
    | 'STATUS_WORSENED'
    | 'STATUS_IMPROVED';
  severity: ChangeSeverity;
  fromRunId: string;
  toRunId: string;
  date: Date;
  message: string;
}

/** Umbrales (fracción) a partir de los cuales un cambio se informa. */
export const CHANGE_THRESHOLDS = {
  censusDrop: 0.1,
  lowerBoundChange: 0.2,
  rfidDrop: 0.1,
  coverageDrop: 0.2,
} as const;

const STATUS_RANK: Record<VerificationOutcome, number> = {
  VERIFIED: 0,
  INCONCLUSIVE: 1,
  OBSERVED: 2,
  REJECTED: 3,
};

const STATUS_LABEL: Record<VerificationOutcome, string> = {
  VERIFIED: 'verificado',
  INCONCLUSIVE: 'no concluyente',
  OBSERVED: 'con observaciones',
  REJECTED: 'rechazado',
};

const pct = (ratio: number) => `${Math.round(ratio * 100)} %`;

/** Cambios entre verificaciones consecutivas (filas en orden cronológico ascendente). */
export function detectLivestockChanges(rows: readonly LivestockHistoryRow[]): LivestockChange[] {
  const changes: LivestockChange[] = [];
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]!;
    const cur = rows[i]!;
    const push = (code: LivestockChange['code'], severity: ChangeSeverity, message: string) =>
      changes.push({
        code,
        severity,
        fromRunId: prev.runId,
        toRunId: cur.runId,
        date: cur.date,
        message,
      });

    if (prev.declared !== null && cur.declared !== null && prev.declared !== cur.declared) {
      push(
        'DECLARED_CHANGED',
        'INFO',
        `Lo declarado cambió de ${prev.declared} a ${cur.declared} cabezas.`,
      );
    }
    if (prev.observed !== null && cur.observed !== null && prev.observed > 0) {
      const delta = (cur.observed - prev.observed) / prev.observed;
      const bothCensus = prev.basis === 'CENSUS' && cur.basis === 'CENSUS';
      if (bothCensus && delta <= -CHANGE_THRESHOLDS.censusDrop) {
        push(
          'CENSUS_DROP',
          delta <= -0.25 ? 'CRITICAL' : 'WARNING',
          `El conteo en manga bajó de ${prev.observed} a ${cur.observed} (${pct(-delta)}).`,
        );
      } else if (!bothCensus && delta <= -CHANGE_THRESHOLDS.lowerBoundChange) {
        push(
          'OBSERVED_LOWER',
          'INFO',
          `Se observaron menos animales (${prev.observed} → ${cur.observed}), pero al menos un ` +
            'conteo es cota inferior: puede ser otra cobertura, no prueba un faltante.',
        );
      } else if (delta >= CHANGE_THRESHOLDS.lowerBoundChange) {
        push(
          'OBSERVED_HIGHER',
          'INFO',
          `Se observaron más animales (${prev.observed} → ${cur.observed}, +${pct(delta)}).`,
        );
      }
    }
    if (
      prev.rfidIdentified !== null &&
      cur.rfidIdentified !== null &&
      prev.rfidIdentified > 0 &&
      (prev.rfidIdentified - cur.rfidIdentified) / prev.rfidIdentified >= CHANGE_THRESHOLDS.rfidDrop
    ) {
      push(
        'RFID_DROP',
        'WARNING',
        `Menos caravanas identificadas por RFID: ${prev.rfidIdentified} → ${cur.rfidIdentified}.`,
      );
    }
    if (
      prev.coverage !== null &&
      cur.coverage !== null &&
      prev.coverage - cur.coverage >= CHANGE_THRESHOLDS.coverageDrop
    ) {
      push(
        'COVERAGE_DROP',
        'INFO',
        `La cobertura bajó de ${pct(prev.coverage)} a ${pct(cur.coverage)} de lo declarado.`,
      );
    }
    if (prev.status && cur.status && prev.status !== cur.status) {
      const worse = STATUS_RANK[cur.status] > STATUS_RANK[prev.status];
      push(
        worse ? 'STATUS_WORSENED' : 'STATUS_IMPROVED',
        worse ? (cur.status === 'REJECTED' ? 'CRITICAL' : 'WARNING') : 'INFO',
        `El estado pasó de ${STATUS_LABEL[prev.status]} a ${STATUS_LABEL[cur.status]}.`,
      );
    }
  }
  return changes;
}
