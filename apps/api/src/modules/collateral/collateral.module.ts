import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { EvidenceModule } from '../evidence/evidence.module.js';
import { ExternalDataModule } from '../external-data/external-data.module.js';
import { VerificationModule } from '../verification/verification.module.js';
import { CollateralCommandsService } from './application/collateral-commands.service.js';
import { CollateralQueryService } from './application/collateral-query.service.js';
import { CollateralCoreModule } from './collateral-core.module.js';
import {
  CollateralController,
  ProducerDeclarationController,
} from './presentation/collateral.controller.js';

/** API HTTP de la garantía bovina (Asset Passport, dashboard, comandos). */
@Module({
  imports: [
    CollateralCoreModule,
    DocumentsModule,
    EvidenceModule,
    VerificationModule,
    ExternalDataModule,
  ],
  controllers: [CollateralController, ProducerDeclarationController],
  providers: [CollateralCommandsService, CollateralQueryService],
  exports: [CollateralCommandsService],
})
export class CollateralModule {}
