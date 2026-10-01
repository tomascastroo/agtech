import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import type { Permission } from '../../../common/auth/permissions.js';
import { UsersRepository } from '../../users/infrastructure/users.repository.js';

type Session = Omit<AuthenticatedUser, 'authenticatedVia'>;

const CACHE_TTL_MS = 30_000;

/**
 * Resuelve el usuario y sus permisos vigentes a partir del "sub" del token. Los permisos se
 * leen de la base (con caché corta) para que un cambio de rol o una baja tengan efecto sin
 * esperar al vencimiento del token.
 */
@Injectable()
export class SessionResolver {
  private readonly cache = new Map<string, { session: Session | null; expiresAt: number }>();

  constructor(private readonly users: UsersRepository) {}

  async resolve(userId: string): Promise<Session | null> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.session;

    const user = await this.users.findWithRole(userId);
    const session: Session | null =
      user && user.status === 'ACTIVE' && user.role && user.organization
        ? {
            userId: user.id,
            organizationId: user.organizationId,
            organizationName: user.organization.name,
            email: user.email,
            fullName: user.fullName,
            role: user.role.code,
            roleName: user.role.name,
            permissions: new Set((user.role.permissions ?? []).map((p) => p.code as Permission)),
          }
        : null;
    this.cache.set(userId, { session, expiresAt: Date.now() + CACHE_TTL_MS });
    return session;
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }
}
