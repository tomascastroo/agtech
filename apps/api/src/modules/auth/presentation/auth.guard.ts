import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.js';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from '../../../common/auth/decorators.js';
import type { Permission } from '../../../common/auth/permissions.js';
import { COOKIE_NAMES, CSRF_HEADER } from '../../../common/http/cookies.js';
import { safeEqual } from '../../../common/crypto/hashing.js';
import { SessionResolver } from '../application/session-resolver.js';
import { TokenService } from '../application/token.service.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

type AuthRequest = Request & { user?: AuthenticatedUser };

export function hasValidCsrf(request: Request): boolean {
  const cookie = request.cookies?.[COOKIE_NAMES.csrf] as string | undefined;
  const header = request.get(CSRF_HEADER);
  return Boolean(cookie && header && safeEqual(cookie, header));
}

/**
 * Guard global: autentica (Bearer o cookie httpOnly), aplica CSRF double-submit a las
 * mutaciones autenticadas por cookie y verifica los permisos declarados en el endpoint.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly sessions: SessionResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const { token, via } = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Autenticación requerida');

    const payload = await this.tokens.verifyAccessToken(token).catch(() => null);
    if (!payload) throw new UnauthorizedException('Sesión inválida o vencida');
    const session = await this.sessions.resolve(payload.sub);
    if (!session || session.organizationId !== payload.org) {
      throw new UnauthorizedException('Sesión inválida o vencida');
    }

    if (via === 'cookie' && !SAFE_METHODS.has(request.method) && !hasValidCsrf(request)) {
      throw new ForbiddenException('Token CSRF inválido');
    }
    request.user = { ...session, authenticatedVia: via };

    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, targets) ?? [];
    const missing = required.filter((permission) => !session.permissions.has(permission));
    if (missing.length > 0) throw new ForbiddenException('Permisos insuficientes');
    return true;
  }

  private extractToken(request: Request): { token: string | null; via: 'cookie' | 'bearer' } {
    const header = request.get('authorization');
    if (header?.startsWith('Bearer ')) return { token: header.slice(7).trim(), via: 'bearer' };
    const cookie = request.cookies?.[COOKIE_NAMES.access] as string | undefined;
    return { token: cookie ?? null, via: 'cookie' };
  }
}

/** CSRF para endpoints públicos que operan sobre cookies (refresh, logout). */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!hasValidCsrf(request)) throw new ForbiddenException('Token CSRF inválido');
    return true;
  }
}
