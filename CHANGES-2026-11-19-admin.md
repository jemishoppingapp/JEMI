# Admin audit and super admin, 2026-11-19 (round 5)

**Needs a database update first:** `db/migrations-manual/2026-11-19-admin.sql`. The fix script offers to run it. Everyone who is an admin today becomes a **super admin**, so nobody loses access.

## Two admin levels
| | Super admin | Staff admin |
|---|---|---|
| Orders, status, gate collection | ✓ | ✓ |
| Products (edit, hide) | ✓ | ✓ (not the margin) |
| Users: view, edit profile, reset buyer/seller passwords | ✓ | ✓ |
| Refunds, payouts, JEMI margin | ✓ | ✗ |
| Approve, reject or suspend sellers | ✓ | ✗ |
| Make or remove admins, change admin levels | ✓ | ✗ |
| Activity log | ✓ | ✗ |

- **New admins start as staff.** A super admin can promote them (Users → Edit).
- **Built-in safety:** you can never remove, demote or disable the **last** super admin, or change your own role.
- **There is now a "Remove admin access" button.** Before, removing an admin needed the database.
- **Seller role can't be set from the user page;** sellers come through the application, since a seller account needs a shop record.

## Activity log (Admin → Activity log)
One row per action, with who did it and when:
- role and admin-level changes, disabling/enabling users, password resets
- refunds (overrides flagged), payouts
- seller approve/reject/suspend
- margin changes and hidden products
- every order status change and every gate collection (short payments flagged)

## Gate and order fixes
- **Pickup code check:** "Collect payment" requires the code the buyer shows, and the server checks it against the order. The code is hidden on the admin page until collection, so it can only come from the buyer.
- **Amount check:** a warning shows when the amount collected is less (or more) than the total. It's also in the confirmation and the log.
- **"Mark completed" is gone for pay-on-delivery orders.** It used to close the order with no money recorded and no seller paid. The server blocks it too.
- **No-show buyers:** "Cancel (buyer didn't come)" now works on orders that are ready for pickup, and puts the stock back.
- **Cancelling asks for a reason, and the buyer gets an email** saying the order was cancelled.
- **Search orders by pickup code** (exact match, indexed), as well as by order number or buyer.
- **New "To collect" filter** (first chip). Each row shows "Collect ₦X", "Collected" and the gate.
- **Buyer's phone has Call and WhatsApp buttons.** Payment status reads in plain words ("Pay ₦9,000 at the gate").

## Dashboard and menu
- **"Orders today"** counts real orders only, not abandoned online checkouts.
- **"Collected today"** shows the money received.
- **"To collect · ₦X"** shows how many orders are waiting at the gate and the cash expected; tap it to open the list.
- **The Orders badge counts orders that need action.** It used to count abandoned checkouts.
- **The menu shows your level** (Super/Staff admin) and a "View shop" link. Staff don't see Payouts or Activity log.
- **Payouts page:** "Recent payouts" history with who recorded each one.
- **Product edit:** a "JEMI margin (%)" field showing what JEMI keeps and what the seller gets. Only super admins can change it.

Checks run: `tsc` is clean, `next build` + lint have no warnings, and the SQL was tested on Postgres (including a re-run that doesn't promote staff added later). The pickup-code search query and the gate panel were checked on a phone-size screen.
