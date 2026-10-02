import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GuaranteeRequestsModule } from '../guarantee-requests/guarantee-requests.module.js';
import { ScansService } from './application/scans.service.js';
import { ScanFrameEntity } from './infrastructure/scan-frame.entity.js';
import { ScanSessionEntity } from './infrastructure/scan-session.entity.js';
import { ProducerScansController, ScansController } from './presentation/scans.controller.js';

/** Escáner de Bovinos (API): sesiones, subida reanudable de cuadros y consulta. */
@Module({
  imports: [
    TypeOrmModule.forFeature([ScanSessionEntity, ScanFrameEntity]),
    GuaranteeRequestsModule,
  ],
  controllers: [ProducerScansController, ScansController],
  providers: [ScansService],
})
export class ScansModule {}
