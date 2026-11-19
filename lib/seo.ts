/**
 * Search wording: the words people type into Google ("LASU marketplace",
 * "buy clothes in LASU", "phones Ojo") in titles, descriptions and
 * headings. Edit the copy here; pages read from it.
 *
 * Keep every claim true: pickup at LASU Iba Gate / Iyana Iba Gate,
 * flat ₦500, pay on pickup.
 */

export const SITE_TITLE = 'JEMI: LASU Campus Marketplace. Buy Online, Pick Up at the Gate';
export const SITE_DESCRIPTION =
  'Shop from sellers in and around Lagos State University (LASU), Ojo. Order online and pick up at LASU Iba Gate or Iyana Iba Gate for a flat ₦500.';

export const SITE_KEYWORDS = [
  'LASU', 'LASU marketplace', 'Lagos State University', 'buy and sell in LASU', 'LASU online shop',
  'campus marketplace', 'student shopping Lagos', 'Ojo', 'Iba', 'Iyana Iba', 'JEMI',
];

type CategoryCopy = { name: string; title: string; description: string; intro: string };

/** One entry per category slug (same slugs as CategoryGrid/HeaderCategories). */
export const CATEGORY_SEO: Record<string, CategoryCopy> = {
  fashion: {
    name: 'Fashion',
    title: 'Fashion at LASU: Clothes, Shoes & Bags',
    description: 'Buy clothes, shoes and fashion from sellers around Lagos State University (LASU). Order online, pick up at Iba Gate or Iyana Iba for ₦500.',
    intro: 'Clothes, shoes and everyday fashion from sellers on and around LASU campus. Order here and collect at the gate.',
  },
  electronics: {
    name: 'Electronics',
    title: 'Electronics at LASU: Phones, Gadgets & Accessories',
    description: 'Phones, chargers, earphones and gadgets from sellers near Lagos State University (LASU). Order online and pick up at the LASU gate for ₦500.',
    intro: 'Phones, chargers, earphones and other gadgets from sellers near LASU. Check it at the gate before you pay.',
  },
  food: {
    name: 'Food & drinks',
    title: 'Food & Drinks at LASU: Snacks & Groceries',
    description: 'Snacks, drinks and groceries from sellers around Lagos State University (LASU). Order online, collect at Iba Gate or Iyana Iba for ₦500.',
    intro: 'Snacks, drinks and groceries from sellers around LASU, ready to collect at the gate.',
  },
  accessories: {
    name: 'Accessories',
    title: 'Accessories at LASU: Bags, Wallets & More',
    description: 'Bags, wallets, jewellery and accessories from sellers around Lagos State University (LASU). Order online and pick up at the gate for ₦500.',
    intro: 'Bags, wallets, jewellery and other accessories from sellers around LASU campus.',
  },
};

export function categoryCopy(slug: string): CategoryCopy {
  const known = CATEGORY_SEO[slug];
  if (known) return known;
  const name = slug.charAt(0).toUpperCase() + slug.slice(1);
  return {
    name,
    title: `${name} at LASU`,
    description: `Shop ${name.toLowerCase()} from sellers around Lagos State University (LASU) on JEMI. Pick up at the LASU gate for ₦500.`,
    intro: `${name} from sellers around LASU campus.`,
  };
}
