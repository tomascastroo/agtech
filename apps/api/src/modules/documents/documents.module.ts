import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetsModule } from '../assets/assets.module.js';
import { EstablishmentsModule } from '../establishments/establishments.module.js';
import { DocumentAnalysisService } from './application/document-analysis.service.js';
import { DocumentsService } from './application/documents.service.js';
import { AiServiceDocumentReader } from './infrastructure/ai-service-document-reader.js';
import { DocumentAnalysisEntity } from './infrastructure/document-analysis.entity.js';
import { DocumentEntity } from './infrastructure/document.entity.js';
import { DocumentsRepository } from './infrastructure/documents.repository.js';
import { DocumentsController } from './presentation/documents.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentEntity, DocumentAnalysisEntity]),
    AssetsModule,
    EstablishmentsModule,
  ],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentsRepository,
    DocumentAnalysisService,
    AiServiceDocumentReader,
  ],
  exports: [DocumentsRepository, DocumentsService, DocumentAnalysisService],
})
export class DocumentsModule {}
