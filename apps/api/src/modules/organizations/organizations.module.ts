import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationsService } from './application/organizations.service.js';
import { OrganizationEntity } from './infrastructure/organization.entity.js';
import { OrganizationsController } from './presentation/organizations.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([OrganizationEntity])],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
