/**
 * Column sets for public product queries.
 *
 * Listing pages used to `select()` every column, including the long
 * description, the search_vector and internal fields (margin %, seller
 * id). On a 24-item page that's a lot of bytes over Neon's HTTP driver
 * for nothing. Card views only need these.
 */
import { schema } from '@/db';
import type { ProductCardData } from '@/components/product/ProductCard';

export const productCardColumns = {
  id: schema.products.id,
  slug: schema.products.slug,
  name: schema.products.name,
  price: schema.products.price,
  originalPrice: schema.products.originalPrice,
  images: schema.products.images,
  seller: schema.products.seller,
  rating: schema.products.rating,
  reviewCount: schema.products.reviewCount,
  inStock: schema.products.inStock,
};

/**
 * SECURITY (V10): everything a shopper may see about a product. Leaves
 * out JEMI's margin %, the internal seller id and the search vector,
 * which the public JSON APIs used to return.
 */
export const productPublicColumns = {
  ...productCardColumns,
  description: schema.products.description,
  category: schema.products.category,
  features: schema.products.features,
  color: schema.products.color,
  stockQuantity: schema.products.stockQuantity,
  isFeatured: schema.products.isFeatured,
  createdAt: schema.products.createdAt,
};

type CardRow = {
  id: string; slug: string; name: string; price: string; originalPrice: string | null;
  images: { url: string; alt?: string }[] | null; seller: string; rating: string;
  reviewCount: number; inStock: boolean;
};

/** A row selected with productCardColumns -> what <ProductCard> needs.
 *  (This mapping used to be copied into the home and shop pages.) */
export function toProductCard(d: CardRow): ProductCardData {
  return {
    _id: d.id,
    slug: d.slug,
    name: d.name,
    price: Number(d.price),
    originalPrice: d.originalPrice ? Number(d.originalPrice) : undefined,
    imageUrl: d.images?.[0]?.url ?? '',
    imageAlt: d.images?.[0]?.alt ?? d.name,
    seller: d.seller,
    rating: Number(d.rating),
    reviewCount: d.reviewCount,
    inStock: d.inStock,
  };
}
