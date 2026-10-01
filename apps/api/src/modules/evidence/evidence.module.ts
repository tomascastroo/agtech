import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetsModule } from '../assets/assets.module.js';
import { EvidenceRecorder } from './application/evidence-recorder.js';
import { EvidenceService } from './application/evidence.service.js';
import { EvidenceSourceEntity } from './infrastructure/evidence-source.entity.js';
import { EvidenceEntity } from './infrastructure/evidence.entity.js';
import { EvidenceRepository } from './infrastructure/evidence.repository.js';
import { EvidenceController } from './presentation/evidence.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([EvidenceEntity, EvidenceSourceEntity]), AssetsModule],
  controllers: [EvidenceController],
  providers: [EvidenceService, EvidenceRecorder, EvidenceRepository],
  exports: [EvidenceRecorder, EvidenceRepository, EvidenceService],
})
export class EvidenceModule {}
