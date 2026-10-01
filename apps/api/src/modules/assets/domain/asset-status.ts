import type { VerificationOutcome } from '../../verification/domain/verification.types.js';
import type { AssetStatus, VerificationStrategyCode } from './asset.types.js';

/** Estado del activo luego de completar una verificación. */
export function statusAfterVerification(outcome: VerificationOutcome): AssetStatus {
  switch (outcome) {
    case 'VERIFIED':
      return 'VERIFIED';
    case 'REJECTED':
      return 'REJECTED';
    case 'OBSERVED':
    case 'INCONCLUSIVE':
      return 'OBSERVED';
  }
}

/** Ventana de vigencia de una verificación para confirmar un activo como garantía. */
export const GUARANTEE_VERIFICATION_MAX_AGE_DAYS = 30;

/**
 * Antigüedad máxima de evidencia aceptada por defecto según la fuente principal: cámaras con
 * captura diaria (72 h), revisión visual periódica (7 días) y revisita satelital con
 * nubosidad (30 días).
 */
export function defaultMaxEvidenceAgeHours(strategy: VerificationStrategyCode): number {
  switch (strategy) {
    case 'LIVESTOCK_COUNTING':
      return 72;
    case 'EVIDENCE_REVIEW':
      return 168;
    case 'VEGETATION_AREA':
      return 720;
  }
}
