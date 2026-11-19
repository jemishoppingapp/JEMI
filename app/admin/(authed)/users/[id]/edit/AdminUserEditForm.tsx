'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, AlertTriangle, ShieldCheck, Ban, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch, ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface UserData {
  id: string;
  email: string;
  name: string;
  phone: string;
  altPhone: string;
  address: string;
  department: string;
  level: string;
  role: 'buyer' | 'admin' | 'seller';
  isDisabled: boolean;
  isSuperAdmin: boolean;
  profileCompleted: boolean;
}

const LEVELS = ['', '100 Level', '200 Level', '300 Level', '400 Level', '500 Level', 'Postgraduate', 'Staff', 'Non-student'];

export function AdminUserEditForm({
  user, isSelf, viewerIsSuper,
}: { user: UserData; isSelf: boolean; viewerIsSuper: boolean }) {
  // Staff admins can't touch other admins' passwords, roles or access.
  const canManageThisUser = viewerIsSuper || user.role !== 'admin';
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [altPhone, setAltPhone] = useState(user.altPhone);
  const [address, setAddress] = useState(user.address);
  const [department, setDepartment] = useState(user.department);
  const [level, setLevel] = useState(user.level);
  const [savingProfile, setSavingProfile] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  const [promoting, setPromoting] = useState(false);
  const [togglingDisabled, setTogglingDisabled] = useState(false);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        body: { kind: 'profile', name, phone, alt_phone: altPhone, address, department, level },
      });
      toast.success('User profile saved');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setSavingProfile(false);
    }
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      toast.error('Password must contain a letter and a number.');
      return;
    }
    if (!confirm(`Reset password for ${user.email}? They'll need to use the new password to sign in.`)) {
      return;
    }
    setResettingPassword(true);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        body: { kind: 'password_reset', new_password: newPassword },
      });
      toast.success(`Password reset. Share "${newPassword}" with ${user.email} securely.`);
      setNewPassword('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Reset failed');
    } finally {
      setResettingPassword(false);
    }
  }

  async function changeAccess(
    body: { kind: 'role'; role: 'buyer' | 'admin' } | { kind: 'admin_level'; is_super_admin: boolean },
    question: string,
    done: string,
  ) {
    if (!confirm(question)) return;
    setPromoting(true);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, { method: 'PATCH', body });
      toast.success(done);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Update failed');
    } finally {
      setPromoting(false);
    }
  }

  async function toggleDisabled() {
    const action = user.isDisabled ? 'enable' : 'disable';
    if (!confirm(`${action === 'disable' ? 'Disable' : 'Re-enable'} ${user.email}?\n\n${action === 'disable' ? "They won't be able to sign in or place orders." : 'They will be able to sign in again.'}`)) {
      return;
    }
    setTogglingDisabled(true);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        body: { kind: 'disabled', is_disabled: !user.isDisabled },
      });
      toast.success(`User ${action === 'disable' ? 'disabled' : 'enabled'}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Update failed');
    } finally {
      setTogglingDisabled(false);
    }
  }

  return (
    <div className="space-y-5">
      {user.isDisabled && (
        <div className="rounded-2xl border border-danger/30 bg-danger/5 p-4 flex items-start gap-3">
          <Ban className="h-5 w-5 text-danger shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-fg">This account is disabled</p>
            <p className="text-xs text-fg-2 mt-0.5">User cannot sign in or place orders until re-enabled.</p>
          </div>
        </div>
      )}

      <form onSubmit={saveProfile} className="bg-surface border border-border-soft rounded-2xl p-6">
        <h2 className="font-display text-base font-semibold text-fg mb-5">Profile</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="email" className="text-fg-1">Email</Label>
            <Input id="email" value={user.email} disabled className="mt-1.5" />
            <p className="text-[11px] text-fg-3 mt-1">Email can't be changed.</p>
          </div>
          <div>
            <Label htmlFor="name" className="text-fg-1">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="phone" className="text-fg-1">Phone</Label>
            <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="altPhone" className="text-fg-1">Alt phone</Label>
            <Input id="altPhone" type="tel" value={altPhone} onChange={(e) => setAltPhone(e.target.value)} className="mt-1.5" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="address" className="text-fg-1">Address</Label>
            <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="department" className="text-fg-1">Department</Label>
            <Input id="department" value={department} onChange={(e) => setDepartment(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="level" className="text-fg-1">Level</Label>
            <select id="level" value={level} onChange={(e) => setLevel(e.target.value)}
              className="mt-1.5 w-full h-11 px-3 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              {LEVELS.map((l) => (<option key={l} value={l}>{l || '— None —'}</option>))}
            </select>
          </div>
        </div>
        <div className="mt-5">
          <Button type="submit" variant="default" size="tap" disabled={savingProfile}>
            {savingProfile ? (<><Loader2 className="h-4 w-4 animate-spin" />Saving…</>) : 'Save profile'}
          </Button>
        </div>
      </form>

      {/* Own password: My Profile. Other admins' passwords: super admins only. */}
      {!isSelf && canManageThisUser && (
      <form onSubmit={resetPassword} className="bg-surface border border-border-soft rounded-2xl p-6">
        <h2 className="font-display text-base font-semibold text-fg mb-2">Reset password</h2>
        <p className="text-sm text-fg-2 mb-5">
          Set a new password without knowing the current one. Tell the user securely afterwards.
        </p>
        <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <Label htmlFor="newPassword" className="text-fg-1">New password</Label>
            <Input id="newPassword" type="text" value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 chars with a letter + number"
              className="mt-1.5 font-mono" />
          </div>
          <Button type="submit" variant="default" size="tap" disabled={resettingPassword || newPassword.length === 0}>
            {resettingPassword ? (<><Loader2 className="h-4 w-4 animate-spin" />Resetting…</>) : 'Reset password'}
          </Button>
        </div>
      </form>
      )}

      {/* Role & admin level: super admins only */}
      {!isSelf && user.role !== 'seller' && (
        <div className="bg-surface border border-border-soft rounded-2xl p-6">
          <h2 className="font-display text-base font-semibold text-fg mb-2">Role</h2>
          <p className="text-sm text-fg-2 mb-5">
            {user.role === 'buyer' && <>Currently a <span className="font-medium text-fg">buyer</span>.</>}
            {user.role === 'admin' && (
              <>Currently a <span className="font-medium text-fg inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" />{user.isSuperAdmin ? 'super admin' : 'staff admin'}</span>.</>
            )}
          </p>
          {viewerIsSuper ? (
            <div className="flex flex-wrap gap-2">
              {user.role === 'buyer' && (
                <Button type="button" variant="outline" size="tap" disabled={promoting}
                  onClick={() => changeAccess({ kind: 'role', role: 'admin' },
                    `Make ${user.email} a STAFF admin?\n\nThey can manage orders, gate collection, products and users' profiles. They can't touch money, roles or sellers.`,
                    `${user.email} is now a staff admin`)}>
                  <ShieldCheck className="h-4 w-4" /> Make staff admin
                </Button>
              )}
              {user.role === 'admin' && !user.isSuperAdmin && (
                <Button type="button" variant="outline" size="tap" disabled={promoting}
                  onClick={() => changeAccess({ kind: 'admin_level', is_super_admin: true },
                    `Make ${user.email} a SUPER admin?\n\nThey get full control: refunds, payouts, margins, roles and sellers.`,
                    `${user.email} is now a super admin`)}>
                  <ShieldCheck className="h-4 w-4" /> Make super admin
                </Button>
              )}
              {user.role === 'admin' && user.isSuperAdmin && (
                <Button type="button" variant="outline" size="tap" disabled={promoting}
                  onClick={() => changeAccess({ kind: 'admin_level', is_super_admin: false },
                    `Change ${user.email} to STAFF admin? They lose access to money, roles and sellers.`,
                    `${user.email} is now a staff admin`)}>
                  Change to staff admin
                </Button>
              )}
              {user.role === 'admin' && (
                <Button type="button" variant="outline" size="tap" disabled={promoting} className="text-danger hover:bg-danger/5"
                  onClick={() => changeAccess({ kind: 'role', role: 'buyer' },
                    `Remove admin access from ${user.email}? They become a normal buyer and are signed out of the admin panel.`,
                    `${user.email} is no longer an admin`)}>
                  Remove admin access
                </Button>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-fg-3">Only a super admin can change roles.</p>
          )}
        </div>
      )}

      {!isSelf && user.role === 'seller' && (
        <div className="bg-surface border border-border-soft rounded-2xl p-6">
          <h2 className="font-display text-base font-semibold text-fg mb-2">Role</h2>
          <p className="text-sm text-fg-2">
            This user is a <span className="font-medium text-fg">seller</span>.
            Manage their shop under <a href={`/admin/sellers`} className="text-primary hover:underline">Sellers</a>.
          </p>
        </div>
      )}

      {isSelf && user.role === 'admin' && (
        <div className="bg-surface border border-border-soft rounded-2xl p-6">
          <h2 className="font-display text-base font-semibold text-fg mb-2">Role</h2>
          <p className="text-sm text-fg-2">
            You are a <span className="font-medium text-fg inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> {user.isSuperAdmin ? 'super admin' : 'staff admin'}</span>.
          </p>
        </div>
      )}

      {!isSelf && canManageThisUser && (
        <div className={cn(
          'border rounded-2xl p-6',
          user.isDisabled ? 'bg-surface border-border-soft' : 'bg-surface border-border-soft'
        )}>
          <h2 className="font-display text-base font-semibold text-fg mb-2">
            {user.isDisabled ? 'Re-enable account' : 'Disable account'}
          </h2>
          <p className="text-sm text-fg-2 mb-5">
            {user.isDisabled
              ? 'This account is disabled. Re-enabling lets the user sign in and place orders again.'
              : 'Disabling blocks this user from signing in and placing orders. Existing orders are not affected. Reversible.'}
          </p>
          <Button
            type="button"
            variant="outline"
            size="tap"
            onClick={toggleDisabled}
            disabled={togglingDisabled}
            className={user.isDisabled ? '' : 'text-danger hover:bg-danger/5'}
          >
            {user.isDisabled ? <RotateCcw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
            {togglingDisabled ? 'Updating…' : (user.isDisabled ? 'Re-enable account' : 'Disable account')}
          </Button>
        </div>
      )}

      {isSelf && (
        <div className="rounded-2xl border border-warning/30 bg-warning/5 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="text-sm text-fg-1">
            This is your own account. You can't disable yourself or change your own role from here.
            Use <a href="/admin/profile" className="text-primary hover:underline">My Profile</a> for your own changes.
          </div>
        </div>
      )}
    </div>
  );
}