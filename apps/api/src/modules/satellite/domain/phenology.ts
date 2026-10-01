/**
 * Fenología esperada por tipo de activo (hemisferio sur). Determina si en una fecha es esperable
 * observar vegetación activa: un lote recién sembrado o un viñedo en reposo invernal tienen NDVI
 * bajo sin que eso indique un problema, y la verificación debe ser no concluyente en lugar de
 * generar una falsa alarma.
 */

export type PhenologyStage =
  | 'PRE_SIEMBRA'
  | 'IMPLANTACION'
  | 'CRECIMIENTO'
  | 'CICLO_CUMPLIDO'
  | 'TEMPORADA_ACTIVA'
  | 'REPOSO'
  | 'PERMANENTE'
  | 'SIN_DATOS';

export interface PhenologyExpectation {
  stage: PhenologyStage;
  vegetationExpected: boolean;
  reason: string;
  daysSinceSowing: number | null;
}

const DAY_MS = 86_400_000;
/** Días desde la siembra hasta que el canopeo cubre el lote (los de invierno crecen más lento). */
export const ESTABLISHMENT_DAYS: Record<string, number> = { Trigo: 45, Cebada: 45 };
const DEFAULT_ESTABLISHMENT_DAYS = 30;
/** Duración aproximada siembra → cosecha por cultivo (días). */
export const CROP_CYCLE_DAYS: Record<string, number> = {
  Trigo: 200,
  Maíz: 170,
  Soja: 150,
  Girasol: 140,
  Sorgo: 150,
  Cebada: 180,
};
const DEFAULT_CYCLE_DAYS = 160;

/** Ventana de follaje activo (mes 1-12, día) para perennes caducifolios. */
const ACTIVE_SEASON: Record<
  string,
  { from: [number, number]; to: [number, number]; label: string }
> = {
  VINEDOS: { from: [11, 1], to: [4, 15], label: 'Viñedo en reposo invernal (sin hojas)' },
  FRUTALES: { from: [10, 15], to: [4, 30], label: 'Frutal caducifolio en reposo invernal' },
};

/** Umbral de NDVI para considerar un píxel con vegetación activa, por tipo de activo. */
export const NDVI_VEGETATION_THRESHOLD: Record<string, number> = {
  CULTIVOS: 0.4,
  FORESTAL: 0.5,
  FRUTALES: 0.35,
  VINEDOS: 0.3,
};

export const vegetationThresholdFor = (assetTypeCode: string): number =>
  NDVI_VEGETATION_THRESHOLD[assetTypeCode] ?? 0.4;

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const monthDay = (d: Date) => (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
const fmtDate = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/');

export function expectedVegetation(
  assetTypeCode: string,
  metadata: Record<string, unknown>,
  at: Date,
): PhenologyExpectation {
  if (assetTypeCode === 'CULTIVOS') {
    const sowing = parseDate(metadata.fecha_siembra);
    if (!sowing) {
      return {
        stage: 'SIN_DATOS',
        vegetationExpected: true,
        reason: 'Sin fecha de siembra declarada: se asume cultivo implantado.',
        daysSinceSowing: null,
      };
    }
    const days = Math.floor((at.getTime() - sowing.getTime()) / DAY_MS);
    const crop = typeof metadata.cultivo === 'string' ? metadata.cultivo : null;
    const cycle = (crop && CROP_CYCLE_DAYS[crop]) || DEFAULT_CYCLE_DAYS;
    if (days < 0) {
      return {
        stage: 'PRE_SIEMBRA',
        vegetationExpected: false,
        reason: `Siembra declarada para el ${fmtDate(sowing)}: todavía no hay cultivo en el lote.`,
        daysSinceSowing: days,
      };
    }
    if (days < ((crop && ESTABLISHMENT_DAYS[crop]) || DEFAULT_ESTABLISHMENT_DAYS)) {
      return {
        stage: 'IMPLANTACION',
        vegetationExpected: false,
        reason: `Cultivo en implantación (${days} días desde la siembra del ${fmtDate(sowing)}): el canopeo todavía no cubre el lote.`,
        daysSinceSowing: days,
      };
    }
    if (days > cycle) {
      return {
        stage: 'CICLO_CUMPLIDO',
        vegetationExpected: false,
        reason: `El ciclo de ${crop ?? 'cultivo'} (~${cycle} días) está cumplido: cosecha probable.`,
        daysSinceSowing: days,
      };
    }
    return {
      stage: 'CRECIMIENTO',
      vegetationExpected: true,
      reason: `${crop ?? 'Cultivo'} en crecimiento (${days} días desde la siembra).`,
      daysSinceSowing: days,
    };
  }
  const season = ACTIVE_SEASON[assetTypeCode];
  if (season) {
    const md = monthDay(at);
    const from = season.from[0] * 100 + season.from[1];
    const to = season.to[0] * 100 + season.to[1];
    const active = md >= from || md <= to; // la temporada cruza el año
    return active
      ? {
          stage: 'TEMPORADA_ACTIVA',
          vegetationExpected: true,
          reason: 'Temporada de follaje activo.',
          daysSinceSowing: null,
        }
      : {
          stage: 'REPOSO',
          vegetationExpected: false,
          reason: `${season.label}: NDVI bajo esperado.`,
          daysSinceSowing: null,
        };
  }
  return {
    stage: 'PERMANENTE',
    vegetationExpected: true,
    reason: 'Cobertura vegetal permanente.',
    daysSinceSowing: null,
  };
}
