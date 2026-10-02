import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalDataService } from './application/external-data.service.js';
import {
  OfficialDataProvider,
  SenasaOfficialDataProvider,
} from './domain/official-data.provider.js';
import { LivestockRegistryProvider } from './domain/livestock-registry.provider.js';
import { ExternalDataSnapshotEntity } from './infrastructure/external-data-snapshot.entity.js';
import { AppConfig } from '../../config/app-config.js';
import { OfficialSenasaRegistryProvider } from './infrastructure/official-senasa-registry.provider.js';
import { MockLivestockRegistryProvider } from './infrastructure/mock-livestock-registry.provider.js';

@Module({
  imports: [TypeOrmModule.forFeature([ExternalDataSnapshotEntity])],
  providers: [
    ExternalDataService,
    // REGISTRY_PROVIDER=mock (fichas SIMULADAS) | senasa (adapter oficial, requiere convenio).
    {
      provide: LivestockRegistryProvider,
      inject: [AppConfig],
      useFactory: (config: AppConfig): LivestockRegistryProvider =>
        config.env.REGISTRY_PROVIDER === 'senasa'
          ? new OfficialSenasaRegistryProvider(config)
          : new MockLivestockRegistryProvider(),
    },
    { provide: OfficialDataProvider, useClass: SenasaOfficialDataProvider },
  ],
  exports: [ExternalDataService, OfficialDataProvider],
})
export class ExternalDataModule {}
