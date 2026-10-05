import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentsModule } from '../documents/documents.module.js';
import { CollateralService } from './application/collateral.service.js';
import { COLLATERAL_ENTITIES } from './infrastructure/collateral.entities.js';

/**
 * Núcleo de la garantía bovina (motor + persistencia). Sin dependencias hacia solicitudes ni
 * verificación: lo importan la API, el worker de verificación y el monitoreo programado.
 */
@Module({
  imports: [TypeOrmModule.forFeature(COLLATERAL_ENTITIES), DocumentsModule],
  providers: [CollateralService],
  exports: [CollateralService],
})
export class CollateralCoreModule {}
