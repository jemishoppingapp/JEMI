import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';



export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/api/',
          '/checkout',
          '/checkout/',
          '/orders',
          '/orders/',
          '/profile',
          '/profile/',
          '/offline',
          '/seller$',   // seller dashboard (not /sellers/... or /become-a-seller)
          '/seller/',
          '/sellers/pending',
          '/verify-email',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL.replace(/^https?:\/\//, ''),
  };
}