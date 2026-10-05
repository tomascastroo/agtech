import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module.js';
import { CollateralCoreModule } from '../collateral/collateral-core.module.js';
import { AssetsModule } from '../assets/assets.module.js';
import { ComputerVisionModule } from '../computer-vision/computer-vision.module.js';
import { DevicesModule } from '../devices/devices.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { EstablishmentsModule } from '../establishments/establishments.module.js';
import { EvidenceModule } from '../evidence/evidence.module.js';
import { ExternalDataModule } from '../external-data/external-data.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { SatelliteModule } from '../satellite/satellite.module.js';
import { CameraCaptureService } from './application/pipeline/camera-capture.service.js';
import { ContextLoader } from './application/pipeline/context-loader.js';
import { CrossChecksService } from './application/pipeline/cross-checks.service.js';
import { ImageAnalysisService } from './application/pipeline/image-analysis.service.js';
import { EvidenceReviewStrategy } from './application/pipeline/strategies/evidence-review.strategy.js';
import { LivestockCountingStrategy } from './application/pipeline/strategies/livestock-counting.strategy.js';
import { VegetationAreaStrategy } from './application/pipeline/strategies/vegetation-area.strategy.js';
import { VerificationPipeline } from './application/pipeline/verification-pipeline.js';
import { VerificationProcessor } from './infrastructure/verification.processor.js';
import { VerificationModule } from './verification.module.js';

/** Procesamiento asíncrono de verificaciones (solo se carga en el proceso worker). */
@Module({
  imports: [
    VerificationModule,
    AssetsModule,
    DocumentsModule,
    AlertsModule,
    DevicesModule,
    EvidenceModule,
    SatelliteModule,
    ComputerVisionModule,
    ExternalDataModule,
    EstablishmentsModule,
    OrganizationsModule,
    CollateralCoreModule,
  ],
  providers: [
    VerificationPipeline,
    ContextLoader,
    CrossChecksService,
    CameraCaptureService,
    ImageAnalysisService,
    LivestockCountingStrategy,
    VegetationAreaStrategy,
    EvidenceReviewStrategy,
    VerificationProcessor,
  ],
  exports: [VerificationPipeline],
})
export class VerificationWorkerModule {}
