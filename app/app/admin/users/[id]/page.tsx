'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Ban,
  CheckCircle,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Save,
  Trash2,
  UserCog,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/AuthProvider';
import { supabase } from '@/lib/supabase/client';
import { UserRole } from '@/lib/types/database';

type RoleSelect = UserRole | 'SUPER_ADMIN';

type UserDetails = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  position: string | null;
  role: UserRole;
  organization_id: string | null;
  disabled: boolean | null;
  created_at: string | null;
  is_super_admin: boolean;
  is_creator: boolean;
  is_pending?: boolean;
  organizations: { name: string } | null;
};

type UserForm = {
  first_name: string;
  last_name: string;
  phone: string;
  position: string;
  role: RoleSelect;
};

const ROLE_OPTIONS: UserRole[] = ['OWNER', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'FINANCE'];
const NON_ADMIN_ROLES: UserRole[] = ['MANAGER', 'ACCOUNTANT', 'FINANCE'];

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function getStatusLabel(user: UserDetails | null) {
  if (!user) return '-';
  if (user.is_pending) return 'Pending confirmation';
  if (user.disabled) return 'Disabled';
  return 'Active';
}

function normalizeForm(user: UserDetails): UserForm {
  return {
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    phone: user.phone || '',
    position: user.position || '',
    role: user.is_super_admin ? 'SUPER_ADMIN' : user.role,
  };
}

