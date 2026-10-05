import type {
  CollateralRiskLevel,
  CollateralState,
  EvidenceQualityLevel,
  ProductionType,
} from './collateral.types.js';
import type { EngineSettings } from './policy.js';
import { EXPECTS_RFID } from './policy.js';
import type { ReconciliationResult } from './reconciliation.js';

/**
 * Motor de riesgo: suma puntos por factor y cada factor queda explicado. No es un modelo
 * estadístico; es una regla transparente para decidir la frecuencia de verificación.
 *   0-1 BAJO · 2-3 MEDIO · 4-6 ALTO · 7+ CRÍTICO
 */
export interface RiskInput {
  production: ProductionType;
  state: CollateralState;
  reconciliation: ReconciliationResult;
  amount: number | null;
  /** Monto a partir del cual el valor suma riesgo (configurable). null = no se evalúa. */
  highAmountThreshold: number | null;
  evidenceAgeDays: number | null;
  frequencyDays: number;
  quality: EvidenceQualityLevel | null;
  documentationScore: number | null;
  coverageRatio: number | null;
  previousScore: number | null;
  currentScore: number | null;
  recentAlerts: number;
}

export interface RiskFactor {
  code: string;
  points: number;
  explanation: string;
}

export interface RiskResult {
  level: CollateralRiskLevel;
  points: number;
  factors: RiskFactor[];
}

export function levelFor(points: number): CollateralRiskLevel {
  if (points >= 7) return 'CRITICO';
  if (points >= 4) return 'ALTO';
  if (points >= 2) return 'MEDIO';
  return 'BAJO';
}

const STATE_POINTS: Partial<Record<CollateralState, number>> = {
  REQUIERE_INSPECCION: 4,
  NO_DETERMINABLE: 3,
  REQUIERE_REVISION: 2,
  REQUIERE_EVIDENCIA: 2,
  VENCIDA: 2,
};

export function assessRisk(input: RiskInput, settings: EngineSettings): RiskResult {
  const factors: RiskFactor[] = [];
  const add = (code: string, points: number, explanation: string) => {
    if (points > 0) factors.push({ code, points, explanation });
  };
  const r = input.reconciliation;

  if (input.production === 'FEEDLOT' || input.production === 'INVERNADA')
    add(
      'TIPO_PRODUCCION',
      1,
      `${input.production === 'FEEDLOT' ? 'Feedlot' : 'Invernada'}: alta rotación de animales.`,
    );
  if (r.expected >= settings.largeHerdHeads)
    add('CANTIDAD', 1, `Rodeo grande (${r.expected.toLocaleString('es-AR')} cabezas esperadas).`);
  if (
    input.highAmountThreshold !== null &&
    input.amount !== null &&
    input.amount >= input.highAmountThreshold
  )
    add('MONTO', 1, 'Monto garantizado alto.');
  add('ESTADO', STATE_POINTS[input.state] ?? 0, `Estado actual: ${input.state}.`);
  if (input.evidenceAgeDays !== null && input.evidenceAgeDays > input.frequencyDays)
    add(
      'ANTIGUEDAD_EVIDENCIA',
      1,
      `Evidencia de ${Math.floor(input.evidenceAgeDays)} días (frecuencia ${input.frequencyDays}).`,
    );
  if (input.quality === 'BAJA' || input.quality === 'INSUFICIENTE')
    add('CALIDAD_EVIDENCIA', 1, `Calidad de evidencia ${input.quality}.`);
  if (r.declaredOnlyHeads > 0)
    add('MOVIMIENTOS', 1, `${r.declaredOnlyHeads} cabezas movidas sin respaldo documental.`);
  if (r.exits > 0 && r.declared > 0 && r.exits / r.declared >= 0.2)
    add(
      'MOVIMIENTOS_VOLUMEN',
      1,
      `Salió el ${Math.round((r.exits / r.declared) * 100)} % de lo declarado.`,
    );
  if (EXPECTS_RFID[input.production]) {
    const ratio = r.rfid && r.expected > 0 ? r.rfid.identified / r.expected : 0;
    if (ratio < 0.5)
      add('RFID', 1, `Identificación RFID baja (${Math.round(ratio * 100)} % de lo esperado).`);
  }
  if (r.rfid && (r.rfid.otherEstablishment > 0 || r.rfidExceedsExpected))
    add('RFID_INCONSISTENTE', 2, 'Caravanas inconsistentes.');
  if (input.documentationScore !== null && input.documentationScore < 60)
    add(
      'DOCUMENTACION',
      1,
      `Documentación incompleta o inconsistente (${input.documentationScore}/100).`,
    );
  if (input.coverageRatio !== null) {
    if (input.coverageRatio < 1)
      add(
        'COBERTURA',
        3,
        `Cobertura ${input.coverageRatio.toFixed(2)}: el valor verificable no cubre la deuda.`,
      );
    else if (input.coverageRatio < settings.minCoverageRatio)
      add(
        'COBERTURA',
        1,
        `Cobertura ${input.coverageRatio.toFixed(2)} debajo del mínimo ${settings.minCoverageRatio}.`,
      );
  }
  if (
    input.previousScore !== null &&
    input.currentScore !== null &&
    input.previousScore - input.currentScore >= 15
  )
    add('SCORE_DETERIORADO', 1, `El score bajó de ${input.previousScore} a ${input.currentScore}.`);
  if (input.recentAlerts >= 3)
    add('FRECUENCIA_ALERTAS', 1, `${input.recentAlerts} alertas en los últimos 90 días.`);

  const points = factors.reduce((a, f) => a + f.points, 0);
  return { level: levelFor(points), points, factors };
}
