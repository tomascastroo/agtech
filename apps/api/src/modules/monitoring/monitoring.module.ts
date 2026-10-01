import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module.js';
import { PortfolioService } from './application/portfolio.service.js';
import { MonitoringController } from './presentation/monitoring.controller.js';

@Module({
  imports: [AssetsModule],
  controllers: [MonitoringController],
  providers: [PortfolioService],
})
export class MonitoringModule {}
