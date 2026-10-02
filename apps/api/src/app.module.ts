import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggingModule } from './common/logging/logging.module.js';
import { QueuesModule } from './common/queues/queues.module.js';
import { AppConfig, AppConfigModule } from './config/app-config.js';
import { DatabaseModule } from './database/database.module.js';
import { AlertsModule } from './modules/alerts/alerts.module.js';
import { AnimalsModule } from './modules/animals/animals.module.js';
import { AssetsModule } from './modules/assets/assets.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { DevicesModule } from './modules/devices/devices.module.js';
import { DocumentsModule } from './modules/documents/documents.module.js';
import { EstablishmentsModule } from './modules/establishments/establishments.module.js';
import { EvidenceModule } from './modules/evidence/evidence.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { GuaranteeRequestsModule } from './modules/guarantee-requests/guarantee-requests.module.js';
import { ScansModule } from './modules/scans/scans.module.js';
import { IntegrationsModule } from './modules/integrations/integrations.module.js';
import { MonitoringEventsModule } from './modules/monitoring/monitoring-events.module.js';
import { MonitoringModule } from './modules/monitoring/monitoring.module.js';
import { OrganizationsModule } from './modules/organizations/organizations.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { SatelliteModule } from './modules/satellite/satellite.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { VerificationModule } from './modules/verification/verification.module.js';
import { ObservabilityModule } from './common/observability/error-reporter.js';

/** Proceso HTTP (API REST). El procesamiento pesado vive en WorkerModule. */
@Module({
  imports: [
    AppConfigModule,
    LoggingModule.forService('agrogarantias-api'),
    ObservabilityModule,
    DatabaseModule,
    QueuesModule,
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => [
        { name: 'default', ttl: 60_000, limit: config.env.RATE_LIMIT_PER_MINUTE },
      ],
    }),
    StorageModule,
    AuditModule,
    MonitoringEventsModule,
    HealthModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    EstablishmentsModule,
    AssetsModule,
    DocumentsModule,
    EvidenceModule,
    DevicesModule,
    SatelliteModule,
    VerificationModule,
    AlertsModule,
    ReportsModule,
    MonitoringModule,
    AnimalsModule,
    IntegrationsModule,
    GuaranteeRequestsModule,
    ScansModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
