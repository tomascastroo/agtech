export interface LivestockRegistryRecord {
  renspa: string;
  holderTaxId: string;
  holderName: string;
  establishmentName: string;
  status: 'ACTIVO' | 'INACTIVO';
  registeredHeads: number;
  stockByCategory: Record<string, number>;
  lastCampaign: { name: string; date: string };
}

export type RegistryLookup =
  | { status: 'OK'; record: LivestockRegistryRecord }
  | { status: 'NOT_FOUND' }
  | { status: 'ERROR'; reason: string };

/**
 * Puerto hacia registros oficiales de existencias ganaderas (p. ej. SENASA / RENSPA).
 * No existe en el MVP una integración oficial con credenciales: se provee un adapter simulado.
 */
export abstract class LivestockRegistryProvider {
  abstract readonly name: string;
  abstract readonly source: string;
  abstract readonly simulated: boolean;
  abstract lookupByRenspa(renspa: string): Promise<RegistryLookup>;
}
