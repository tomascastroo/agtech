import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GuaranteeRequestsModule } from '../guarantee-requests/guarantee-requests.module.js';
import { GuaranteeRequestEntity } from '../guarantee-requests/infrastructure/guarantee-request.entity.js';
import { DemoService } from './application/demo.service.js';
import { DemoController } from './presentation/demo.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([GuaranteeRequestEntity]), GuaranteeRequestsModule],
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
