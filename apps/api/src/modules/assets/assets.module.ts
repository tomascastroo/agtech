import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EstablishmentsModule } from '../establishments/establishments.module.js';
import { AssetsService } from './application/assets.service.js';
import { AssetMetadataEntity } from './infrastructure/asset-metadata.entity.js';
import { AssetTypeEntity } from './infrastructure/asset-type.entity.js';
import { AssetEntity } from './infrastructure/asset.entity.js';
import { AssetsRepository } from './infrastructure/assets.repository.js';
import { GuaranteeEntity } from './infrastructure/guarantee.entity.js';
import { AssetsController } from './presentation/assets.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([AssetEntity, AssetTypeEntity, AssetMetadataEntity, GuaranteeEntity]),
    EstablishmentsModule,
  ],
  controllers: [AssetsController],
  providers: [AssetsService, AssetsRepository],
  exports: [AssetsService, AssetsRepository],
})
export class AssetsModule {}
