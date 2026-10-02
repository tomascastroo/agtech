/**
 * Fuente OFICIAL de datos (p. ej. SENASA para RENSPA, titular y existencias). Es la única capa que
 * puede marcar un dato como "verificado por fuente oficial". Hoy no hay ninguna conectada: SENASA
 * no publica una API abierta para estas consultas y el acceso requiere un convenio institucional
 * (ver docs/integrations/senasa.md). No se hace scraping ni se inventan respuestas.
 */
export type OfficialConnectionStatus = 'NOT_CONNECTED' | 'CONNECTED';

export interface OfficialSourceInfo {
  code: string;
  name: string;
  status: OfficialConnectionStatus;
  /** Qué podría verificar si estuviera conectada. */
  scope: string[];
  reason: string;
}

export abstract class OfficialDataProvider {
  abstract info(): OfficialSourceInfo;
}

export class SenasaOfficialDataProvider extends OfficialDataProvider {
  info(): OfficialSourceInfo {
    return {
      code: 'SENASA',
      name: 'SENASA',
      status: 'NOT_CONNECTED',
      scope: ['RENSPA vigente', 'Titular del RENSPA', 'Establecimiento', 'Existencias bovinas'],
      reason:
        'Sin integración oficial: requiere convenio institucional, credenciales y la especificación del servicio.',
    };
  }
}
