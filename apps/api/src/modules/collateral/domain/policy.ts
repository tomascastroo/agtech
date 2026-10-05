import type { CollateralRiskLevel, EvidenceMethod, ProductionType } from './collateral.types.js';

/**
 * Política de monitoreo por tipo de producción y nivel de riesgo. Es CONFIGURACIÓN (tabla
 * collateral_monitoring_policies, editable por organización), no una verdad regulatoria: los
 * valores iniciales salen de la investigación (docs/livestock-collateral-research.md) y deben
 * calibrarse con cada entidad.
 */
export interface FrequencyRule {
  /** Cada cuántos días se espera una verificación nueva. */
  frequencyDays: number;
  /** Antigüedad máxima de la última evidencia física antes de exigir evidencia nueva. */
  maxEvidenceAgeDays: number;
  /** Método recomendado para la próxima verificación. */
  recommendedMethod: EvidenceMethod;
  /** El nivel de riesgo exige inspección presencial (escalamiento, no reemplaza el monitoreo). */
  requiresInspection: boolean;
}

export type MonitoringPolicy = Record<CollateralRiskLevel, FrequencyRule>;

export interface Tolerance {
  /** Diferencia relativa (sobre lo esperado) que todavía se considera "menor". */
  relative: number;
  /** Mínimo absoluto de cabezas de tolerancia (rodeos chicos). */
  minHeads: number;
}

/** Parámetros del motor que la entidad puede ajustar. */
export interface EngineSettings {
  tolerance: Tolerance;
  /** Score mínimo para considerar la garantía VERIFICADA (sin compuertas activas). */
  minVerifiedScore: number;
  /** Margen sobre el eslabón más débil (ver score.ts). */
  weakestLinkMargin: number;
  /** Antigüedad máxima del precio de referencia antes de advertir (días). */
  maxPriceAgeDays: number;
  /** Cobertura mínima (valor verificable / deuda) antes de alertar. */
  minCoverageRatio: number;
  /** Umbrales de riesgo por tamaño (cabezas) y monto. */
  largeHerdHeads: number;
}

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = {
  tolerance: { relative: 0.01, minHeads: 5 },
  minVerifiedScore: 70,
  weakestLinkMargin: 15,
  maxPriceAgeDays: 30,
  minCoverageRatio: 1.3,
  largeHerdHeads: 1000,
};

const rule = (
  frequencyDays: number,
  maxEvidenceAgeDays: number,
  recommendedMethod: EvidenceMethod,
  requiresInspection = false,
): FrequencyRule => ({ frequencyDays, maxEvidenceAgeDays, recommendedMethod, requiresInspection });

/**
 * Configuración INICIAL de ejemplo (se carga en la migración como política global, editable).
 * Feedlot 30/14/7 días; cría por eventos de manga con remota cada 90; tambo continuo (cuando haya
 * datos de la usina) con conteo cada 90; invernada 60. Crítico = inspección presencial.
 */
export const INITIAL_POLICIES: Record<ProductionType, MonitoringPolicy> = {
  FEEDLOT: {
    BAJO: rule(30, 45, 'ESCANER_FIJO'),
    MEDIO: rule(14, 30, 'ESCANER_FIJO'),
    ALTO: rule(7, 14, 'ESCANER_FIJO'),
    CRITICO: rule(7, 7, 'INSPECCION', true),
  },
  INVERNADA: {
    BAJO: rule(60, 90, 'VIDEO'),
    MEDIO: rule(30, 45, 'VIDEO'),
    ALTO: rule(14, 21, 'ESCANER_FIJO'),
    CRITICO: rule(7, 7, 'INSPECCION', true),
  },
  CRIA: {
    BAJO: rule(90, 120, 'MANGA_RFID'),
    MEDIO: rule(45, 60, 'MANGA_RFID'),
    ALTO: rule(14, 21, 'MANGA_RFID'),
    CRITICO: rule(7, 7, 'INSPECCION', true),
  },
  TAMBO: {
    BAJO: rule(90, 120, 'ESCANER_FIJO'),
    MEDIO: rule(45, 60, 'ESCANER_FIJO'),
    ALTO: rule(14, 21, 'ESCANER_FIJO'),
    CRITICO: rule(7, 7, 'INSPECCION', true),
  },
};

/** Estrategia de verificación de cada tipo de producción (se muestra en el passport). */
export const PRODUCTION_STRATEGIES: Record<ProductionType, string> = {
  FEEDLOT:
    'Alta rotación: conteo por corral con el escáner y respaldo de DT-e de ingreso y egreso. La ' +
    'cantidad cambia rápido; la frecuencia base es la más alta.',
  INVERNADA:
    'Animales en recría/engorde a campo: barridos y escáner; RFID en manga cuando exista. Los DT-e ' +
    'de salida explican las bajas.',
  CRIA:
    'Rodeo estable con eventos de manga (tacto, vacunación, destete): Manga + RFID en cada evento ' +
    'da conteo e identidad individual; entre eventos, verificación remota.',
  TAMBO:
    'Rodeo de ordeñe estable: conteo en el paso hacia la sala de ordeñe. Los datos de producción ' +
    'diaria de la usina no están integrados.',
};

/** ¿Este tipo de producción espera identificación individual (RFID) como evidencia principal? */
export const EXPECTS_RFID: Record<ProductionType, boolean> = {
  FEEDLOT: false,
  INVERNADA: false,
  CRIA: true,
  TAMBO: false,
};
