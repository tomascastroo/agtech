import { Injectable } from '@nestjs/common';
import {
  LivestockRegistryProvider,
  type LivestockRegistryRecord,
  type RegistryLookup,
} from '../domain/livestock-registry.provider.js';

/**
 * Registro ganadero SIMULADO con fichas de desarrollo para los establecimientos demo.
 * Reemplazar por un adapter oficial cuando exista un convenio/API disponible.
 */
const FIXTURES: Record<string, LivestockRegistryRecord> = {
  '06.687.0.01542/00': {
    renspa: '06.687.0.01542/00',
    holderTaxId: '30-71548963-1',
    holderName: 'Agropecuaria La Esperanza S.A.',
    establishmentName: 'La Esperanza',
    status: 'ACTIVO',
    registeredHeads: 1540,
    stockByCategory: { VACAS: 820, VAQUILLONAS: 210, TERNEROS: 395, NOVILLITOS: 75, TOROS: 40 },
    lastCampaign: { name: 'Vacunación antiaftosa — 1.ª campaña 2026', date: '2026-05-18' },
  },
  '30.113.0.00412/00': {
    renspa: '30.113.0.00412/00',
    holderTaxId: '30-69876543-3',
    holderName: 'Hacienda El Trébol S.A.',
    establishmentName: 'El Trébol',
    status: 'ACTIVO',
    registeredHeads: 835,
    stockByCategory: { VACAS: 330, VAQUILLONAS: 95, TERNEROS: 210, NOVILLOS: 180, TOROS: 20 },
    lastCampaign: { name: 'Vacunación antiaftosa — 1.ª campaña 2026', date: '2026-05-04' },
  },
  '14.091.0.00733/00': {
    renspa: '14.091.0.00733/00',
    holderTaxId: '30-68321654-9',
    holderName: 'Ganadera Santa Clara S.R.L.',
    establishmentName: 'Santa Clara',
    status: 'ACTIVO',
    registeredHeads: 652,
    stockByCategory: { VACAS: 360, VAQUILLONAS: 70, TERNEROS: 200, TOROS: 22 },
    lastCampaign: { name: 'Vacunación antiaftosa — 1.ª campaña 2026', date: '2026-04-27' },
  },
};

@Injectable()
export class MockLivestockRegistryProvider extends LivestockRegistryProvider {
  readonly name = 'mock-senasa';
  readonly source = 'SENASA_RENSPA';
  readonly simulated = true;

  async lookupByRenspa(renspa: string): Promise<RegistryLookup> {
    const record = FIXTURES[renspa];
    return record ? { status: 'OK', record } : { status: 'NOT_FOUND' };
  }
}
