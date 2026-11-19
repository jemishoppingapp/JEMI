import type { MetadataRoute } from 'next';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { SITE_URL } from '@/lib/site';



const STATIC_ROUTES: MetadataRoute.Sitemap = [
  { url: SITE_URL, changeFrequency: 'daily', priority: 1 },
  { url: `${SITE_URL}/products`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE_URL}/products?category=fashion`, changeFrequency: 'daily', priority: 0.7 },
  { url: `${SITE_URL}/products?category=electronics`, changeFrequency: 'daily', priority: 0.7 },
  { url: `${SITE_URL}/products?category=food`, changeFrequency: 'daily', priority: 0.7 },
  { url: `${SITE_URL}/products?category=accessories`, changeFrequency: 'daily', priority: 0.7 },
  { url: `${SITE_URL}/become-a-seller`, changeFrequency: 'monthly', priority: 0.5 },
  { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.4 },
  { url: `${SITE_URL}/contact`, changeFrequency: 'monthly', priority: 0.4 },
  { url: `${SITE_URL}/terms`, changeFrequency: 'yearly', priority: 0.2 },
  { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
];

// Re-read products at most once an hour (it used to hit the DB on every
// crawler request).
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const products = await db()
      .select({ slug: schema.products.slug, updatedAt: schema.products.updatedAt, images: schema.products.images })
      .from(schema.products)
      .where(eq(schema.products.isActive, true));

    const productRoutes: MetadataRoute.Sitemap = products.map((p) => ({
      url: `${SITE_URL}/products/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.6,
      // Product photos in the sitemap help them show up in Google Images.
      images: (p.images ?? []).map((i) => i.url).filter(Boolean).slice(0, 5),
    }));

    return [...STATIC_ROUTES, ...productRoutes];
  } catch {
    return STATIC_ROUTES;
  }
}