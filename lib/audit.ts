/**
 * Admin activity log. Every action that changes money, roles or seller
 * status writes one row, so you can always see who did what and when
 * (Admin > Activity, super admins only).
 *
 * Never throws: a logging hiccup must not undo or block the action.
 */
import { db, schema } from '@/db';
import type { CurrentUser } from '@/lib/session';

export async function logAdminAction(
  actor: Pick<CurrentUser, 'id' | 'email'>,
  action: string,
  target: { type: string; id: string },
  summary: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  try {
    await db().insert(schema.adminAuditLog).values({
      actorId: actor.id,
      actorEmail: actor.email,
      action,
      targetType: target.type,
      targetId: target.id,
      summary: summary.slice(0, 500),
      details,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[audit] could not write log row:', e);
  }
}
