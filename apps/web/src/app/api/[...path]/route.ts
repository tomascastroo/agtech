import type { NextRequest } from 'next/server';

/**
 * Backend-for-frontend: reenvía /api/* al servicio de API dentro de la red interna.
 * El destino se resuelve en tiempo de ejecución (API_INTERNAL_URL), de modo que la misma
 * imagen sirve en cualquier entorno. Las cookies de sesión viajan como first-party.
 */
export const dynamic = 'force-dynamic';

const FORWARDED_REQUEST_HEADERS = [
  'accept',
  'authorization',
  'content-type',
  'cookie',
  'user-agent',
  'x-csrf-token',
  'x-request-id',
];
const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'content-disposition',
  'x-request-id',
  'cache-control',
];

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const base = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
  const target = new URL(
    `/api/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`,
    base,
  );

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) headers.set('x-forwarded-for', forwardedFor);
  headers.set('x-forwarded-proto', request.nextUrl.protocol.replace(':', ''));
  headers.set('x-forwarded-host', request.headers.get('host') ?? '');

  const hasBody = !['GET', 'HEAD'].includes(request.method);
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: 'manual',
      cache: 'no-store',
      // Requerido por fetch de Node para cuerpos en streaming (cargas de archivos).
      ...(hasBody ? { duplex: 'half' } : {}),
    } as RequestInit);
  } catch {
    return Response.json(
      { statusCode: 503, error: 'SERVICE_UNAVAILABLE', message: 'La API no está disponible' },
      { status: 503 },
    );
  }

  const responseHeaders = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  for (const cookie of upstream.headers.getSetCookie())
    responseHeaders.append('set-cookie', cookie);
  return new Response(upstream.status === 204 ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
