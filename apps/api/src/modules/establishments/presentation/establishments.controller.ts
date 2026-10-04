import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import {
  CurrentUser,
  ReqContext,
  RequirePermissions,
  type RequestContext,
} from '../../../common/auth/decorators.js';
import { PERMISSIONS } from '../../../common/auth/permissions.js';
import { EstablishmentsService } from '../application/establishments.service.js';
import type { EstablishmentEntity } from '../infrastructure/establishment.entity.js';
import { CreateEstablishmentDto } from './establishments.dto.js';

function present(establishment: EstablishmentEntity) {
  const main = establishment.locations?.find((l) => l.kind === 'MAIN') ?? null;
  return {
    id: establishment.id,
    name: establishment.name,
    dataSource: establishment.dataSource,
    holderName: establishment.holderName,
    holderTaxId: establishment.holderTaxId,
    renspa: establishment.renspa,
    establishmentType: establishment.establishmentType,
    tenure: establishment.tenure,
    province: establishment.province,
    locality: establishment.locality,
    totalAreaHa: establishment.totalAreaHa,
    location: main ? { point: main.point, boundary: main.boundary } : null,
    locations: (establishment.locations ?? []).map((l) => ({
      id: l.id,
      kind: l.kind,
      name: l.name,
      point: l.point,
      boundary: l.boundary,
    })),
    createdAt: establishment.createdAt,
  };
}

@ApiTags('Establecimientos')
@Controller('establishments')
export class EstablishmentsController {
  constructor(private readonly establishments: EstablishmentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ESTABLISHMENTS_READ)
  @ApiOperation({ summary: 'Establecimientos con ubicación, activos, alertas y último score' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.establishments.list(user.organizationId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ESTABLISHMENTS_READ)
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return present(await this.establishments.get(user.organizationId, id));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ESTABLISHMENTS_WRITE)
  @ApiOperation({ summary: 'Alta de establecimiento con ubicación (y límite opcional)' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEstablishmentDto,
    @ReqContext() context: RequestContext,
  ) {
    return present(await this.establishments.create(user, dto, context));
  }
}
