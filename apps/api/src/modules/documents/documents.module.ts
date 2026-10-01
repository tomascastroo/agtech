import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetsModule } from '../assets/assets.module.js';
import { EstablishmentsModule } from '../establishments/establishments.module.js';
import { DocumentsService } from './application/documents.service.js';
import { DocumentEntity } from './infrastructure/document.entity.js';
import { DocumentsRepository } from './infrastructure/documents.repository.js';
import { DocumentsController } from './presentation/documents.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([DocumentEntity]), AssetsModule, EstablishmentsModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentsRepository],
  exports: [DocumentsRepository, DocumentsService],
})
export class DocumentsModule {}
