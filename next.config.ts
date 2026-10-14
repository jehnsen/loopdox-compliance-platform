import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  typedRoutes: false,
  poweredByHeader: false,
  reactStrictMode: true,
  // The Content-Security-Policy header carries a per-request nonce, so it is set in proxy.ts.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
          },
        ],
      },
    ]
  },
}

export default nextConfig
