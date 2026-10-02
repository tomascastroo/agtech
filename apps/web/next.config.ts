import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Monorepo pnpm: el tracing del build standalone debe partir de la raíz del workspace.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          // Cámara y sensores de movimiento: solo el propio sitio (Escáner de Bovinos).
          {
            key: 'Permissions-Policy',
            value:
              'camera=(self), microphone=(), geolocation=(self), accelerometer=(self), gyroscope=(self), magnetometer=(self)',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
