import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
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
import { PaginationQueryDto } from '../../../common/pagination/pagination.js';
import { AlertsService } from '../application/alerts.service.js';
import type { AlertSeverity, AlertStatus } from '../domain/alert.types.js';
import type { AlertRuleEntity } from '../infrastructure/alert-rule.entity.js';
import type { AlertEntity } from '../infrastructure/alert.entity.js';

const SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;

class AlertQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'ACTIVE'] })
  @IsOptional()
  @IsIn(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'ACTIVE'])
  status?: AlertStatus | 'ACTIVE';

  @ApiPropertyOptional({ enum: SEVERITIES })
  @IsOptional()
  @IsIn(SEVERITIES)
  severity?: AlertSeverity;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assetId?: string;
}

class UpdateAlertDto {
  @ApiProperty({ enum: ['ACKNOWLEDGED', 'RESOLVED'] })
  @IsIn(['ACKNOWLEDGED', 'RESOLVED'])
  status: 'ACKNOWLEDGED' | 'RESOLVED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolutionNote?: string;
}

class UpdateRuleDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional({ enum: SEVERITIES })
  @IsOptional()
  @IsIn(SEVERITIES)
  severity?: AlertSeverity;
  @ApiPropertyOptional() @IsOptional() @IsObject() parameters?: Record<string, number>;
}

export function presentAlert(alert: AlertEntity) {
  return {
    id: alert.id,
    type: alert.type,
    severity: alert.severity,
    status: alert.status,
    title: alert.title,
    description: alert.description,
    context: alert.context,
    assetId: alert.assetId,
    verificationId: alert.verificationRunId,
    asset: alert.asset
      ? {
          id: alert.asset.id,
          name: alert.asset.name,
          dataSource: alert.asset.dataSource,
          typeName: alert.asset.assetType?.name ?? null,
          establishmentName: alert.asset.establishment?.name ?? null,
        }
      : null,
    createdAt: alert.createdAt,
    acknowledgedAt: alert.acknowledgedAt,
    resolvedAt: alert.resolvedAt,
    resolutionNote: alert.resolutionNote,
  };
}

function presentRule(rule: AlertRuleEntity) {
  return {
    id: rule.id,
    code: rule.code,
    name: rule.name,
    description: rule.description,
    severity: rule.severity,
    conditionType: rule.conditionType,
    parameters: rule.parameters,
    assetTypeCodes: rule.assetTypeCodes,
    enabled: rule.enabled,
    scope: rule.organizationId ? 'ORGANIZATION' : 'SYSTEM',
  };
}

@ApiTags('Alertas')
@Controller()
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get('alerts')
  @RequirePermissions(PERMISSIONS.ALERTS_READ)
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: AlertQueryDto) {
    const page = await this.alerts.list(user.organizationId, query);
    return { ...page, items: page.items.map(presentAlert) };
  }

  @Get('alerts/:id')
  @RequirePermissions(PERMISSIONS.ALERTS_READ)
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return presentAlert(await this.alerts.get(user.organizationId, id));
  }

  @Patch('alerts/:id')
  @RequirePermissions(PERMISSIONS.ALERTS_MANAGE)
  @ApiOperation({ summary: 'Toma conocimiento o resuelve una alerta' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAlertDto,
    @ReqContext() context: RequestContext,
  ) {
    return presentAlert(await this.alerts.update(user, id, dto, context));
  }

  @Get('alert-rules')
  @RequirePermissions(PERMISSIONS.SETTINGS_READ)
  async rules(@CurrentUser() user: AuthenticatedUser) {
    return (await this.alerts.rules(user.organizationId)).map(presentRule);
  }

  @Patch('alert-rules/:id')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Ajusta una regla (umbral, severidad, habilitación)' })
  async updateRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRuleDto,
    @ReqContext() context: RequestContext,
  ) {
    return presentRule(await this.alerts.updateRule(user, id, dto, context));
  }
}
