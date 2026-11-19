/**
 * The home page and product pages are cached (revalidate = 60). After a
 * product is created, edited or removed, call this so shoppers see the
 * change right away instead of up to a minute later.
 */
import { revalidatePath } from 'next/cache';

export function revalidateProductPages(): void {
  try {
    revalidatePath('/');
    revalidatePath('/products/[slug]', 'page'); // every product page
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[revalidate] failed (pages refresh within 60s anyway):', e);
  }
}
