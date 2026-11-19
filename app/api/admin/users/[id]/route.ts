import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { requireAdmin } from '@/lib/session';
import { ok, fail, failValidation, withErrorHandling } from '@/lib/api';
import { logAdminAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BCRYPT_ROUNDS = 12;

// The edit form sends one of four shapes, discriminated by `kind`.
const profileSchema = z.object({
  kind: z.literal('profile'),
  name: z.string().trim().min(1, 'Name is required.').max(100),
  phone: z.string().trim().max(20).default(''),
  alt_phone: z.string().trim().max(20).default(''),
  address: z.string().trim().max(500).default(''),
  department: z.string().trim().max(100).default(''),
  level: z.string().trim().max(50).default(''),
});

const passwordSchema = z.object({
  kind: z.literal('password_reset'),
  new_password: z.string().min(8, 'Password must be at least 8 characters.').max(72),
});

const roleSchema = z.object({
  kind: z.literal('role'),
  // 'seller' is not settable here: seller accounts need a shop record
  // and are created through the seller application.
  role: z.enum(['buyer', 'admin']),
});
const adminLevelSchema = z.object({
  kind: z.literal('admin_level'),
  is_super_admin: z.boolean(),
});

const disabledSchema = z.object({
  kind: z.literal('disabled'),
  is_disabled: z.boolean(),
});

const patchSchema = z.discriminatedUnion('kind', [
  profileSchema, passwordSchema, roleSchema, adminLevelSchema, disabledSchema,
]);

/** How many enabled super admins exist (never let this reach 0). */
async function countSuperAdmins(): Promise<number> {
  const r = await db().execute(sql`
    SELECT count(*)::int AS n FROM users
    WHERE role = 'admin' AND is_super_admin = true AND is_disabled = false`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Number((r.rows[0] as any)?.n ?? 0);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    let admin;
    try {
      admin = await requireAdmin();
    } catch {
      return fail('FORBIDDEN', 'Admin access required.');
    }

    const { id } = await params;

    // Confirm the target user exists.
    const rows = await db().select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    const target = rows[0];
    if (!target) return fail('NOT_FOUND', 'User not found.');

    let parsed: z.infer<typeof patchSchema>;
    try {
      const body = await req.json();
      parsed = patchSchema.parse(body);
    } catch (err) {
      if (err instanceof z.ZodError) return failValidation(err);
      return fail('VALIDATION_ERROR', 'Invalid request body.');
    }

    if (parsed.kind === 'profile') {
      await db().update(schema.users).set({
        name: parsed.name,
        phone: parsed.phone,
        altPhone: parsed.alt_phone,
        address: parsed.address,
        department: parsed.department,
        level: parsed.level,
        updatedAt: new Date(),
      }).where(eq(schema.users.id, id));
      await logAdminAction(admin, 'user.profile', { type: 'user', id }, `Edited profile of ${target.email}`);
      return ok({ success: true });
    }

    const targetIsAdmin = target.role === 'admin';
    const isSuper = admin.is_super_admin;

    if (parsed.kind === 'password_reset') {
      // Staff can reset buyers' and sellers' passwords (support work);
      // only a super admin can reset another admin's password.
      if (targetIsAdmin && !isSuper) {
        return fail('FORBIDDEN', "Only a super admin can reset an admin's password.");
      }
      if (target.id === admin.id) {
        return fail('VALIDATION_ERROR', 'Change your own password under My Profile.');
      }
      // Match the register route: bcryptjs, 12 rounds.
      if (!/[A-Za-z]/.test(parsed.new_password) || !/\d/.test(parsed.new_password)) {
        return fail('VALIDATION_ERROR', 'Password must contain a letter and a number.', 'new_password');
      }
      const hash = await bcrypt.hash(parsed.new_password, BCRYPT_ROUNDS);
      await db().update(schema.users).set({
        password: hash,
        tokenVersion: sql`${schema.users.tokenVersion} + 1`, // V2: log out everywhere
        updatedAt: new Date(),
      }).where(eq(schema.users.id, id));
      await logAdminAction(admin, 'user.password_reset', { type: 'user', id }, `Reset password of ${target.email}`);
      return ok({ success: true });
    }

    if (parsed.kind === 'role') {
      if (!isSuper) return fail('FORBIDDEN', 'Only a super admin can change roles.');
      // Guardrail: don't let an admin strip their OWN admin role here.
      if (target.id === admin.id && parsed.role !== 'admin') {
        return fail('VALIDATION_ERROR', "You can't remove your own admin role.");
      }
      if (targetIsAdmin && target.isSuperAdmin && parsed.role !== 'admin' && (await countSuperAdmins()) <= 1) {
        return fail('VALIDATION_ERROR', 'This is the last super admin. Make someone else a super admin first.');
      }
      // Sellers can never be promoted to admin (business rule).
      if (target.role === 'seller' && parsed.role === 'admin') {
        return fail('VALIDATION_ERROR', 'Seller accounts cannot be promoted to admin.');
      }
      await db().update(schema.users).set({
        role: parsed.role,
        // New admins start as STAFF; leaving admin clears the super flag.
        isSuperAdmin: parsed.role === 'admin' ? target.isSuperAdmin : false,
        tokenVersion: sql`${schema.users.tokenVersion} + 1`, // V2: old role's cookies stop working
        updatedAt: new Date(),
      }).where(eq(schema.users.id, id));
      await logAdminAction(admin, 'user.role', { type: 'user', id },
        `Changed ${target.email} from ${target.role} to ${parsed.role}`, { from: target.role, to: parsed.role });
      return ok({ success: true });
    }

    if (parsed.kind === 'admin_level') {
      if (!isSuper) return fail('FORBIDDEN', 'Only a super admin can change admin levels.');
      if (!targetIsAdmin) return fail('VALIDATION_ERROR', 'Make this user an admin first.');
      if (target.id === admin.id) return fail('VALIDATION_ERROR', "You can't change your own admin level.");
      if (target.isSuperAdmin && !parsed.is_super_admin && (await countSuperAdmins()) <= 1) {
        return fail('VALIDATION_ERROR', 'This is the last super admin. Make someone else a super admin first.');
      }
      await db().update(schema.users).set({
        isSuperAdmin: parsed.is_super_admin,
        tokenVersion: sql`${schema.users.tokenVersion} + 1`,
        updatedAt: new Date(),
      }).where(eq(schema.users.id, id));
      await logAdminAction(admin, 'user.admin_level', { type: 'user', id },
        `${parsed.is_super_admin ? 'Made' : 'Removed'} super admin: ${target.email}`, { is_super_admin: parsed.is_super_admin });
      return ok({ success: true });
    }

    if (parsed.kind === 'disabled') {
      // Guardrail: don't let an admin disable themselves.
      if (target.id === admin.id && parsed.is_disabled) {
        return fail('VALIDATION_ERROR', "You can't disable your own account.");
      }
      if (targetIsAdmin && !isSuper) {
        return fail('FORBIDDEN', 'Only a super admin can disable or enable an admin.');
      }
      if (targetIsAdmin && target.isSuperAdmin && parsed.is_disabled && (await countSuperAdmins()) <= 1) {
        return fail('VALIDATION_ERROR', 'This is the last super admin and cannot be disabled.');
      }
      await db().update(schema.users).set({
        isDisabled: parsed.is_disabled,
        tokenVersion: sql`${schema.users.tokenVersion} + 1`, // V2: kick live sessions
        updatedAt: new Date(),
      }).where(eq(schema.users.id, id));
      await logAdminAction(admin, parsed.is_disabled ? 'user.disable' : 'user.enable', { type: 'user', id },
        `${parsed.is_disabled ? 'Disabled' : 'Re-enabled'} ${target.email}`);
      return ok({ success: true });
    }

    return fail('VALIDATION_ERROR', 'Unknown action.');
  });
}