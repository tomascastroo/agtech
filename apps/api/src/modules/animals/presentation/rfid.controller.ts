import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
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
import { LivestockMonitoringService } from '../application/livestock-monitoring.service.js';
import { RfidService } from '../application/rfid.service.js';

export class RfidReadingDto {
  @ApiProperty({ example: '032 0000 1245 5678', description: 'EID ISO 11784 (15 dígitos)' })
  @IsString()
  @MaxLength(40)
  electronicId: string;

  @ApiProperty({ description: 'Momento de la lectura en el lector (ISO 8601)' })
  @IsISO8601()
  observedAt: string;

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

  @ApiPropertyOptional({ description: 'Calidad de lectura informada por el lector (0–1)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @ApiPropertyOptional({ description: 'Trama original del lector, sin procesar' })
  @IsOptional()
  @IsObject()
  rawPayload?: Record<string, unknown>;
}

export class IngestRfidDto {
  @ApiPropertyOptional({ description: 'Dispositivo RFID_READER registrado' })
  @IsOptional()
  @IsUUID()
  readerDeviceId?: string;

  @ApiProperty({ type: [RfidReadingDto] })
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @Type(() => RfidReadingDto)
  readings: RfidReadingDto[];
}

@ApiTags('Identificación individual')
@Controller()
export class RfidController {
  constructor(
    private readonly rfid: RfidService,
    private readonly livestock: LivestockMonitoringService,
  ) {}

  @Post('assets/:assetId/rfid/observations')
  @RequirePermissions(PERMISSIONS.DEVICES_WRITE)
  @ApiOperation({
    summary: 'Ingesta de lecturas RFID desde el puente del lector (app móvil / gateway)',
  })
  ingest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Body() dto: IngestRfidDto,
    @ReqContext() context: RequestContext,
  ) {
    return this.rfid.ingest(user, assetId, dto, context);
  }

  @Post('assets/:assetId/rfid/simulate')
  @RequirePermissions(PERMISSIONS.DEVICES_WRITE)
  @ApiOperation({ summary: 'SIMULADO: genera lecturas de demo (quedan marcadas como simuladas)' })
  simulate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @ReqContext() context: RequestContext,
  ) {
    return this.rfid.simulate(user, assetId, context);
  }

  @Get('assets/:assetId/rfid/observations')
  @RequirePermissions(PERMISSIONS.ASSETS_READ)
  @ApiOperation({ summary: 'Últimas lecturas RFID del activo y resumen de 30 días' })
  latest(@CurrentUser() user: AuthenticatedUser, @Param('assetId', ParseUUIDPipe) assetId: string) {
    return this.rfid.latest(user.organizationId, assetId);
  }

  @Get('assets/:assetId/livestock/reconciliation')
  @RequirePermissions(PERMISSIONS.ASSETS_READ)
  @ApiOperation({
    summary:
      'Visual + RFID: observados, identificados por RFID, coincidencias (solo con paso por manga y lector simultáneo), REAL y SIMULADO por separado',
  })
  reconciliation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    return this.livestock.reconciliation(user.organizationId, assetId);
  }

  @Get('assets/:assetId/livestock/history')
  @RequirePermissions(PERMISSIONS.ASSETS_READ)
  @ApiOperation({
    summary:
      'Historial del rodeo por verificación (declarados, observados, RFID, cobertura, estado) y cambios relevantes',
  })
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    return this.livestock.history(user.organizationId, assetId);
  }
}
