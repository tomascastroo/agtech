import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import { CurrentUser, RequirePermissions } from '../../../common/auth/decorators.js';
import { PERMISSIONS } from '../../../common/auth/permissions.js';
import { PaginationQueryDto } from '../../../common/pagination/pagination.js';
import { AuditService } from '../application/audit.service.js';

class AuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(48)
  resourceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  resourceId?: string;
}

@ApiTags('Auditoría')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  @ApiOperation({ summary: 'Registro de auditoría de la organización' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: AuditQueryDto) {
    return this.audit.list(user.organizationId, query);
  }
}
