import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import {
  CurrentUser,
  ReqContext,
  RequirePermissions,
  type RequestContext,
} from '../../../common/auth/decorators.js';
import { PERMISSIONS } from '../../../common/auth/permissions.js';
import { DemoService } from '../application/demo.service.js';

class CreateDemoDto {
  @ApiProperty({ example: 'COMPLETE' })
  @Matches(/^[A-Z_]{2,32}$/)
  scenario: string;
}

/** "Simular solicitud" (datos ficticios marcados DEMO, mismos servicios que una real). */
@ApiTags('Demostración')
@Controller('demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Get('scenarios')
  @RequirePermissions(PERMISSIONS.ASSETS_WRITE)
  scenarios() {
    return this.demo.scenarios();
  }

  @Post('guarantee-requests')
  @RequirePermissions(PERMISSIONS.ASSETS_WRITE)
  @ApiOperation({ summary: 'Crea una solicitud de garantía de demostración completa' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDemoDto,
    @ReqContext() context: RequestContext,
  ) {
    return this.demo.create(user, dto.scenario, context);
  }
}
