import { Module } from '@nestjs/common';
import { ReportsProcessor } from './infrastructure/reports.processor.js';
import { ReportsModule } from './reports.module.js';

@Module({
  imports: [ReportsModule],
  providers: [ReportsProcessor],
})
export class ReportsWorkerModule {}
