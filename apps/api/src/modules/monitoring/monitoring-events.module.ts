import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MonitoringConfigService } from './application/monitoring-config.service.js';
import { MonitoringEventsService } from './application/monitoring-events.service.js';
import { MonitoringConfigurationEntity } from './infrastructure/monitoring-configuration.entity.js';
import { MonitoringEventEntity } from './infrastructure/monitoring-event.entity.js';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([MonitoringEventEntity, MonitoringConfigurationEntity])],
  providers: [MonitoringEventsService, MonitoringConfigService],
  exports: [MonitoringEventsService, MonitoringConfigService],
})
export class MonitoringEventsModule {}
