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
  ArrayMinSize,
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
import { BovineIndividualsService } from '../application/bovine-individuals.service.js';
import { ScansService } from '../application/scans.service.js';
import {
  CHUTE_RFID_SOURCES,
  type ChuteRfidSource,
} from '../infrastructure/chute-capture.entity.js';

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

class CaptureZoneDto {
  @ApiProperty({ minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  x1: number;

  @ApiProperty({ minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  y1: number;

  @ApiProperty({ minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  x2: number;

  @ApiProperty({ minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  y2: number;
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

  @ApiProperty({ description: 'Cuadros por segundo muestreados (0 en el modo PHOTO)' })
  @IsNumber()
  @Min(0)
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

  @ApiPropertyOptional({
    type: CaptureZoneDto,
    description:
      'Manga + RFID: zona de captura (proporciones del cuadro) donde debe estar el bovino',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CaptureZoneDto)
  captureZone?: CaptureZoneDto;

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
  @Max(SCAN_LIMITS.maxChuteFrames)
  index: number;

  @ApiProperty({ description: 'Milisegundos desde el inicio del escaneo' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(SCAN_LIMITS.maxChuteDurationS * 1000 + 60_000)
  capturedMs: number;

  @ApiProperty({ description: 'SHA-256 del JPEG, calculado en el celular' })
  @Matches(/^[0-9a-fA-F]{64}$/)
  sha256: string;
}

class ChuteReadDto {
  @ApiProperty({
    description: 'Caravana leída tal cual (el servidor la valida: una lectura dudosa no se asocia)',
  })
  @IsString()
  @MaxLength(40)
  electronicId: string;

  @ApiProperty({ description: 'Milisegundos desde el inicio de la sesión (reloj del celular)' })
  @IsInt()
  @Min(0)
  @Max(SCAN_LIMITS.maxChuteDurationS * 1000 + 60_000)
  atMs: number;
}

/** Una captura de Manga + RFID: un animal, su(s) lectura(s) y los cuadros de la ventana. */
export class ChuteCaptureDto {
  @ApiProperty({ description: 'UUID generado en el celular (reenviar no duplica)' })
  @IsUUID()
  id: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(SCAN_LIMITS.maxChuteCaptures)
  sequence: number;

  @ApiProperty({ enum: CHUTE_RFID_SOURCES })
  @IsIn(CHUTE_RFID_SOURCES)
  rfidSource: ChuteRfidSource;

  @ApiPropertyOptional({ description: 'Lector RFID registrado (obligatorio si no es SIMULATED)' })
  @IsOptional()
  @IsUUID()
  readerDeviceId?: string;

  @ApiProperty({ type: [ChuteReadDto] })
  @IsArray()
  @ArrayMaxSize(SCAN_LIMITS.maxChuteReadsPerCapture)
  @ValidateNested({ each: true })
  @Type(() => ChuteReadDto)
  reads: ChuteReadDto[];

  @ApiProperty({ type: [Number], description: 'Índices (SAMPLE) de los cuadros de la ventana' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SCAN_LIMITS.maxFramesPerCapture)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(SCAN_LIMITS.maxChuteFrames - 1, { each: true })
  frameIndices: number[];

  @ApiPropertyOptional({ description: 'Track del celular (solo puede bajar una confirmación)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  clientTrackId?: number;

  @ApiPropertyOptional({ description: 'Resultado PRELIMINAR del celular (referencia, no oficial)' })
  @IsOptional()
  @IsObject()
  clientResult?: Record<string, unknown>;
}

export class FinalizeScanDto {
  @ApiProperty()
  @IsISO8601()
  endedAt: string;

  @ApiPropertyOptional({ description: 'Puede faltar si el escaneo no llegó a capturar nada' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(SCAN_LIMITS.maxChuteDurationS + 60)
  durationS?: number;

  @ApiProperty({
    description: '0 = el celular no capturó cuadros: el escaneo se cierra como FALLIDO',
  })
  @IsInt()
  @Min(0)
  @Max(SCAN_LIMITS.maxChuteFrames)
  expectedFrames: number;

  @ApiPropertyOptional({ description: 'Manga + RFID: cantidad de capturas (animales) registradas' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(SCAN_LIMITS.maxChuteCaptures)
  expectedCaptures?: number;

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

  @Post(':scanId/captures')
  @ApiOperation({
    summary: 'Manga + RFID: registra una captura (animal + lectura RFID); idempotente por id',
  })
  registerCapture(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('scanId', ParseUUIDPipe) scanId: string,
    @Body() dto: ChuteCaptureDto,
    @ReqContext() context: RequestContext,
  ) {
    return this.scans.registerCapture(user, id, scanId, dto, context);
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
  constructor(
    private readonly scans: ScansService,
    private readonly individuals: BovineIndividualsService,
  ) {}

  @Get('assets/:assetId/bovine-individuals')
  @RequirePermissions(PERMISSIONS.EVIDENCE_READ)
  @ApiOperation({ summary: 'Manga + RFID: bovinos identificados por caravana en el activo' })
  bovineIndividuals(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    return this.individuals.listForAsset(user.organizationId, assetId);
  }

  @Get('assets/:assetId/bovine-individuals/dataset')
  @RequirePermissions(PERMISSIONS.EVIDENCE_READ)
  @ApiOperation({
    summary:
      'Dataset RFID + cuadros (metadatos y hashes) para investigación futura; sin embeddings',
  })
  bovineDataset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    return this.individuals.dataset(user.organizationId, assetId);
  }

  @Get('bovine-individuals/:individualId')
  @RequirePermissions(PERMISSIONS.EVIDENCE_READ)
  @ApiOperation({ summary: 'Detalle de un bovino: capturas confirmadas y cuadros de respaldo' })
  bovineIndividual(
    @CurrentUser() user: AuthenticatedUser,
    @Param('individualId', ParseUUIDPipe) individualId: string,
  ) {
    return this.individuals.detail(user.organizationId, individualId);
  }

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
