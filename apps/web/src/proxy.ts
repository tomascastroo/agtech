import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/solicitud'];
/** Cookie no-httpOnly emitida junto a la sesión; solo sirve como indicio para redirigir. */
const SESSION_HINT_COOKIE = 'ag_csrf';

function contentSecurityPolicy(nonce: string): string {
  const assetOrigins = (process.env.ASSET_ORIGINS ?? 'http://localhost:9000')
    .split(',')
    .map((o) => o.trim());
  const mapOrigins = (process.env.MAP_TILE_ORIGINS ?? 'https://tile.openstreetmap.org')
    .split(',')
    .map((o) => o.trim());
  const dev = process.env.NODE_ENV !== 'production';
  return [
    "default-src 'self'",
    // 'wasm-unsafe-eval' permite compilar WebAssembly (ONNX Runtime del escáner); no habilita eval().
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${[...assetOrigins, ...mapOrigins].join(' ')}`,
    `connect-src 'self' ${mapOrigins.join(' ')}${dev ? ' ws:' : ''}`,
    "worker-src 'self' blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * Proxy de Next.js 16: aplica CSP con nonce por request y redirige según la presencia de
 * sesión. La autorización real ocurre siempre en la API.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_HINT_COOKIE);
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!hasSession && !isPublic) {
    const url = new URL('/login', request.url);
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  if (hasSession && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|maplibre/|ort/|models/|sw.js|manifest.webmanifest|favicon.ico|icon.svg).*)',
  ],
};
