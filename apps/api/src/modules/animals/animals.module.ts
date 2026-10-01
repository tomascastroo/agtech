import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnimalIdentificationEntity } from './infrastructure/animal-identification.entity.js';
import { AnimalObservationEntity } from './infrastructure/animal-observation.entity.js';
import { AnimalEntity } from './infrastructure/animal.entity.js';
import { AnimalsController } from './presentation/animals.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([AnimalEntity, AnimalIdentificationEntity, AnimalObservationEntity]),
  ],
  controllers: [AnimalsController],
})
export class AnimalsModule {}
