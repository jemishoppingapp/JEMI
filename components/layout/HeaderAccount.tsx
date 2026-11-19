'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { User, Store, LayoutDashboard } from 'lucide-react';
import { UserAvatar } from '@/components/UserAvatar';

type Me = { name: string; role: 'buyer' | 'seller' | 'admin'; avatar: string | null } | null;

const PILL =
  'tap inline-flex items-center gap-1.5 h-10 px-3 rounded-full bg-primary-soft text-primary-text hover:opacity-90 transition-opacity text-xs font-semibold';

/**
 * The signed-in part of the header (dashboard pill + avatar). It loads
 * in the browser from /api/auth/me, so the page around it can be cached
 * at Vercel's edge instead of being rebuilt for every visitor.
 *
 * Until it loads, the icon links to /profile, which already sends
 * signed-out visitors to sign in, so the link is right either way.
 * `children` (the cart button) sits between the pill and the avatar.
 */
export function HeaderAccount({ children }: { children?: React.ReactNode }) {
  const [me, setMe] = useState<Me>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => { if (alive) setMe(body?.data?.user ?? null); })
      .catch(() => { /* offline: keep the generic icon */ });
    return () => { alive = false; };
  }, []);

  return (
    <>
      {me?.role === 'seller' && (
        <Link href="/seller" className={PILL} aria-label="Seller dashboard">
          <Store className="h-4 w-4" />
          <span className="hidden sm:inline">Seller dashboard</span>
          <span className="sm:hidden">Shop</span>
        </Link>
      )}
      {me?.role === 'admin' && (
        <Link href="/admin" className={PILL} aria-label="Admin dashboard">
          <LayoutDashboard className="h-4 w-4" />
          <span className="hidden sm:inline">Admin</span>
        </Link>
      )}
      {children}
      <Link
        href="/profile"
        className="tap inline-flex items-center justify-center h-10 w-10 rounded-full hover:bg-surface-1 transition-colors text-fg"
        aria-label={me ? 'My profile' : 'Sign in or view your account'}
      >
        {me ? <UserAvatar name={me.name} src={me.avatar} size="sm" /> : <User className="h-[18px] w-[18px]" />}
      </Link>
    </>
  );
}
