import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { productPublicColumns } from '@/lib/product-queries';
import { ok, fail, withErrorHandling } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  return withErrorHandling(async () => {
    const { slug } = await params;
    const rows = await db()
      .select(productPublicColumns) // V10: no internal fields
      .from(schema.products)
      .where(and(eq(schema.products.slug, slug), eq(schema.products.isActive, true)))
      .limit(1);
    const product = rows[0];
    if (!product) {
      return fail('NOT_FOUND', "Sorry, we couldn't find that product.");
    }
    return ok({ product });
  });
}