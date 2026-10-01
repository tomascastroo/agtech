import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import {
  CurrentUser,
  ReqContext,
  RequirePermissions,
  type RequestContext,
} from '../../../common/auth/decorators.js';
import { PERMISSIONS } from '../../../common/auth/permissions.js';
import { NotFoundError } from '../../../common/domain/errors.js';
import { AssetsRepository } from '../../assets/infrastructure/assets.repository.js';
import { AuditService } from '../../audit/application/audit.service.js';
import { AUDIT_ACTIONS } from '../../audit/application/audit.types.js';
import type { MonitoringConfigurationEntity } from '../infrastructure/monitoring-configuration.entity.js';
import { MonitoringConfigService } from '../application/monitoring-config.service.js';
import { MonitoringEventsService } from '../application/monitoring-events.service.js';
import { PortfolioService } from '../application/portfolio.service.js';

class EventsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() assetId?: string;
  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 50;
}

class MonitoringConfigDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional({ minimum: 1, maximum: 2160 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2160)
  intervalHours?: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 8760 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8760)
  maxEvidenceAgeHours?: number;
}

/** Configuración de monitoreo con la estrategia de verificación que ejecuta el scheduler. */
function monitoringView(
  config: MonitoringConfigurationEntity,
  verificationStrategy: string | null,
) {
  return {
    id: config.id,
    assetId: config.assetId,
    enabled: config.enabled,
    intervalHours: config.intervalHours,
    maxEvidenceAgeHours: config.maxEvidenceAgeHours,
    lastRunAt: config.lastRunAt,
    nextRunAt: config.nextRunAt,
    verificationStrategy,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

@ApiTags('Monitoreo')
@Controller()
export class MonitoringController {
  constructor(
    private readonly portfolio: PortfolioService,
    private readonly events: MonitoringEventsService,
    private readonly configs: MonitoringConfigService,
    private readonly assets: AssetsRepository,
    private readonly audit: AuditService,
  ) {}

  @Get('dashboard/summary')
  @RequirePermissions(PERMISSIONS.MONITORING_READ)
  @ApiOperation({ summary: 'Indicadores de la cartera para el dashboard institucional' })
  dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.portfolio.dashboard(user.organizationId);
  }

  @Get('monitoring/portfolio')
  @RequirePermissions(PERMISSIONS.MONITORING_READ)
  @ApiOperation({ summary: '"Mis garantías": estado de cada activo bajo monitoreo' })
  portfolioRows(@CurrentUser() user: AuthenticatedUser) {
    return this.portfolio.rows(user.organizationId);
  }

  @Get('monitoring/events')
  @RequirePermissions(PERMISSIONS.MONITORING_READ)
  listEvents(@CurrentUser() user: AuthenticatedUser, @Query() query: EventsQueryDto) {
    return this.events.list(user.organizationId, { assetId: query.assetId, limit: query.limit });
  }

  @Get('assets/:assetId/monitoring')
  @RequirePermissions(PERMISSIONS.MONITORING_READ)
  async config(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    const asset = await this.assets.findById(user.organizationId, assetId);
    if (!asset) throw new NotFoundError('Activo', assetId);
    const config = await this.configs.forAsset(assetId);
    return config ? monitoringView(config, asset.assetType?.verificationStrategy ?? null) : null;
  }

  @Put('assets/:assetId/monitoring')
  @RequirePermissions(PERMISSIONS.MONITORING_MANAGE)
  @ApiOperation({ summary: 'Configura la frecuencia de verificación automática del activo' })
  async updateConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Body() dto: MonitoringConfigDto,
    @ReqContext() context: RequestContext,
  ) {
    const asset = await this.assets.findById(user.organizationId, assetId);
    if (!asset) throw new NotFoundError('Activo', assetId);
    const updated = monitoringView(
      await this.configs.update(user.organizationId, assetId, dto),
      asset.assetType?.verificationStrategy ?? null,
    );
    await this.audit.record({
      actor: { kind: 'user', user },
      action: AUDIT_ACTIONS.MONITORING_UPDATED,
      resourceType: 'asset',
      resourceId: assetId,
      metadata: {
        enabled: dto.enabled,
        intervalHours: dto.intervalHours,
        maxEvidenceAgeHours: dto.maxEvidenceAgeHours,
      },
      context,
    });
    return updated;
  }
}
