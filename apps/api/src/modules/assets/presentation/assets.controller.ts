import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import {
  CurrentUser,
  ReqContext,
  RequirePermissions,
  type RequestContext,
} from '../../../common/auth/decorators.js';
import { PERMISSIONS } from '../../../common/auth/permissions.js';
import { AssetsService } from '../application/assets.service.js';
import { AssetListQueryDto, CreateAssetDto, UpdateAssetDto } from './assets.dto.js';
import { presentAssetDetail, presentAssetSummary, presentAssetType } from './asset.presenter.js';

@ApiTags('Activos')
@Controller()
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get('asset-types')
  @RequirePermissions(PERMISSIONS.ASSETS_READ)
  @ApiOperation({ summary: 'Catálogo de tipos de activo con su esquema de metadata' })
  async types() {
    return (await this.assets.types()).map(presentAssetType);
  }

  @Get('assets')
  @RequirePermissions(PERMISSIONS.ASSETS_READ)
  @ApiOperation({ summary: 'Activos de la organización' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: AssetListQueryDto) {
    const page = await this.assets.list(user.organizationId, query);
    return {
      ...page,
      items: page.items.map((row) => ({
        ...presentAssetSummary(row.asset),
        openAlerts: row.openAlerts,
        highestAlertSeverity: row.highestAlertSeverity,
        guaranteeActive: row.guaranteeActive,
      })),
    };
  }

  @Post('assets')
  @RequirePermissions(PERMISSIONS.ASSETS_WRITE)
  @ApiOperation({ summary: 'Alta de activo' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAssetDto,
    @ReqContext() context: RequestContext,
  ) {
    const { asset, metadata, guarantee } = await this.assets.create(user, dto, context);
    return presentAssetDetail(asset, metadata, guarantee);
  }

  @Get('assets/:id')
  @RequirePermissions(PERMISSIONS.ASSETS_READ)
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const { asset, metadata, guarantee } = await this.assets.get(user.organizationId, id);
    return presentAssetDetail(asset, metadata, guarantee);
  }

  @Patch('assets/:id')
  @RequirePermissions(PERMISSIONS.ASSETS_WRITE)
  @ApiOperation({ summary: 'Actualiza un activo (la metadata se versiona)' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssetDto,
    @ReqContext() context: RequestContext,
  ) {
    const { asset, metadata, guarantee } = await this.assets.update(user, id, dto, context);
    return presentAssetDetail(asset, metadata, guarantee);
  }
}
