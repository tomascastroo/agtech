import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentsModule } from '../documents/documents.module.js';
import { ExternalDataModule } from '../external-data/external-data.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { UsersModule } from '../users/users.module.js';
import { VerificationModule } from '../verification/verification.module.js';
import { ReportDataBuilder } from './application/report-data.builder.js';
import { ReportsService } from './application/reports.service.js';
import { ReportDocumentEntity } from './infrastructure/report-document.entity.js';
import { ReportEntity } from './infrastructure/report.entity.js';
import { ReportsRepository } from './infrastructure/reports.repository.js';
import { ReportsController } from './presentation/reports.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReportEntity, ReportDocumentEntity]),
    VerificationModule,
    DocumentsModule,
    ExternalDataModule,
    OrganizationsModule,
    UsersModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRepository, ReportDataBuilder],
  exports: [ReportsService],
})
export class ReportsModule {}
