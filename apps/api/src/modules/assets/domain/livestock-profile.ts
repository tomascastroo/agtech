/**
 * Tipo de producción ganadera y cómo cambia la forma de verificar.
 *
 * No se asume que un método sirve igual para todos:
 *  - FEEDLOT: corrales con alta concentración de animales; se pueden instalar cámaras fijas. El
 *    escáner de corral es el método natural; la oclusión es esperable (umbral más alto) y cada
 *    corral es una zona distinta.
 *  - CRÍA: rodeos que se juntan en la manga, la aguada o en agrupamientos. El paso por la manga
 *    (escáner fijo) es el único conteo comparable con lo declarado.
 *  - PASTOREO: animales dispersos en potreros grandes; la cobertura siempre es limitada. Ninguna
 *    vista única permite afirmar el stock total: barridos, corrales y fotos son cota inferior.
 *
 * El tipo se deriva del campo `sistema_productivo` del rodeo (catálogo BOVINOS), sin agregar
 * campos nuevos a la declaración.
 */
import type { QualityThresholds, ScanMode } from '../../scans/domain/scan.types.js';

export const LIVESTOCK_SYSTEMS = ['FEEDLOT', 'CRIA', 'PASTOREO'] as const;
export type LivestockSystem = (typeof LIVESTOCK_SYSTEMS)[number];

/** `sistema_productivo` declarado → tipo de producción. */
const BY_DECLARED_SYSTEM: Record<string, LivestockSystem> = {
  Feedlot: 'FEEDLOT',
  Cría: 'CRIA',
  Tambo: 'CRIA',
  'Ciclo completo': 'CRIA',
  Recría: 'PASTOREO',
  Invernada: 'PASTOREO',
};

export interface LivestockProfile {
  system: LivestockSystem;
  label: string;
  /** De dónde salió el tipo: el sistema productivo declarado o el valor por defecto. */
  declaredSystem: string | null;
  inferred: boolean;
  /** Modos del escáner recomendados, en orden de preferencia. */
  recommendedModes: ScanMode[];
  /** Modos cuyo conteo puede compararse con lo declarado (censo). El resto es cota inferior. */
  censusModes: ScanMode[];
  /** Por qué se recomiendan esos modos (lo ve el productor). */
  guidance: string;
  /** Advertencia de cobertura para el banco. */
  coverageNote: string;
  quality: Partial<QualityThresholds>;
  /**
   * Distancia mínima (m) entre dos escaneos de corral con GPS para considerarlos zonas distintas
   * y sumarlos. null: se usa la regla general (300 m).
   */
  distinctZoneMinDistanceM: number | null;
}

const PROFILES: Record<LivestockSystem, Omit<LivestockProfile, 'declaredSystem' | 'inferred'>> = {
  FEEDLOT: {
    system: 'FEEDLOT',
    label: 'Feedlot',
    recommendedModes: ['PEN', 'FIXED', 'PHOTO'],
    censusModes: ['FIXED', 'CHUTE'],
    guidance:
      'Escaneá cada corral con el escáner de corral, desde un lugar alto (comedero, pasarela). ' +
      'Si el corral tiene una manga o una puerta de paso, el escáner fijo permite un conteo ' +
      'comparable. Un corral por escaneo.',
    coverageNote:
      'Feedlot: alta concentración de animales; los ocultos detrás de otros no se cuentan. Cada ' +
      'corral escaneado suma solo si su ubicación GPS lo distingue de los demás.',
    quality: { occlusionLimit: 0.5 },
    distinctZoneMinDistanceM: 40,
  },
  CRIA: {
    system: 'CRIA',
    label: 'Cría',
    recommendedModes: ['FIXED', 'PEN', 'SWEEP', 'PHOTO'],
    censusModes: ['FIXED', 'CHUTE'],
    guidance:
      'El conteo más confiable es el paso por la manga con el escáner fijo. En la aguada o en ' +
      'un agrupamiento usá el escáner de corral; en el potrero, el barrido.',
    coverageNote:
      'Cría: solo el paso completo por la manga es comparable con lo declarado; aguadas, ' +
      'agrupamientos y barridos son cota inferior.',
    quality: {},
    distinctZoneMinDistanceM: null,
  },
  PASTOREO: {
    system: 'PASTOREO',
    label: 'Pastoreo',
    recommendedModes: ['SWEEP', 'PEN', 'PHOTO', 'FIXED'],
    censusModes: ['FIXED', 'CHUTE'],
    guidance:
      'Los animales están dispersos: hacé barridos desde puntos altos o escaneá los grupos con ' +
      'el escáner de corral. Si se encierran en la manga, el escáner fijo da un conteo completo.',
    coverageNote:
      'Pastoreo: la cobertura es limitada. Una vista o un barrido no permiten afirmar el stock ' +
      'total del establecimiento; el conteo es una cota inferior.',
    quality: {},
    distinctZoneMinDistanceM: null,
  },
};

export function livestockProfile(metadata: Record<string, unknown> | null): LivestockProfile {
  const declared =
    typeof metadata?.sistema_productivo === 'string' ? metadata.sistema_productivo : null;
  const system = (declared && BY_DECLARED_SYSTEM[declared]) || null;
  // Sin sistema reconocible: perfil de cría (el más común) marcado como inferido.
  return {
    ...PROFILES[system ?? 'CRIA'],
    declaredSystem: declared,
    inferred: system === null,
  };
}
