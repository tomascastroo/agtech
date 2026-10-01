import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import {
  CurrentUser,
  ReqContext,
  RequirePermissions,
  type RequestContext,
} from '../../../common/auth/decorators.js';
import { PERMISSIONS } from '../../../common/auth/permissions.js';
import { uploadOptions } from '../../../common/files/file-signature.js';
import { DOCUMENT_TYPES, type DocumentType } from '../domain/document.types.js';
import {
  DocumentsService,
  type UploadedFile as UploadedFileData,
} from '../application/documents.service.js';
import type { DocumentEntity } from '../infrastructure/document.entity.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_UPLOAD_BYTES = 15 * 1_048_576;

class UploadDocumentDto {
  @ApiProperty({ enum: DOCUMENT_TYPES })
  @IsIn(DOCUMENT_TYPES)
  type: DocumentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional({ example: '2026-03-01' })
  @IsOptional()
  @Matches(ISO_DATE)
  issuedAt?: string;

  @ApiPropertyOptional({ example: '2027-03-01' })
  @IsOptional()
  @Matches(ISO_DATE)
  expiresAt?: string;
}

class ReviewDocumentDto {
  @ApiProperty({ enum: ['VALID', 'REJECTED'] })
  @IsIn(['VALID', 'REJECTED'])
  status: 'VALID' | 'REJECTED';
}

const uploadSchema = {
  schema: {
    type: 'object',
    required: ['file', 'type'],
    properties: {
      file: { type: 'string', format: 'binary' },
      type: { type: 'string', enum: [...DOCUMENT_TYPES] },
      title: { type: 'string' },
      issuedAt: { type: 'string', format: 'date' },
      expiresAt: { type: 'string', format: 'date' },
    },
  },
};

export function presentDocument(doc: DocumentEntity) {
  return {
    id: doc.id,
    type: doc.type,
    status: doc.status,
    title: doc.title,
    fileName: doc.originalFileName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    sha256: doc.sha256,
    issuedAt: doc.issuedAt,
    expiresAt: doc.expiresAt,
    assetId: doc.assetId,
    establishmentId: doc.establishmentId,
    scope: doc.assetId ? 'ASSET' : 'ESTABLISHMENT',
    uploadedAt: doc.createdAt,
    reviewedAt: doc.reviewedAt,
  };
}

@ApiTags('Documentos')
@Controller()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('assets/:assetId/documents')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_READ)
  @ApiOperation({
    summary: 'Documentos del activo y de su establecimiento, con estado de requisitos',
  })
  async listForAsset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    const { documents, requirements } = await this.documents.listForAsset(
      user.organizationId,
      assetId,
    );
    return { documents: documents.map(presentDocument), requirements };
  }

  @Post('assets/:assetId/documents')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_WRITE)
  @ApiConsumes('multipart/form-data')
  @ApiBody(uploadSchema)
  @ApiOperation({ summary: 'Carga de documentación del activo (PDF, JPG o PNG, máx. 15 MB)' })
  @UseInterceptors(FileInterceptor('file', uploadOptions(MAX_UPLOAD_BYTES)))
  async uploadForAsset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @UploadedFile() file: UploadedFileData | undefined,
    @Body() dto: UploadDocumentDto,
    @ReqContext() context: RequestContext,
  ) {
    return presentDocument(await this.documents.uploadForAsset(user, assetId, file, dto, context));
  }

  @Post('establishments/:establishmentId/documents')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_WRITE)
  @ApiConsumes('multipart/form-data')
  @ApiBody(uploadSchema)
  @UseInterceptors(FileInterceptor('file', uploadOptions(MAX_UPLOAD_BYTES)))
  async uploadForEstablishment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('establishmentId', ParseUUIDPipe) establishmentId: string,
    @UploadedFile() file: UploadedFileData | undefined,
    @Body() dto: UploadDocumentDto,
    @ReqContext() context: RequestContext,
  ) {
    return presentDocument(
      await this.documents.uploadForEstablishment(user, establishmentId, file, dto, context),
    );
  }

  @Get('documents/:id/download')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_READ)
  @ApiOperation({ summary: 'URL firmada de descarga (vence en minutos)' })
  download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ReqContext() context: RequestContext,
  ) {
    return this.documents.downloadUrl(user, id, context);
  }

  @Patch('documents/:id/review')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_REVIEW)
  @ApiOperation({ summary: 'Valida o rechaza un documento' })
  async review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDocumentDto,
    @ReqContext() context: RequestContext,
  ) {
    return presentDocument(await this.documents.review(user, id, dto.status, context));
  }
}