export default function AdminUserDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const userIdParam = params?.id;
  const userId = Array.isArray(userIdParam)
    ? userIdParam[0] || ''
    : typeof userIdParam === 'string'
      ? userIdParam
      : '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [user, setUser] = useState<UserDetails | null>(null);
  const [form, setForm] = useState<UserForm>({
    first_name: '',
    last_name: '',
    phone: '',
    position: '',
    role: 'MANAGER',
  });
  const [canManage, setCanManage] = useState(false);

  const isSuperAdmin = !!(profile as any)?.is_super_admin;
  const canViewUsers =
    !!profile &&
    ((profile as any).is_super_admin || profile.role === 'OWNER' || profile.role === 'ADMIN');

  useEffect(() => {
    if (authLoading) return;
    if (!profile) {
      router.push('/login');
      return;
    }
    if (!canViewUsers) {
      router.push('/app');
      return;
    }
    if (!userId) return;
    void fetchUserDetails();
  }, [authLoading, canViewUsers, profile, router, userId]);

  const fetchUserDetails = async () => {
    try {
      setLoading(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error('Not authenticated');
        return;
      }

      const res = await fetch(`/api/admin/users/details?userId=${userId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        toast.error(data?.error || 'Failed to load user');
        router.push('/app/admin/users');
        return;
      }

      setUser(data.user ?? null);
      setCanManage(!!data.can_manage);
      if (data.user) {
        setForm(normalizeForm(data.user));
      }
    } catch (error) {
      console.error('FETCH USER DETAILS ERROR:', error);
      toast.error('Failed to load user');
      router.push('/app/admin/users');
    } finally {
      setLoading(false);
    }
  };

  const getAvailableRoles = () => {
    if (isSuperAdmin) return ROLE_OPTIONS;
    if (profile?.role === 'OWNER') return ROLE_OPTIONS;
    return NON_ADMIN_ROLES;
  };

  const canDisableUser = (targetUser: UserDetails) => {
    if (!profile) return false;
    if (targetUser.id === profile.id) return false;
    if (targetUser.is_creator || targetUser.is_super_admin) return false;
    if (isSuperAdmin) return true;
    if (targetUser.role === 'OWNER') return false;
    return true;
  };

  const updateField = <K extends keyof UserForm>(key: K, value: UserForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!user) return;

    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast.error('First name and last name are required');
      return;
    }

    if (form.role === 'SUPER_ADMIN' && !isSuperAdmin) {
      toast.error('Only SUPER_ADMIN can assign SUPER_ADMIN');
      return;
    }

    try {
      setSaving(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error('Not authenticated');
        return;
      }

      const res = await fetch('/api/admin/users/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId: user.id,
          first_name: form.first_name,
          last_name: form.last_name,
          phone: form.phone,
          position: form.position,
          role: form.role === 'SUPER_ADMIN' ? user.role : form.role,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error || 'Failed to update user');
        return;
      }

      toast.success('User updated');
      setEditing(false);
      await fetchUserDetails();
    } catch (error) {
      console.error('UPDATE USER DETAILS ERROR:', error);
      toast.error('Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleDisabled = async () => {
    if (!user) return;

    try {
      setToggling(true);

      const res = await fetch('/api/admin/users/toggle-disabled', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          disabled: !user.disabled,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error || 'Failed to update status');
        return;
      }

      toast.success(user.disabled ? 'User enabled' : 'User disabled');
      await fetchUserDetails();
    } catch (error) {
      console.error('TOGGLE USER DETAILS ERROR:', error);
      toast.error('Failed to update status');
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    if (!user) return;
    if (!confirm(`Delete user "${user.email}"?`)) return;

    try {
      setDeleting(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error('Not authenticated');
        return;
      }

      const res = await fetch('/api/admin/users/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId: user.id }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error || 'Failed to delete user');
        return;
      }

      toast.success('User deleted');
      router.push('/app/admin/users');
    } catch (error) {
      console.error('DELETE USER DETAILS ERROR:', error);
      toast.error('Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin" />
          <p className="mt-3 text-sm text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || !profile || !canViewUsers) {
    return null;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <button
        type="button"
        onClick={() => router.push('/app/admin/users')}
        className="inline-flex items-center gap-2 rounded-md border px-4 py-2 hover:bg-slate-50"
      >
        <ArrowLeft size={16} />
        Back to Manage Users
      </button>

      <div className="rounded-2xl border bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <UserCog className="h-7 w-7 text-slate-500" />
              <h1 className="text-4xl font-bold">
                {[user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || 'Manager'}
              </h1>
              <span className="inline-flex rounded-md bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                {getStatusLabel(user)}
              </span>
            </div>

            <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              <div>Organization <span className="font-medium text-slate-900">{user.organizations?.name || '-'}</span></div>
              <div>Role <span className="font-medium text-slate-900">{user.is_super_admin ? 'SUPER_ADMIN' : user.role}</span></div>
              <div>Email <span className="font-medium text-slate-900">{user.email || '-'}</span></div>
              <div>Joined <span className="font-medium text-slate-900">{formatDateTime(user.created_at)}</span></div>
            </div>
          </div>

          {canManage ? (
            <div className="flex flex-wrap items-center gap-3">
              {editing ? (
                <>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Save size={16} />
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setForm(normalizeForm(user));
                    }}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-md border px-4 py-2 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <X size={16} />
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-2 rounded-md border px-4 py-2 hover:bg-slate-50"
                  >
                    <Pencil size={16} />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleDisabled}
                    disabled={toggling || !canDisableUser(user)}
                    className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 disabled:opacity-50 ${
                      user.disabled
                        ? 'hover:bg-slate-50'
                        : 'border-red-200 text-red-600 hover:bg-red-50'
                    }`}
                  >
                    {user.disabled ? <CheckCircle size={16} /> : <Ban size={16} />}
                    {toggling ? 'Processing...' : user.disabled ? 'Enable' : 'Disable'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="inline-flex items-center gap-2 rounded-md border border-red-200 px-4 py-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 size={16} />
                    {deleting ? 'Deleting...' : 'Delete'}
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border bg-white p-6">
          <h2 className="text-center text-xl font-semibold">Manager Information</h2>

          {editing ? (
            <div className="mt-6 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-sm text-slate-500">First name</div>
                  <input
                    value={form.first_name}
                    onChange={(e) => updateField('first_name', e.target.value)}
                    className="w-full rounded-md border px-3 py-2"
                  />
                </div>
                <div>
                  <div className="mb-1 text-sm text-slate-500">Last name</div>
                  <input
                    value={form.last_name}
                    onChange={(e) => updateField('last_name', e.target.value)}
                    className="w-full rounded-md border px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-sm text-slate-500">Phone</div>
                  <input
                    value={form.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    className="w-full rounded-md border px-3 py-2"
                  />
                </div>
                <div>
                  <div className="mb-1 text-sm text-slate-500">Position</div>
                  <input
                    value={form.position}
                    onChange={(e) => updateField('position', e.target.value)}
                    className="w-full rounded-md border px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-sm text-slate-500">Role</div>
                  <select
                    value={form.role}
                    onChange={(e) => updateField('role', e.target.value as RoleSelect)}
                    className="w-full rounded-md border px-3 py-2"
                    disabled={user.is_super_admin}
                  >
                    {user.is_super_admin ? <option value="SUPER_ADMIN">SUPER_ADMIN</option> : null}
                    {getAvailableRoles().map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="mb-1 text-sm text-slate-500">Organization</div>
                  <input
                    value={user.organizations?.name || '-'}
                    disabled
                    className="w-full rounded-md border bg-slate-50 px-3 py-2 text-slate-600"
                  />
                </div>
              </div>

              <div>
                <div className="mb-1 text-sm text-slate-500">Email</div>
                <input
                  value={user.email || ''}
                  disabled
                  className="w-full rounded-md border bg-slate-50 px-3 py-2 text-slate-600"
                />
              </div>
            </div>
          ) : (
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <Phone className="mt-0.5 h-5 w-5 text-slate-400" />
                  <div>
                    <div className="text-sm text-slate-500">Contact phone</div>
                    <div className="font-medium text-slate-900">{user.phone || '-'}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 h-5 w-5 text-slate-400" />
                  <div>
                    <div className="text-sm text-slate-500">Email</div>
                    <div className="font-medium text-slate-900">{user.email || '-'}</div>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div><div className="text-sm text-slate-500">Position</div><div className="font-medium text-slate-900">{user.position || '-'}</div></div>
                <div><div className="text-sm text-slate-500">Role</div><div className="font-medium text-slate-900">{user.is_super_admin ? 'SUPER_ADMIN' : user.role}</div></div>
                <div><div className="text-sm text-slate-500">Organization</div><div className="font-medium text-slate-900">{user.organizations?.name || '-'}</div></div>
                <div><div className="text-sm text-slate-500">Joined</div><div className="font-medium text-slate-900">{formatDateTime(user.created_at)}</div></div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-white p-6">
          <h2 className="text-center text-xl font-semibold">Summary</h2>
          <div className="mt-6 space-y-4">
            <div>
              <div className="mb-1 text-sm text-slate-500">Period</div>
              <select className="w-full rounded-md border px-3 py-2">
                <option>Weekly</option>
                <option>Monthly</option>
                <option>Yearly</option>
                <option>Custom range</option>
              </select>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-sm text-slate-500">From</div>
                <input type="date" className="w-full rounded-md border px-3 py-2" />
              </div>
              <div>
                <div className="mb-1 text-sm text-slate-500">To</div>
                <input type="date" className="w-full rounded-md border px-3 py-2" />
              </div>
            </div>

            <button
              type="button"
              onClick={() => toast.info('Manager summary will be the next step')}
              className="w-full rounded-md border px-4 py-2 hover:bg-slate-50"
            >
              Generate summary
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
