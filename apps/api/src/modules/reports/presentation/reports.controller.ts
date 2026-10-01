import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import {
  CurrentUser,
  ReqContext,
  RequirePermissions,
  type RequestContext,
} from '../../../common/auth/decorators.js';
import { PERMISSIONS } from '../../../common/auth/permissions.js';
import { PaginationQueryDto } from '../../../common/pagination/pagination.js';
import { ReportsService } from '../application/reports.service.js';
import { REPORT_FORMATS, type ReportFormat } from '../domain/report.types.js';
import type { ReportEntity } from '../infrastructure/report.entity.js';

class ReportQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() assetId?: string;
}

class DownloadQueryDto {
  @ApiPropertyOptional({ enum: REPORT_FORMATS, default: 'PDF' })
  @IsOptional()
  @IsIn(REPORT_FORMATS)
  format: ReportFormat = 'PDF';
}

function presentReport(report: ReportEntity) {
  const latest = new Map<
    string,
    { version: number; sizeBytes: number; sha256: string; createdAt: Date }
  >();
  for (const doc of report.documents ?? []) {
    const current = latest.get(doc.format);
    if (!current || doc.version > current.version) {
      latest.set(doc.format, {
        version: doc.version,
        sizeBytes: doc.sizeBytes,
        sha256: doc.sha256,
        createdAt: doc.createdAt,
      });
    }
  }
  return {
    id: report.id,
    title: report.title,
    type: report.type,
    status: report.status,
    verificationId: report.verificationRunId,
    assetId: report.assetId,
    asset: report.asset
      ? {
          name: report.asset.name,
          typeName: report.asset.assetType?.name ?? null,
          establishmentName: report.asset.establishment?.name ?? null,
        }
      : null,
    generatedAt: report.generatedAt,
    failureReason: report.failureReason,
    createdAt: report.createdAt,
    formats: Object.fromEntries(latest),
  };
}

@ApiTags('Informes')
@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post('verifications/:id/reports')
  @HttpCode(202)
  @RequirePermissions(PERMISSIONS.REPORTS_GENERATE)
  @ApiOperation({ summary: 'Solicita el informe de garantía de una verificación' })
  async requestForRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) runId: string,
    @ReqContext() context: RequestContext,
  ) {
    return presentReport(await this.reports.requestForRun({ kind: 'user', user }, runId, context));
  }

  @Get('reports')
  @RequirePermissions(PERMISSIONS.REPORTS_READ)
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: ReportQueryDto) {
    const page = await this.reports.list(user.organizationId, query);
    return { ...page, items: page.items.map(presentReport) };
  }

  @Get('reports/:id')
  @RequirePermissions(PERMISSIONS.REPORTS_READ)
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return presentReport(await this.reports.get(user.organizationId, id));
  }

  @Post('reports/:id/generate')
  @HttpCode(202)
  @RequirePermissions(PERMISSIONS.REPORTS_GENERATE)
  @ApiOperation({ summary: 'Genera una nueva versión del informe (PDF, CSV y JSON)' })
  async generate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ReqContext() context: RequestContext,
  ) {
    return presentReport(await this.reports.regenerate(user, id, context));
  }

  @Get('reports/:id/download')
  @RequirePermissions(PERMISSIONS.REPORTS_READ)
  @ApiOperation({ summary: 'URL firmada de descarga del informe en el formato indicado' })
  download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: DownloadQueryDto,
    @ReqContext() context: RequestContext,
  ) {
    return this.reports.downloadUrl(user, id, query.format, context);
  }
}
