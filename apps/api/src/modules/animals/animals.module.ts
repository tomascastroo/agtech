import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnimalIdentificationEntity } from './infrastructure/animal-identification.entity.js';
import { AnimalObservationEntity } from './infrastructure/animal-observation.entity.js';
import { AnimalEntity } from './infrastructure/animal.entity.js';
import { AnimalsController } from './presentation/animals.controller.js';
import { RfidController } from './presentation/rfid.controller.js';
import { LivestockMonitoringService } from './application/livestock-monitoring.service.js';
import { RfidService } from './application/rfid.service.js';
import { RfidObservationEntity } from './infrastructure/rfid-observation.entity.js';
import { AssetsModule } from '../assets/assets.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AnimalEntity,
      AnimalIdentificationEntity,
      AnimalObservationEntity,
      RfidObservationEntity,
    ]),
    AssetsModule,
  ],
  controllers: [AnimalsController, RfidController],
  providers: [RfidService, LivestockMonitoringService],
  exports: [RfidService, LivestockMonitoringService],
})
export class AnimalsModule {}
