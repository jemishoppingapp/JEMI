/**
 * Session helpers for Server Components and Route Handlers.
 * Postgres + Drizzle version.
 */
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getAuthCookie } from '@/lib/cookies';
import { verifyToken } from '@/lib/auth';
import { db, schema } from '@/db';

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: 'buyer' | 'admin' | 'seller';
  /** Only meaningful when role === 'admin'. */
  is_super_admin: boolean;
  profile_completed: boolean;
  email_verified: boolean;
  nickname?: string;
  alt_phone?: string;
  address?: string;
  department?: string;
  level?: string;
  avatar?: string;
}

/**
 * Returns the current user or null if not logged in / invalid token /
 * deleted user. Does not redirect.
 */
// Wrapped in React cache(): the Header, the layout and the page all call
// this during one request. Without cache() that was 2-4 identical DB
// round-trips per page view; now it's one.
export const getCurrentUser = cache(async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = await getAuthCookie();
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const rows = await db()
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, payload.sub))
    .limit(1);

  const user = rows[0];
  if (!user) return null;
  // SECURITY (V2): disabled accounts and sessions from before a password
  // change/reset are treated as logged out, immediately.
  if (user.isDisabled) return null;
  if ((payload.tv ?? 0) !== user.tokenVersion) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
    is_super_admin: user.role === 'admin' && user.isSuperAdmin === true,
    profile_completed: user.profileCompleted,
      email_verified: user.emailVerified,
    nickname: user.nickname,
    alt_phone: user.altPhone,
    address: user.address,
    department: user.department,
    level: user.level,
    avatar: user.avatar,
  };
});

/**
 * Server-component / server-action guard. Redirects to /login with a
 * `from` param if not authenticated.
 */
export async function requireAuth(fromPath?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    const qs = fromPath ? `?from=${encodeURIComponent(fromPath)}` : '';
    redirect(`/login${qs}`);
  }
  return user;
}

/**
 * Server-component / server-action guard for admin-only pages.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    redirect('/admin/login');
  }
  return user;
}

/**
 * Super admins only: roles, money (refunds, payouts, margins), seller
 * approvals and the activity log. Staff admins are sent back to the
 * dashboard (pages) or get a 403 (API routes, via withErrorHandling).
 */
export async function requireSuperAdmin(): Promise<CurrentUser> {
  const user = await requireAdmin();
  if (!user.is_super_admin) {
    redirect('/admin?denied=1');
  }
  return user;
}