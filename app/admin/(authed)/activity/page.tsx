import type { Metadata } from 'next';
import Link from 'next/link';
import { desc, like, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requireSuperAdmin } from '@/lib/session';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Activity log', robots: { index: false } };

const PAGE_SIZE = 50;

// Filter chips: action prefixes written by lib/audit.ts callers.
const FILTERS = [
  { slug: '', label: 'Everything' },
  { slug: 'order.', label: 'Orders & collections' },
  { slug: 'payout.', label: 'Payouts' },
  { slug: 'user.', label: 'Users & roles' },
  { slug: 'seller.', label: 'Sellers' },
  { slug: 'product.', label: 'Products & margins' },
];

/**
 * Who did what in the admin panel: roles, refunds, payouts, gate
 * collections, seller decisions, margin changes. Super admins only.
 */
export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const type = FILTERS.some((f) => f.slug === sp.type) ? (sp.type as string) : '';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const where = type ? like(schema.adminAuditLog.action, `${type}%`) : undefined;

  const [rows, countRows] = await Promise.all([
    db().select().from(schema.adminAuditLog).where(where)
      .orderBy(desc(schema.adminAuditLog.createdAt))
      .limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE)
      .catch(() => []),
    db().select({ n: sql<number>`count(*)::int` }).from(schema.adminAuditLog).where(where)
      .catch(() => [{ n: 0 }]),
  ]);
  const total = countRows[0]?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (t: string, p = 1) => {
    const q = new URLSearchParams();
    if (t) q.set('type', t);
    if (p > 1) q.set('page', String(p));
    const qs = q.toString();
    return qs ? `/admin/activity?${qs}` : '/admin/activity';
  };

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-4xl">
      <h1 className="font-display text-2xl sm:text-3xl font-semibold text-fg mb-1">Activity log</h1>
      <p className="text-sm text-fg-2 mb-6">Every admin action that touches money, roles or sellers. Newest first.</p>

      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 mb-5">
        {FILTERS.map((f) => (
          <Link key={f.slug || 'all'} href={href(f.slug)}
            className={cn(
              'shrink-0 inline-flex items-center px-3 h-9 rounded-full text-xs font-medium border transition-colors',
              f.slug === type ? 'bg-fg text-fg-inverse border-fg' : 'bg-surface text-fg-2 border-border hover:bg-surface-1'
            )}>
            {f.label}
          </Link>
        ))}
      </div>

      <div className="bg-surface border border-border-soft rounded-2xl overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-fg-2">Nothing logged yet.</p>
        ) : (
          <ul className="divide-y divide-border-soft">
            {rows.map((r) => (
              <li key={r.id} className="px-5 py-3">
                <p className="text-sm text-fg">{r.summary || r.action}</p>
                <p className="text-[11px] text-fg-3 mt-0.5">
                  {new Date(r.createdAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  {' · '}{r.actorEmail || 'unknown'}{' · '}<span className="font-mono">{r.action}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-3 mt-6 text-sm">
          {page > 1 && <Link href={href(type, page - 1)} className="px-3 h-9 inline-flex items-center rounded-md border border-border-soft bg-surface hover:bg-surface-1">Previous</Link>}
          <span className="text-fg-2">Page {page} of {totalPages}</span>
          {page < totalPages && <Link href={href(type, page + 1)} className="px-3 h-9 inline-flex items-center rounded-md border border-border-soft bg-surface hover:bg-surface-1">Next</Link>}
        </nav>
      )}
    </div>
  );
}
