/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Build a self-contained `.next/standalone` directory so the Docker
  // image only has to ship `node + apps/web/server.js + .next/static`.
  output: 'standalone',
  outputFileTracingRoot: '../../',
  // Forward /api-engine/* to the Hono backend so the browser sees a
  // single origin. In dev the API runs on :8000; in Docker compose
  // the value gets injected by the container env.
  async rewrites() {
    const target = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:8000';
    return [
      {
        source: '/api-engine/:path*',
        destination: `${target}/:path*`,
      },
    ];
  },
};

export default nextConfig;
