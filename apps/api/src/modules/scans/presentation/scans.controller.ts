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
import {
  ApiConsumes,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
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
import {
  SCAN_FRAME_KINDS,
  SCAN_LIMITS,
  SCAN_MODES,
  type ScanFrameKind,
  type ScanMode,
} from '../domain/scan.types.js';
import { ScansService } from '../application/scans.service.js';

class ScanLineDto {
  @ApiProperty({ enum: ['vertical', 'horizontal'] })
  @IsIn(['vertical', 'horizontal'])
  orientation: 'vertical' | 'horizontal';

  @ApiProperty({ minimum: 0.05, maximum: 0.95 })
  @IsNumber()
  @Min(0.05)
  @Max(0.95)
  position: number;
}

export class CreateScanDto {
  @ApiProperty({ description: 'UUID generado en el celular (permite reanudar sin duplicar)' })
  @IsUUID()
  id: string;

  @ApiProperty({ enum: SCAN_MODES })
  @IsIn(SCAN_MODES)
  mode: ScanMode;

  @ApiProperty()
  @IsISO8601()
  startedAt: string;

  @ApiProperty()
  @IsNumber()
  @Min(SCAN_LIMITS.minSampledFps)
  @Max(SCAN_LIMITS.maxSampledFps)
  sampledFps: number;

  @ApiProperty()
  @IsInt()
  @Min(64)
  @Max(4096)
  frameWidth: number;

  @ApiProperty()
  @IsInt()
  @Min(64)
  @Max(4096)
  frameHeight: number;

  @ApiProperty({ type: ScanLineDto })
  @ValidateNested()
  @Type(() => ScanLineDto)
  line: ScanLineDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  accuracyM?: number;

  @ApiPropertyOptional({ description: 'Navegador, backend de inferencia, modelo' })
  @IsOptional()
  @IsObject()
  device?: Record<string, unknown>;
}

export class UploadFrameDto {
  @ApiProperty({ enum: SCAN_FRAME_KINDS })
  @IsIn(SCAN_FRAME_KINDS)
  kind: ScanFrameKind;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(SCAN_LIMITS.maxFrames)
  index: number;

  @ApiProperty({ description: 'Milisegundos desde el inicio del escaneo' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(SCAN_LIMITS.maxDurationS * 1000 + 60_000)
  capturedMs: number;

  @ApiProperty({ description: 'SHA-256 del JPEG, calculado en el celular' })
  @Matches(/^[0-9a-fA-F]{64}$/)
  sha256: string;
}

export class FinalizeScanDto {
  @ApiProperty()
  @IsISO8601()
  endedAt: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(SCAN_LIMITS.maxDurationS + 60)
  durationS: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(SCAN_LIMITS.maxFrames)
  expectedFrames: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(SCAN_LIMITS.maxKeyFrames)
  expectedKeyFrames: number;

  @ApiProperty({ description: 'Conteo PRELIMINAR del celular (referencia, no oficial)' })
  @IsObject()
  clientResult: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  headingStartDeg?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(3600)
  sweptDeg?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  headingSource?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  endLatitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  endLongitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDisplacementM?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  warnings?: string[];
}

/** Escáner de Bovinos del productor (sesión PRODUCER sobre sus solicitudes). */
@ApiTags('Escáner de bovinos')
@Controller('producer/me/requests/:id/scans')
export class ProducerScansController {
  constructor(private readonly scans: ScansService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.scans.producerList(user, id);
  }

  @Post()
  @ApiOperation({ summary: 'Inicia (o retoma) una sesión de escaneo; idempotente por id' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateScanDto,
    @ReqContext() context: RequestContext,
  ) {
    return this.scans.create(user, id, dto, context);
  }

  @Get(':scanId')
  @ApiOperation({ summary: 'Estado del escaneo y cuadros recibidos (para reanudar la subida)' })
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('scanId', ParseUUIDPipe) scanId: string,
  ) {
    return this.scans.producerView(user, id, scanId);
  }

  @Post(':scanId/frames')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Sube un cuadro (idempotente por tipo, índice y SHA-256)' })
  @UseInterceptors(FileInterceptor('file', uploadOptions(SCAN_LIMITS.maxFrameBytes)))
  uploadFrame(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('scanId', ParseUUIDPipe) scanId: string,
    @UploadedFile() file: { buffer: Buffer; size: number } | undefined,
    @Body() dto: UploadFrameDto,
  ) {
    return this.scans.uploadFrame(user, id, scanId, file, dto);
  }

  @Post(':scanId/finalize')
  @ApiOperation({ summary: 'Cierra la subida y encola el conteo oficial en el servidor' })
  finalize(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('scanId', ParseUUIDPipe) scanId: string,
    @Body() dto: FinalizeScanDto,
    @ReqContext() context: RequestContext,
  ) {
    return this.scans.finalize(user, id, scanId, dto, context);
  }

  @Post(':scanId/retry')
  retry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('scanId', ParseUUIDPipe) scanId: string,
  ) {
    return this.scans.retry(user, id, scanId);
  }
}

/** Lectura de escaneos para la entidad (resultado oficial, cuadros representativos). */
@ApiTags('Escáner de bovinos')
@Controller()
export class ScansController {
  constructor(private readonly scans: ScansService) {}

  @Get('assets/:assetId/scans')
  @RequirePermissions(PERMISSIONS.EVIDENCE_READ)
  list(@CurrentUser() user: AuthenticatedUser, @Param('assetId', ParseUUIDPipe) assetId: string) {
    return this.scans.listForAsset(user.organizationId, assetId);
  }

  @Get('scans/:scanId')
  @RequirePermissions(PERMISSIONS.EVIDENCE_READ)
  detail(@CurrentUser() user: AuthenticatedUser, @Param('scanId', ParseUUIDPipe) scanId: string) {
    return this.scans.detail(user.organizationId, scanId);
  }
}
