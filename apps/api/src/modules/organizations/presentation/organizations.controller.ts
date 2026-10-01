import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import {
  CurrentUser,
  ReqContext,
  RequirePermissions,
  type RequestContext,
} from '../../../common/auth/decorators.js';
import { PERMISSIONS } from '../../../common/auth/permissions.js';
import { OrganizationsService } from '../application/organizations.service.js';

class ScoringWeightsDto {
  @ApiProperty() @IsNumber() @Min(0) @Max(1) documentation: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(1) existence: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(1) historical: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(1) risk: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(1) consistency: number;
}

@ApiTags('Organización')
@Controller('organization')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SETTINGS_READ)
  @ApiOperation({ summary: 'Datos de la organización del usuario' })
  async get(@CurrentUser() user: AuthenticatedUser) {
    const org = await this.organizations.get(user.organizationId);
    return {
      id: org.id,
      name: org.name,
      legalName: org.legalName,
      taxId: org.taxId,
      kind: org.kind,
    };
  }

  @Get('scoring')
  @RequirePermissions(PERMISSIONS.SETTINGS_READ)
  @ApiOperation({ summary: 'Configuración del modelo de scoring (pesos vigentes)' })
  scoring(@CurrentUser() user: AuthenticatedUser) {
    return this.organizations.scoringConfiguration(user.organizationId);
  }

  @Put('scoring/weights')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Actualiza los pesos del scoring (deben sumar 1)' })
  updateWeights(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ScoringWeightsDto,
    @ReqContext() context: RequestContext,
  ) {
    return this.organizations.updateScoringWeights(
      user,
      {
        documentation: dto.documentation,
        existence: dto.existence,
        historical: dto.historical,
        risk: dto.risk,
        consistency: dto.consistency,
      },
      context,
    );
  }
}
