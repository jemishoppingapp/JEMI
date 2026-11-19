/**
 * SECURITY (V7): product image URLs must be JEMI's own Cloudinary images.
 * Any other URL (another host, javascript:, data:) is rejected, so a
 * listing can't load images from elsewhere or break the page.
 */
import { z } from 'zod';

export function isAllowedImageUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:' || u.hostname !== 'res.cloudinary.com') return false;
  const cloud = process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  return cloud ? u.pathname.startsWith(`/${cloud}/`) : true;
}

export const productImageUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(isAllowedImageUrl, 'Images must be uploaded through JEMI (Cloudinary).');
