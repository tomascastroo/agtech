import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import { CurrentUser, RequirePermissions } from '../../../common/auth/decorators.js';
import { PERMISSIONS } from '../../../common/auth/permissions.js';
import { UsersRepository } from '../infrastructure/users.repository.js';

@ApiTags('Usuarios')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersRepository) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_READ)
  @ApiOperation({ summary: 'Usuarios de la organización' })
  async list(@CurrentUser() user: AuthenticatedUser) {
    const users = await this.users.listByOrganization(user.organizationId);
    return users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      status: u.status,
      role: u.role ? { code: u.role.code, name: u.role.name } : null,
      lastLoginAt: u.lastLoginAt,
    }));
  }
}
