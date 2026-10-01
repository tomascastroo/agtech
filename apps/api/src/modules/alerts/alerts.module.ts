import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertEngineService } from './application/alert-engine.service.js';
import { AlertsService } from './application/alerts.service.js';
import { AlertRuleEntity } from './infrastructure/alert-rule.entity.js';
import { AlertEntity } from './infrastructure/alert.entity.js';
import { AlertsRepository } from './infrastructure/alerts.repository.js';
import { AlertsController } from './presentation/alerts.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([AlertEntity, AlertRuleEntity])],
  controllers: [AlertsController],
  providers: [AlertEngineService, AlertsService, AlertsRepository],
  exports: [AlertEngineService, AlertsRepository],
})
export class AlertsModule {}
