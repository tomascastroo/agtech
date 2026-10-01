import { Module } from '@nestjs/common';
import { LoggingModule } from './common/logging/logging.module.js';
import { QueuesModule } from './common/queues/queues.module.js';
import { AppConfigModule } from './config/app-config.js';
import { DatabaseModule } from './database/database.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { MonitoringEventsModule } from './modules/monitoring/monitoring-events.module.js';
import { MonitoringWorkerModule } from './modules/monitoring/monitoring-worker.module.js';
import { ReportsWorkerModule } from './modules/reports/reports-worker.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { VerificationWorkerModule } from './modules/verification/verification-worker.module.js';

/** Proceso worker: consume las colas de verificación, informes y monitoreo. */
@Module({
  imports: [
    AppConfigModule,
    LoggingModule.forService('agrogarantias-worker'),
    DatabaseModule,
    QueuesModule,
    StorageModule,
    AuditModule,
    MonitoringEventsModule,
    VerificationWorkerModule,
    ReportsWorkerModule,
    MonitoringWorkerModule,
  ],
})
export class WorkerModule {}
