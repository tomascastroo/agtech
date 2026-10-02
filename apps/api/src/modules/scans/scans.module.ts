import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GuaranteeRequestsModule } from '../guarantee-requests/guarantee-requests.module.js';
import { BovineIndividualEntity } from '../animals/infrastructure/bovine-individual.entity.js';
import { BovineIndividualsService } from './application/bovine-individuals.service.js';
import { ScansService } from './application/scans.service.js';
import { ChuteCaptureEntity } from './infrastructure/chute-capture.entity.js';
import { ScanFrameEntity } from './infrastructure/scan-frame.entity.js';
import { ScanSessionEntity } from './infrastructure/scan-session.entity.js';
import { ProducerScansController, ScansController } from './presentation/scans.controller.js';

/** Escáner de Bovinos (API): sesiones, subida reanudable de cuadros y consulta. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ScanSessionEntity,
      ScanFrameEntity,
      ChuteCaptureEntity,
      BovineIndividualEntity,
    ]),
    GuaranteeRequestsModule,
  ],
  controllers: [ProducerScansController, ScansController],
  providers: [ScansService, BovineIndividualsService],
})
export class ScansModule {}
