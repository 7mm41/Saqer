import type { NextConfig } from 'next';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const api = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const config: NextConfig = {
  output: 'standalone',
  // monorepo: trace dependencies from the repository root so the standalone build includes workspace packages
  outputFileTracingRoot: join(dirname(fileURLToPath(import.meta.url)), '..', '..'),
  transpilePackages: ['@katf/ui', '@katf/shared'],
  poweredByHeader: false,
  reactStrictMode: true,
  // In development the API runs on its own port; in production Caddy routes /api to it.
  async rewrites() {
    return process.env.NODE_ENV === 'production' ? [] : [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default config;
