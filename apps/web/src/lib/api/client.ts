/**
 * Cliente HTTP del navegador hacia el BFF (/api). La sesión viaja en cookies httpOnly; las
 * mutaciones envían el token CSRF (double-submit). Si el access token venció, se renueva una
 * única vez con el refresh token y se reintenta la solicitud.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string | null,
  ) {
    super(message);
  }

  get fieldErrors(): { field: string; message: string }[] {
    const fields = (this.details as { fields?: unknown } | undefined)?.fields;
    return Array.isArray(fields)
      ? fields.filter((f): f is { field: string; message: string } => typeof f === 'object')
      : [];
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD']);

function csrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)ag_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : null;
}

let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'x-csrf-token': csrfToken() ?? '' },
  })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  form?: FormData;
  signal?: AbortSignal;
  /** false: ante una sesión vencida lanza ApiError 401 en lugar de navegar a /login. */
  redirectOnUnauthorized?: boolean;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { accept: 'application/json' };
  if (!SAFE_METHODS.has(method)) headers['x-csrf-token'] = csrfToken() ?? '';
  let body: BodyInit | undefined;
  if (options.form) body = options.form;
  else if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  return fetch(`/api${path}`, {
    method,
    headers,
    body,
    credentials: 'same-origin',
    signal: options.signal,
  });
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await send(path, options);
  if (response.status === 401 && !path.startsWith('/auth/')) {
    // Si el refresh falla puede ser porque otra pestaña ya renovó la sesión (las cookies son
    // compartidas): se reintenta igual una vez antes de dar la sesión por vencida.
    await refreshSession();
    response = await send(path, options);
    if (
      response.status === 401 &&
      options.redirectOnUnauthorized !== false &&
      typeof window !== 'undefined'
    ) {
      const next = encodeURIComponent(window.location.pathname);
      // Navegación completa a propósito: descarta el estado en memoria de la sesión vencida.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/login?next=${next}`);
    }
  }
  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => null)) as
    | (T & {
        statusCode?: number;
        error?: string;
        message?: string;
        details?: unknown;
        requestId?: string;
      })
    | null;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error ?? 'ERROR',
      payload?.message ?? 'No fue posible completar la operación',
      payload?.details,
      payload?.requestId ?? response.headers.get('x-request-id'),
    );
  }
  return payload as T;
}
