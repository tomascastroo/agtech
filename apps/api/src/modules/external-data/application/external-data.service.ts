import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  LivestockRegistryProvider,
  type RegistryLookup,
} from '../domain/livestock-registry.provider.js';
import { ExternalDataSnapshotEntity } from '../infrastructure/external-data-snapshot.entity.js';

/**
 * Consulta fuentes externas y guarda un snapshot inmutable de la respuesta: la verificación
 * queda respaldada por lo que la fuente informó en ese momento, aunque luego cambie.
 */
@Injectable()
export class ExternalDataService {
  constructor(
    private readonly registry: LivestockRegistryProvider,
    @InjectRepository(ExternalDataSnapshotEntity)
    private readonly snapshots: Repository<ExternalDataSnapshotEntity>,
  ) {}

  async livestockRegistry(input: {
    organizationId: string;
    renspa: string;
    assetId: string;
    establishmentId: string;
    verificationRunId: string;
  }): Promise<{ lookup: RegistryLookup; snapshot: ExternalDataSnapshotEntity }> {
    let lookup: RegistryLookup;
    try {
      lookup = await this.registry.lookupByRenspa(input.renspa);
    } catch (error) {
      lookup = { status: 'ERROR', reason: (error as Error).message };
    }
    const snapshot = await this.snapshots.save(
      this.snapshots.create({
        organizationId: input.organizationId,
        source: this.registry.source,
        provider: this.registry.name,
        subjectType: 'RENSPA',
        subjectRef: input.renspa,
        assetId: input.assetId,
        establishmentId: input.establishmentId,
        verificationRunId: input.verificationRunId,
        status: lookup.status,
        isSimulated: this.registry.simulated,
        payload:
          lookup.status === 'OK'
            ? { ...lookup.record }
            : lookup.status === 'ERROR'
              ? { reason: lookup.reason }
              : {},
      }),
    );
    return { lookup, snapshot };
  }

  forRun(organizationId: string, verificationRunId: string) {
    return this.snapshots.find({
      where: { organizationId, verificationRunId },
      order: { fetchedAt: 'ASC' },
    });
  }

  providerInfo() {
    return {
      name: this.registry.name,
      source: this.registry.source,
      simulated: this.registry.simulated,
    };
  }
}
