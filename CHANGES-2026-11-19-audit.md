# Full audit fixes, 2026-11-19 (round 2)

A read-through of every page, API route, component and helper, looking for bugs, UX, scalability and readability problems. This round needs no database changes.

## Bugs
| # | Problem | Fix |
|---|---|---|
| 1 | **Contact, Terms and Privacy pages showed placeholder contacts** (`support@jemi.example`, `+234 800 000 0000`). | Real email and WhatsApp in `lib/site.ts`. |
| 2 | **A product saved with no images crashed the home and shop grids for everyone.** Editing allowed removing every image, and the image component throws on an empty source. | Edits now require at least 1 image; cards show a placeholder when an image is missing. |
| 3 | **Cart prices were a snapshot from when the item was added.** Cart and checkout (including "Pay ₦X at pickup") could show an old price, a deleted product, or more than is in stock. | New `POST /api/cart/validate`. The cart and checkout refresh prices and stock when they open, and tell the buyer what changed. |
| 4 | **The cart could hold more than the stock.** | The cart remembers each item's stock and caps the quantity (+ button disabled at the limit). |
| 5 | **Dates showed UTC time, 1 hour behind Lagos** (order timelines, admin, seller, payouts). | 19 date displays now use `Africa/Lagos`. |
| 6 | **Login redirect accepted `?from=//other-site.com`** (an open redirect). | `safeRedirectPath()` in login, complete-profile and verify-email. |
| 7 | **A database error on a product page was treated as "not found"**, so a 404 would have been cached for a real product. | It now rethrows, so the cached copy keeps being served. |
| 8 | **Admin refund:** no way to use the new "sellers already paid" override; button was green with red text. | Override checkbox with a warning; red button. |

## UX
- **Payment copy now matches pay-on-delivery mode.** Cart, checkout title and the product page no longer say "pay with Paystack" or "code shown after payment".
- **Dark mode fixes:** about 20 hardcoded light-mode greys replaced with theme colours (quantity buttons, labels, dialogs, badges, skeletons, error screens).
- **Show/hide password button** on all 12 password fields.
- **The phone bottom bar no longer covers the end of the page** (footer padding).
- **No more endless spinners:** requests give up after 30s with "This is taking too long. Check your connection".
- **The homepage no longer shows "Nothing here yet"** when products exist but none are marked featured; it shows the newest products instead.
- The cart heading counts units (2 hoodies = 2 items), and product descriptions keep their line breaks.

## Speed and scalability
- **The header no longer reads the login cookie on the server** (`HeaderAccount` + `GET /api/auth/me`). That one change makes these cacheable at Vercel's edge:
  - the **homepage**: served from cache, refreshed at most every 60s;
  - **product pages**: built on first visit, then cached;
  - the about, contact, terms, privacy, become-a-seller and cart pages: fully static.
- **Saving a product refreshes the cached pages immediately** (`lib/revalidate.ts`), as does placing an order (stock changes).
- **Product pages make 1 database query instead of 2** (`cache()`).

## Readability
- `lib/shop-config.ts` is the one place for the delivery fee, gates and payment-mode type; they used to be copied into 3 files.
- The checkout and cart get the payment mode from the server (`PAYMENT_MODE`), so `NEXT_PUBLIC_PAYMENT_MODE` is no longer used.
- `toProductCard()` replaces a mapping that was copied into the home and shop pages.

## Recommended next (not done)
- **Escrow cron batches:** it handles at most 50 orders per pass, once a day. Loop with a time budget before switching to Paystack.
- **`order_items` table** with `seller_id`. Seller pages currently scan order JSON.
- **Model `search_vector` as a tsvector `customType`** so `db:push` stops trying to change it.
- **The repo is public on GitHub.** No secrets are in it, but anyone can read the code. Make it private (Settings → Danger Zone) unless you mean it to be open.

Checks run: `tsc --noEmit` is clean and `next build` with lint passes with no warnings. A local run confirmed the homepage cache HIT (`s-maxage=60`), `/api/auth/me`, cart validation, the contact details and the password toggle. A cart logic test passed, and phone-size screenshots in dark mode look right.
