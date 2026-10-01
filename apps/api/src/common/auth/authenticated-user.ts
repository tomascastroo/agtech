import type { Permission } from './permissions.js';

export interface AuthenticatedUser {
  userId: string;
  organizationId: string;
  organizationName: string;
  email: string;
  fullName: string;
  role: string;
  roleName: string;
  permissions: ReadonlySet<Permission>;
  authenticatedVia: 'cookie' | 'bearer';
}

/** Actor de una operación: usuario autenticado o proceso del sistema (worker, scheduler). */
export type Actor =
  | { kind: 'user'; user: AuthenticatedUser }
  | { kind: 'system'; organizationId: string; process: string };

export function actorOrganizationId(actor: Actor): string {
  return actor.kind === 'user' ? actor.user.organizationId : actor.organizationId;
}
