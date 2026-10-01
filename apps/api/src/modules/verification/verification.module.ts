import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetsModule } from '../assets/assets.module.js';
import { ExternalDataModule } from '../external-data/external-data.module.js';
import { GuaranteesService } from './application/guarantees.service.js';
import { VerificationQueryService } from './application/verification-query.service.js';
import { VerificationRequestService } from './application/verification-request.service.js';
import { VerificationEvidenceEntity } from './infrastructure/verification-evidence.entity.js';
import { VerificationMetricEntity } from './infrastructure/verification-metric.entity.js';
import { VerificationResultEntity } from './infrastructure/verification-result.entity.js';
import { VerificationRunEntity } from './infrastructure/verification-run.entity.js';
import { VerificationRepository } from './infrastructure/verification.repository.js';
import { VerificationController } from './presentation/verification.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VerificationRunEntity,
      VerificationResultEntity,
      VerificationMetricEntity,
      VerificationEvidenceEntity,
    ]),
    AssetsModule,
    ExternalDataModule,
  ],
  controllers: [VerificationController],
  providers: [
    VerificationRepository,
    VerificationRequestService,
    VerificationQueryService,
    GuaranteesService,
  ],
  exports: [VerificationRepository, VerificationRequestService],
})
export class VerificationModule {}
