import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetsModule } from '../assets/assets.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { EstablishmentsModule } from '../establishments/establishments.module.js';
import { EvidenceModule } from '../evidence/evidence.module.js';
import { VerificationModule } from '../verification/verification.module.js';
import { ExternalDataModule } from '../external-data/external-data.module.js';
import { GuaranteeRequestsService } from './application/guarantee-requests.service.js';
import { RequestDocumentationService } from './application/request-documentation.service.js';
import { GuaranteeRequestRequirementEntity } from './infrastructure/guarantee-request-requirement.entity.js';
import { CollateralCoreModule } from '../collateral/collateral-core.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { InformationRequestEntity } from './infrastructure/information-request.entity.js';
import { GuaranteeRequestEntity } from './infrastructure/guarantee-request.entity.js';
import {
  GuaranteeRequestsController,
  ProducerPortalController,
  ProducerRequestsController,
} from './presentation/guarantee-requests.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GuaranteeRequestEntity,
      InformationRequestEntity,
      GuaranteeRequestRequirementEntity,
    ]),
    ExternalDataModule,
    AuthModule,
    AssetsModule,
    DocumentsModule,
    EstablishmentsModule,
    EvidenceModule,
    VerificationModule,
    CollateralCoreModule,
  ],
  controllers: [GuaranteeRequestsController, ProducerRequestsController, ProducerPortalController],
  providers: [GuaranteeRequestsService, RequestDocumentationService],
  exports: [GuaranteeRequestsService, RequestDocumentationService],
})
export class GuaranteeRequestsModule {}
