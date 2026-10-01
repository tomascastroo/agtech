import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalDataService } from './application/external-data.service.js';
import { LivestockRegistryProvider } from './domain/livestock-registry.provider.js';
import { ExternalDataSnapshotEntity } from './infrastructure/external-data-snapshot.entity.js';
import { MockLivestockRegistryProvider } from './infrastructure/mock-livestock-registry.provider.js';

@Module({
  imports: [TypeOrmModule.forFeature([ExternalDataSnapshotEntity])],
  providers: [
    ExternalDataService,
    // Único adapter disponible en el MVP (REGISTRY_PROVIDER=mock).
    { provide: LivestockRegistryProvider, useClass: MockLivestockRegistryProvider },
  ],
  exports: [ExternalDataService],
})
export class ExternalDataModule {}
