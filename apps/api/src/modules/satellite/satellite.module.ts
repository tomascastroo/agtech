import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../../config/app-config.js';
import { EvidenceModule } from '../evidence/evidence.module.js';
import { ObjectStorage } from '../storage/object-storage.js';
import { SatelliteIngestionService } from './application/satellite-ingestion.service.js';
import { SatelliteImageryProvider } from './domain/satellite.provider.js';
import { MockSatelliteProvider } from './infrastructure/mock-satellite.provider.js';
import { Sentinel2SatelliteProvider } from './infrastructure/sentinel2-satellite.provider.js';
import { SatelliteImageEntity } from './infrastructure/satellite-image.entity.js';
import { SatelliteObservationEntity } from './infrastructure/satellite-observation.entity.js';
import { SatelliteController } from './presentation/satellite.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([SatelliteImageEntity, SatelliteObservationEntity]),
    EvidenceModule,
  ],
  controllers: [SatelliteController],
  providers: [
    SatelliteIngestionService,
    {
      provide: SatelliteImageryProvider,
      inject: [AppConfig, ObjectStorage],
      useFactory: (config: AppConfig, storage: ObjectStorage): SatelliteImageryProvider =>
        config.env.SATELLITE_PROVIDER === 'stac'
          ? new Sentinel2SatelliteProvider(config)
          : new MockSatelliteProvider(storage),
    },
  ],
  exports: [SatelliteImageryProvider, SatelliteIngestionService],
})
export class SatelliteModule {}
