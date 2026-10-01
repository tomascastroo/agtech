export const COOKIE_NAMES = {
  access: 'ag_at',
  refresh: 'ag_rt',
  csrf: 'ag_csrf',
} as const;

export const CSRF_HEADER = 'x-csrf-token';

/** Ruta pública (detrás del proxy de Next.js) donde vive el refresh token. */
export const REFRESH_COOKIE_PATH = '/api/auth';
