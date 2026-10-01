'use client';

import { useSession } from './api/queries';

/** Permisos del usuario actual (la API vuelve a validarlos en cada solicitud). */
export function useCan(): (permission: string) => boolean {
  const { data } = useSession();
  return (permission) => Boolean(data?.permissions.includes(permission));
}
