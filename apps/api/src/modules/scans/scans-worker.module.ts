import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnimalsModule } from '../animals/animals.module.js';
import { ComputerVisionModule } from '../computer-vision/computer-vision.module.js';
import { EvidenceModule } from '../evidence/evidence.module.js';
import { VerificationModule } from '../verification/verification.module.js';
import { ChuteProcessingService } from './application/chute-processing.service.js';
import { ScanProcessingService } from './application/scan-processing.service.js';
import { ChuteCaptureEntity } from './infrastructure/chute-capture.entity.js';
import { ScanFrameEntity } from './infrastructure/scan-frame.entity.js';
import { ScanSessionEntity } from './infrastructure/scan-session.entity.js';
import { ScansProcessor } from './infrastructure/scans.processor.js';

/** Conteo oficial de escaneos (solo se carga en el proceso worker). */
@Module({
  imports: [
    TypeOrmModule.forFeature([ScanSessionEntity, ScanFrameEntity, ChuteCaptureEntity]),
    AnimalsModule,
    ComputerVisionModule,
    EvidenceModule,
    VerificationModule,
  ],
  providers: [ScanProcessingService, ChuteProcessingService, ScansProcessor],
  exports: [ScanProcessingService],
})
export class ScansWorkerModule {}
