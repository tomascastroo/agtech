import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
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
import { GuaranteesService } from '../application/guarantees.service.js';
import { VerificationQueryService } from '../application/verification-query.service.js';
import { VerificationRequestService } from '../application/verification-request.service.js';
import type { VerificationStatus } from '../domain/verification.types.js';
import { presentEvidenceLink, presentRun, presentRunDetail } from './verification.presenter.js';

class RequestVerificationDto {
  @ApiPropertyOptional({ type: [String], description: 'Evidencias a incluir explícitamente' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  evidenceIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

class CreateVerificationRunDto extends RequestVerificationDto {
  @ApiProperty()
  @IsUUID()
  assetId: string;
}

class VerificationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() assetId?: string;
  @ApiPropertyOptional({ enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] })
  @IsOptional()
  @IsIn(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'])
  status?: VerificationStatus;
}

class ConfirmGuaranteeDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() coveredQuantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) valuation?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

@ApiTags('Verificaciones')
@Controller()
export class VerificationController {
  constructor(
    private readonly requests: VerificationRequestService,
    private readonly queries: VerificationQueryService,
    private readonly guarantees: GuaranteesService,
  ) {}

  @Post('assets/:assetId/verifications')
  @HttpCode(202)
  @RequirePermissions(PERMISSIONS.VERIFICATIONS_RUN)
  @ApiOperation({
    summary: 'Solicita una verificación. Responde 202 y se procesa en segundo plano.',
  })
  @ApiAcceptedResponse({ description: 'Verificación encolada' })
  async requestForAsset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Body() dto: RequestVerificationDto,
    @ReqContext() context: RequestContext,
  ) {
    const run = await this.requests.request(
      { kind: 'user', user },
      { assetId, evidenceIds: dto.evidenceIds, note: dto.note, trigger: 'MANUAL' },
      context,
    );
    return { id: run.id, status: run.status, queuedAt: run.queuedAt };
  }

  @Post('verification-runs')
  @HttpCode(202)
  @RequirePermissions(PERMISSIONS.VERIFICATIONS_RUN)
  @ApiOperation({ summary: 'Alias de integración: crea una verificación para el activo indicado' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateVerificationRunDto,
    @ReqContext() context: RequestContext,
  ) {
    const run = await this.requests.request(
      { kind: 'user', user },
      {
        assetId: dto.assetId,
        evidenceIds: dto.evidenceIds,
        note: dto.note,
        trigger: user.authenticatedVia === 'bearer' ? 'API' : 'MANUAL',
      },
      context,
    );
    return { id: run.id, status: run.status, queuedAt: run.queuedAt };
  }

  @Get('verifications')
  @RequirePermissions(PERMISSIONS.VERIFICATIONS_READ)
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: VerificationQueryDto) {
    const page = await this.queries.list(user.organizationId, query);
    return { ...page, items: page.items.map(presentRun) };
  }

  @Get('verifications/:id')
  @RequirePermissions(PERMISSIONS.VERIFICATIONS_READ)
  @ApiOperation({
    summary: 'Detalle: estado, resultado, componentes del score, métricas, cruces e historial',
  })
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const { run, metrics, snapshots, history } = await this.queries.get(user.organizationId, id);
    return presentRunDetail(run, metrics, snapshots, history);
  }

  @Get('verifications/:id/evidence')
  @RequirePermissions(PERMISSIONS.EVIDENCE_READ)
  @ApiOperation({
    summary: 'Evidencia utilizada y análisis por imagen (modelo, confianza, conteo)',
  })
  async evidence(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const items = await this.queries.evidence(user.organizationId, id);
    return items.map(({ link, url }) => presentEvidenceLink(link, url));
  }

  @Post('verifications/:id/guarantee')
  @RequirePermissions(PERMISSIONS.GUARANTEES_CONFIRM)
  @ApiOperation({ summary: 'Confirma el activo como garantía en base a esta verificación' })
  async confirmGuarantee(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmGuaranteeDto,
    @ReqContext() context: RequestContext,
  ) {
    const guarantee = await this.guarantees.confirm(user, id, dto, context);
    return {
      id: guarantee.id,
      status: guarantee.status,
      coveredQuantity: guarantee.coveredQuantity,
      valuation: guarantee.valuation,
      currency: guarantee.currency,
      confirmedAt: guarantee.confirmedAt,
    };
  }
}
