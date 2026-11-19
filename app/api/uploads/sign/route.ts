/**
 * POST /api/uploads/sign — SECURITY (V6)
 *
 * Returns a short-lived Cloudinary signature so the browser can upload a
 * product image directly to Cloudinary. Only admins and APPROVED sellers
 * get one. Before this, the browser used an unsigned preset, so anyone
 * who read the page source could upload to JEMI's Cloudinary account.
 *
 * After deploying: Cloudinary dashboard → Settings → Upload → preset
 * "jemi_products" → Signing mode: Signed. Unsigned uploads then stop.
 */
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/session';
import { cloudinary } from '@/lib/cloudinary';
import { ok, fail, withErrorHandling } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UPLOAD_PRESET = 'jemi_products';
const FOLDER = 'jemi/products';

export async function POST() {
  return withErrorHandling(async () => {
    const user = await getCurrentUser();
    if (!user) return fail('UNAUTHORIZED', 'Please sign in to upload images.');

    if (user.role !== 'admin') {
      if (user.role !== 'seller') return fail('FORBIDDEN', 'Only sellers can upload product images.');
      const rows = await db()
        .select({ id: schema.sellers.id })
        .from(schema.sellers)
        .where(and(eq(schema.sellers.userId, user.id), eq(schema.sellers.status, 'approved')))
        .limit(1);
      if (!rows[0]) return fail('FORBIDDEN', 'Your seller account is not active yet.');
    }

    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    if (!apiKey || !apiSecret || !cloudName) {
      return fail('SERVER_ERROR', 'Image uploads are not configured on the server.');
    }

    const timestamp = Math.round(Date.now() / 1000);
    const paramsToSign = { folder: FOLDER, timestamp, upload_preset: UPLOAD_PRESET };
    const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);

    return ok({ ...paramsToSign, signature, apiKey, cloudName });
  });
}
