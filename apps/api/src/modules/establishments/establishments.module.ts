import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EstablishmentsService } from './application/establishments.service.js';
import { EstablishmentLocationEntity } from './infrastructure/establishment-location.entity.js';
import { EstablishmentEntity } from './infrastructure/establishment.entity.js';
import { EstablishmentsRepository } from './infrastructure/establishments.repository.js';
import { EstablishmentsController } from './presentation/establishments.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([EstablishmentEntity, EstablishmentLocationEntity])],
  controllers: [EstablishmentsController],
  providers: [EstablishmentsService, EstablishmentsRepository],
  exports: [EstablishmentsService, EstablishmentsRepository],
})
export class EstablishmentsModule {}
