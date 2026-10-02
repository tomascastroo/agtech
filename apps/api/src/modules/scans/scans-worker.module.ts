import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComputerVisionModule } from '../computer-vision/computer-vision.module.js';
import { EvidenceModule } from '../evidence/evidence.module.js';
import { VerificationModule } from '../verification/verification.module.js';
import { ScanProcessingService } from './application/scan-processing.service.js';
import { ScanFrameEntity } from './infrastructure/scan-frame.entity.js';
import { ScanSessionEntity } from './infrastructure/scan-session.entity.js';
import { ScansProcessor } from './infrastructure/scans.processor.js';

/** Conteo oficial de escaneos (solo se carga en el proceso worker). */
@Module({
  imports: [
    TypeOrmModule.forFeature([ScanSessionEntity, ScanFrameEntity]),
    ComputerVisionModule,
    EvidenceModule,
    VerificationModule,
  ],
  providers: [ScanProcessingService, ScansProcessor],
  exports: [ScanProcessingService],
})
export class ScansWorkerModule {}
