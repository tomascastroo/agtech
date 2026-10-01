import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module.js';
import { AssetsModule } from '../assets/assets.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { EvidenceModule } from '../evidence/evidence.module.js';
import { VerificationModule } from '../verification/verification.module.js';
import { MonitoringSchedulerService } from './application/monitoring-scheduler.service.js';
import { MonitoringProcessor } from './infrastructure/monitoring.processor.js';

@Module({
  imports: [AssetsModule, DocumentsModule, EvidenceModule, AlertsModule, VerificationModule],
  providers: [MonitoringSchedulerService, MonitoringProcessor],
  exports: [MonitoringSchedulerService],
})
export class MonitoringWorkerModule {}
