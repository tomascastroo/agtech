import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import {
  CurrentUser,
  ReqContext,
  RequirePermissions,
  type RequestContext,
} from '../../../common/auth/decorators.js';
import { PERMISSIONS } from '../../../common/auth/permissions.js';
import { uploadOptions } from '../../../common/files/file-signature.js';
import { EvidenceService } from '../application/evidence.service.js';
import { presentEvidence } from './evidence.presenter.js';

export class UploadEvidenceDto {
  @ApiPropertyOptional({ description: 'Fecha y hora de captura (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  capturedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

@ApiTags('Evidencias')
@Controller()
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  @Get('assets/:assetId/evidence')
  @RequirePermissions(PERMISSIONS.EVIDENCE_READ)
  @ApiOperation({
    summary: 'Evidencias del activo (imágenes, escenas satelitales) con URL firmada',
  })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    const items = await this.evidence.listForAsset(user.organizationId, assetId);
    return items.map(({ evidence, url }) => presentEvidence(evidence, url));
  }

  @Post('assets/:assetId/evidence')
  @RequirePermissions(PERMISSIONS.EVIDENCE_WRITE)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Carga manual de imagen (JPG, PNG o WEBP, máx. 20 MB)' })
  @UseInterceptors(FileInterceptor('file', uploadOptions(20 * 1_048_576)))
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @UploadedFile()
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined,
    @Body() dto: UploadEvidenceDto,
    @ReqContext() context: RequestContext,
  ) {
    const evidence = await this.evidence.uploadManual(user, assetId, file, dto, context);
    const { url } = await this.evidence.withUrl(evidence);
    return presentEvidence(evidence, url);
  }

  @Get('evidence/:id')
  @RequirePermissions(PERMISSIONS.EVIDENCE_READ)
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const { evidence, url } = await this.evidence.get(user.organizationId, id);
    return presentEvidence(evidence, url);
  }
}
