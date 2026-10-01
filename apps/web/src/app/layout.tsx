import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'AgroGarantías', template: '%s · AgroGarantías' },
  description:
    'Verificación remota y recurrente de activos agropecuarios utilizados como garantía.',
  icons: { icon: '/icon.svg' },
};

// La CSP usa un nonce por request (proxy.ts): todas las páginas se renderizan por request para
// que Next.js lo aplique a sus scripts. La aplicación es autenticada; no hay contenido estático.
export const dynamic = 'force-dynamic';

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0f2a3d' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
