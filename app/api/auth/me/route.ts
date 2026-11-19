/**
 * GET /api/auth/me — who is signed in, for the site header.
 *
 * The header used to read the login cookie on the server, which forced
 * EVERY public page to be rendered fresh for every visitor (plus a DB
 * lookup). Now pages can be cached at Vercel's edge, and the header asks
 * this tiny endpoint from the browser instead.
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser().catch(() => null);
  return NextResponse.json(
    {
      ok: true,
      data: { user: user ? { name: user.name, role: user.role, avatar: user.avatar ?? null } : null },
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
