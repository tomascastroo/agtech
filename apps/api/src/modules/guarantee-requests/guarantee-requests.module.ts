import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetsModule } from '../assets/assets.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { EstablishmentsModule } from '../establishments/establishments.module.js';
import { EvidenceModule } from '../evidence/evidence.module.js';
import { VerificationModule } from '../verification/verification.module.js';
import { GuaranteeRequestsService } from './application/guarantee-requests.service.js';
import { GuaranteeRequestEntity } from './infrastructure/guarantee-request.entity.js';
import {
  GuaranteeRequestsController,
  ProducerRequestsController,
} from './presentation/guarantee-requests.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([GuaranteeRequestEntity]),
    AssetsModule,
    DocumentsModule,
    EstablishmentsModule,
    EvidenceModule,
    VerificationModule,
  ],
  controllers: [GuaranteeRequestsController, ProducerRequestsController],
  providers: [GuaranteeRequestsService],
})
export class GuaranteeRequestsModule {}
