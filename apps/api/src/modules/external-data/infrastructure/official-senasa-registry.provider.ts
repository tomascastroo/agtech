import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../config/app-config.js';
import {
  LivestockRegistryProvider,
  type RegistryLookup,
} from '../domain/livestock-registry.provider.js';

/**
 * Adapter para una integración OFICIAL con SENASA (RENSPA: existencia, estado/vigencia, titular,
 * establecimiento y existencias). SENASA no publica una API REST abierta para estas consultas:
 * el acceso se gestiona institucionalmente (convenio / web service con credenciales). Hasta
 * contar con esa especificación este adapter NO consulta nada ni hace scraping: responde ERROR
 * explicando qué falta. Ver docs/integrations/senasa.md.
 */
@Injectable()
export class OfficialSenasaRegistryProvider extends LivestockRegistryProvider {
  readonly name = 'senasa-official';
  readonly source = 'SENASA_RENSPA';
  readonly simulated = false;

  constructor(private readonly config: AppConfig) {
    super();
  }

  get configured(): boolean {
    const env = this.config.env;
    return Boolean(env.SENASA_API_URL && env.SENASA_CLIENT_ID && env.SENASA_CLIENT_SECRET);
  }

  async lookupByRenspa(_renspa: string): Promise<RegistryLookup> {
    if (!this.configured) {
      return {
        status: 'ERROR',
        reason:
          'Integración oficial con SENASA sin credenciales configuradas (SENASA_API_URL, SENASA_CLIENT_ID, SENASA_CLIENT_SECRET).',
      };
    }
    return {
      status: 'ERROR',
      reason:
        'Integración oficial con SENASA pendiente: falta la especificación del servicio acordada en el convenio institucional.',
    };
  }
}
