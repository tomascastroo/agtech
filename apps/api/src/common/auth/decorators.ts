import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from './authenticated-user.js';
import type { Permission } from './permissions.js';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const PERMISSIONS_KEY = 'auth:permissions';

/** Endpoint accesible sin autenticación. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Permisos requeridos (todos) para acceder al endpoint. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
  if (!request.user) throw new Error('CurrentUser usado en un endpoint público');
  return request.user;
});

export interface RequestContext {
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
}

export const ReqContext = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): RequestContext => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const id = (request as Request & { id?: unknown }).id;
    return {
      requestId: typeof id === 'string' ? id : null,
      ip: request.ip ?? null,
      userAgent: request.get('user-agent')?.slice(0, 255) ?? null,
    };
  },
);
