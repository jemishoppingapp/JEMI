import type { NextConfig } from 'next';

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.paystack.co",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://res.cloudinary.com https://placehold.co",
  "font-src 'self' data:",
  "connect-src 'self' https://api.cloudinary.com https://api.paystack.co",
  "frame-src https://checkout.paystack.com https://*.paystack.co",
  "form-action 'self' https://checkout.paystack.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Optimizer ON: Cloudinary photos get resized + served as WebP/AVIF.
    // Matters a lot on 3G phones.
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
      // Old seed products (hidden from buyers) still reference this host
      // and can render inside the admin product list. Keep until those
      // rows are deleted for good.
      {
        protocol: 'https',
        hostname: 'placehold.co',
        pathname: '/**',
      },
    ],
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // No site may embed JEMI in an iframe (clickjacking).
          { key: 'X-Frame-Options', value: 'DENY' },
          // Browsers must not second-guess content types.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Don't leak full URLs to other sites.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // JEMI never needs these device APIs.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // SECURITY (V14): Content-Security-Policy in REPORT-ONLY mode.
          // Browsers log violations to the console but block nothing, so
          // it cannot break checkout. After a week with no unexpected
          // violations, rename the key to 'Content-Security-Policy'.
          { key: 'Content-Security-Policy-Report-Only', value: CSP },
        ],
      },
    ];
  },
};

export default nextConfig;