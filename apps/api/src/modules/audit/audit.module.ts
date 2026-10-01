import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditService } from './application/audit.service.js';
import { AuditLogEntity } from './infrastructure/audit-log.entity.js';
import { AuditController } from './presentation/audit.controller.js';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntity])],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
