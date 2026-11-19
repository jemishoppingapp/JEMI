/**
 * POST /api/cart/validate
 *
 * Body: { productIds: string[] } (max 50). Returns the CURRENT price,
 * name, image and stock for each product, so the cart can refresh the
 * snapshot it took when the item was added. Without this, the cart and
 * the "Pay ₦X at pickup" line could show an old price while the order is
 * created at the new one.
 *
 * Public (the cart works before sign-in); read-only; rate-limited.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { ok, fail, withErrorHandling } from '@/lib/api';
import { limitByIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  productIds: z.array(z.string().uuid()).min(1).max(50),
});

export async function POST(req: Request) {
  return withErrorHandling(async () => {
    const limited = await limitByIp(req, 'cart-validate', 60, 60);
    if (limited) return limited;

    let parsed;
    try {
      parsed = bodySchema.parse(await req.json());
    } catch {
      return fail('VALIDATION_ERROR', 'Invalid cart.');
    }

    const rows = await db()
      .select({
        id: schema.products.id,
        name: schema.products.name,
        price: schema.products.price,
        images: schema.products.images,
        inStock: schema.products.inStock,
        stockQuantity: schema.products.stockQuantity,
      })
      .from(schema.products)
      .where(and(inArray(schema.products.id, parsed.productIds), eq(schema.products.isActive, true)));

    const byId = new Map(rows.map((r) => [r.id, r]));
    const lines = parsed.productIds.map((id) => {
      const r = byId.get(id);
      if (!r || !r.inStock || r.stockQuantity <= 0) return { productId: id, available: false };
      return {
        productId: id,
        available: true,
        name: r.name,
        price: Number(r.price),
        imageUrl: r.images?.[0]?.url ?? '',
        stockQuantity: r.stockQuantity,
      };
    });

    return ok({ lines });
  });
}
