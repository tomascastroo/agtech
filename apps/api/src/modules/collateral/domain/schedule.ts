import type { CollateralRiskLevel, EvidenceMethod } from './collateral.types.js';
import type { MonitoringPolicy } from './policy.js';

const DAY_MS = 86_400_000;

export interface ScheduleResult {
  riskLevel: CollateralRiskLevel;
  frequencyDays: number;
  maxEvidenceAgeDays: number;
  recommendedMethod: EvidenceMethod;
  requiresInspection: boolean;
  lastVerificationAt: Date | null;
  nextVerificationAt: Date;
  explanation: string;
}

/**
 * Próxima verificación = última verificación + frecuencia del nivel de riesgo. Si nunca se
 * verificó (o ya está vencida), la próxima es ahora. Si el riesgo subió, la fecha se adelanta.
 */
export function computeSchedule(input: {
  policy: MonitoringPolicy;
  riskLevel: CollateralRiskLevel;
  lastVerificationAt: Date | null;
  now: Date;
}): ScheduleResult {
  const rule = input.policy[input.riskLevel];
  const due = input.lastVerificationAt
    ? new Date(input.lastVerificationAt.getTime() + rule.frequencyDays * DAY_MS)
    : input.now;
  return {
    riskLevel: input.riskLevel,
    frequencyDays: rule.frequencyDays,
    maxEvidenceAgeDays: rule.maxEvidenceAgeDays,
    recommendedMethod: rule.recommendedMethod,
    requiresInspection: rule.requiresInspection,
    lastVerificationAt: input.lastVerificationAt,
    nextVerificationAt: due,
    explanation:
      `Riesgo ${input.riskLevel}: verificar cada ${rule.frequencyDays} días con ${rule.recommendedMethod}` +
      (rule.requiresInspection ? ' e inspección presencial.' : '.') +
      ` Evidencia física válida hasta ${rule.maxEvidenceAgeDays} días.`,
  };
}
