'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { supabase } from '@/lib/supabase/client';
import { UserProfile, UserRole } from '@/lib/types/database';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, Loader2, Check, Ban, CheckCircle, UserPlus, AlertCircle, Eye, EyeOff, UserCog } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { toast } from 'sonner';

type UserRow = UserProfile & {
  first_name?: string | null;
  last_name?: string | null;
  is_pending?: boolean;
  is_super_admin: boolean;
  is_creator: boolean;
  organizations: { name: string } | null;
};
type RoleSelect = UserRole | 'SUPER_ADMIN';
type UserStatusFilter = 'all' | 'active' | 'disabled' | 'pending';

type UsersFilters = {
  search: string;
  manager: string;
  email: string;
  organization: string;
  role: string;
  status: UserStatusFilter;
  joinedFrom: string;
  joinedTo: string;
};

type HeaderFilterId =
  | 'manager'
  | 'email'
  | 'organization'
  | 'role'
  | 'status'
  | 'joined';

const ROLE_OPTIONS: UserRole[] = ['OWNER', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'FINANCE'];
const NON_ADMIN_ROLES: UserRole[] = ['MANAGER', 'ACCOUNTANT', 'FINANCE'];
const ADMIN_ROLES: UserRole[] = ['OWNER', 'ADMIN'];
const DEFAULT_FILTERS: UsersFilters = {
  search: '',
  manager: '',
  email: '',
  organization: '',
  role: 'all',
  status: 'all',
  joinedFrom: '',
  joinedTo: '',
};

function passwordRules(pw: string) {
  return {
    min10: pw.length >= 10,
    lower: /[a-z]/.test(pw),
    upper: /[A-Z]/.test(pw),
    number: /\d/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
  };
}

function matchesText(value: string | null | undefined, query: string) {
  if (!query.trim()) {
    return true;
  }

  return (value || '').toLowerCase().includes(query.trim().toLowerCase());
}

function getUserDisplayName(user: UserRow) {
  return [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || '-';
}

function getUserDisplayRole(user: Pick<UserRow, 'is_super_admin' | 'role'>) {
  return user.is_super_admin ? 'SUPER_ADMIN' : String(user.role || '').toUpperCase();
}

function getUserStatus(user: UserRow) {
  if (user.is_pending) {
    return 'Pending confirmation';
  }

  if (user.disabled) {
    return 'Disabled';
  }

  return 'Active';
}

function formatJoinedDate(value: string) {
  return format(new Date(value), 'dd/MM/yyyy');
}

function HeaderFilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-left text-xs font-semibold ${
        active ? 'bg-slate-200 text-slate-900' : 'text-slate-700 hover:bg-slate-100'
      }`}
    >
      {label}
    </button>
  );
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const [filters, setFilters] = useState<UsersFilters>(DEFAULT_FILTERS);
  const [activeHeaderFilter, setActiveHeaderFilter] =
    useState<HeaderFilterId | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Record<string, RoleSelect>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

  // INVITE
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('MANAGER');
  const [inviteOrganizationId, setInviteOrganizationId] = useState('');
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [organizationModalOpen, setOrganizationModalOpen] = useState(false);
  const [organizationName, setOrganizationName] = useState('');
  const [creatingOrganization, setCreatingOrganization] = useState(false);
  const [deletingOrganizationId, setDeletingOrganizationId] = useState<string | null>(null);
  const [organizationError, setOrganizationError] = useState('');

  // CREATE (UI)
  const [createOpen, setCreateOpen] = useState(false);
  const [createOrganizationId, setCreateOrganizationId] = useState('');
  const [createFirstName, setCreateFirstName] = useState('');
  const [createLastName, setCreateLastName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createRole, setCreateRole] = useState<UserRole>('MANAGER');
  const [createPassword, setCreatePassword] = useState('');
  const [createConfirmPassword, setCreateConfirmPassword] = useState('');
  const [createShowPasswords, setCreateShowPasswords] = useState(false);
  const [creating, setCreating] = useState(false);

  const createPwRules = useMemo(() => passwordRules(createPassword), [createPassword]);
  const createPwOk =
    createPwRules.min10 && createPwRules.lower && createPwRules.upper && createPwRules.number && createPwRules.symbol;
  const createPwMatch = createConfirmPassword.length > 0 && createConfirmPassword === createPassword;

  const isSuperAdmin = !!(profile as any)?.is_super_admin;

  console.log("ADMIN USERS PAGE RENDER", {
    authLoading,
    profile,
    isSuperAdmin,
    loading,
    usersCount: users.length,
  });

  const canModifyUser = (targetUser: UserProfile, newRole?: RoleSelect): { allowed: boolean; reason?: string } => {
    if (!profile) return { allowed: false, reason: 'Not authenticated' };

    if (targetUser.id === profile.id) {
      return { allowed: false, reason: 'You cannot modify your own account' };
    }

    // SUPER_ADMIN can modify anyone (including assigning SUPER_ADMIN)
    if (isSuperAdmin) return { allowed: true };

    const isOwner = profile.role === 'OWNER';

    // non-super-admin cannot assign SUPER_ADMIN
    if (newRole === 'SUPER_ADMIN') {
      return { allowed: false, reason: 'Only SUPER_ADMIN can assign SUPER_ADMIN' };
    }

    const roleToCheck = (newRole || targetUser.role) as UserRole;

    if (!isOwner) {
      if (ADMIN_ROLES.includes(targetUser.role) || ADMIN_ROLES.includes(roleToCheck)) {
        return { allowed: false, reason: 'Only OWNER can modify ADMIN and OWNER roles' };
      }
    }

    return { allowed: true };
  };

  const canDisableUser = (targetUser: UserRow): { allowed: boolean; reason?: string } => {
    if (!profile) return { allowed: false, reason: 'Not authenticated' };
  
    if (targetUser.id === profile.id) {
      return { allowed: false, reason: 'You cannot disable your own account' };
    }
  
    if (targetUser.is_creator) {
      return { allowed: false, reason: 'Creator cannot be disabled' };
    }
  
    if (targetUser.is_super_admin) {
      return { allowed: false, reason: 'SUPER_ADMIN cannot be disabled' };
    }
  
    if (isSuperAdmin) {
      return { allowed: true };
    }
  
    if (targetUser.role === 'OWNER') {
      return { allowed: false, reason: 'Only SUPER_ADMIN can disable OWNER accounts' };
    }
  
    return { allowed: true };
  };

  const isLastOwner = (targetUser: UserProfile): boolean => {
    if (targetUser.role !== 'OWNER') return false;
    const activeOwners = users.filter((u) => u.role === 'OWNER' && !u.disabled);
    return activeOwners.length === 1;
  };

  const getAvailableRoles = (): UserRole[] => {
    if (!profile) return NON_ADMIN_ROLES;
    if (isSuperAdmin) return ROLE_OPTIONS;
    if (profile.role === 'OWNER') return ROLE_OPTIONS;
    return NON_ADMIN_ROLES;
  };

  const getRoleChangeWarning = (targetUser: UserProfile, newRole: RoleSelect): string | null => {
    if (newRole === 'SUPER_ADMIN') {
      return 'Granting SUPER_ADMIN gives full access to all organizations';
    }

    const role = newRole as UserRole;

    if (targetUser.role === 'OWNER' && role !== 'OWNER') {
      if (isLastOwner(targetUser)) return 'Cannot demote the last OWNER';
      return 'Demoting an OWNER will remove their full system access';
    }

    if (targetUser.role === 'ADMIN' && !ADMIN_ROLES.includes(role)) {
      return 'Demoting an ADMIN will reduce their permissions';
    }

    return null;
  };

  useEffect(() => {
    console.log("ADMIN USERS useEffect fired", {
      profile,
      isSuperAdmin,
    });
  
    if (!profile) return;
  
    if (profile.is_super_admin || profile.role === 'OWNER' || profile.role === 'ADMIN') {
      cleanupExpiredInvites();
      console.log("fetchUsers START");
      fetchUsers();
      fetchOrganizations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  useEffect(() => {
    if (!profile?.id) {
      return;
    }

    try {
      const saved = window.localStorage.getItem(
        `synchub.admin-users.filters.${profile.id}`
      );

      if (!saved) {
        setFiltersHydrated(true);
        return;
      }

      const parsed = JSON.parse(saved) as Partial<UsersFilters>;
      setFilters({
        ...DEFAULT_FILTERS,
        ...parsed,
        status:
          parsed.status === 'active' ||
          parsed.status === 'disabled' ||
          parsed.status === 'pending' ||
          parsed.status === 'all'
            ? parsed.status
            : DEFAULT_FILTERS.status,
      });
    } catch (error) {
      console.error('Failed to hydrate admin user filters:', error);
      setFilters(DEFAULT_FILTERS);
    } finally {
      setFiltersHydrated(true);
    }
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id || !filtersHydrated) {
      return;
    }

    window.localStorage.setItem(
      `synchub.admin-users.filters.${profile.id}`,
      JSON.stringify(filters)
    );
  }, [filters, filtersHydrated, profile?.id]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;

      if (!target?.closest('[data-admin-user-header-filter-root="true"]')) {
        setActiveHeaderFilter(null);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, []);

  const cleanupExpiredInvites = async () => {
    const CLEANUP_KEY = 'last_invite_cleanup';
    const lastCleanup = localStorage.getItem(CLEANUP_KEY);
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    if (lastCleanup && now - parseInt(lastCleanup) < oneDayMs) return;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      await fetch('/api/admin/cleanup-invites', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      localStorage.setItem(CLEANUP_KEY, now.toString());
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  };

  
  const fetchUsers = async () => {
    try {
      setLoading(true);
  
      const {
        data: { session },
      } = await supabase.auth.getSession();
  
      if (!session?.access_token) {
        toast.error("Not authenticated");
        return;
      }
  
      const res = await fetch("/api/admin/users", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
  
      const json = await res.json();
  
      if (!res.ok) {
        throw new Error(json?.message || json?.error || "Failed to load users");
      }
  
      setUsers((json.users ?? []) as UserRow[]);
      console.log("FETCH USERS count:", (json.users || []).length, json.users);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };
  
  const fetchOrganizations = async () => {
    console.log("fetchOrganizations START");
  
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
  
      if (!session?.access_token) {
        toast.error("Not authenticated");
        return;
      }
  
      const res = await fetch("/api/admin/organizations/list", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
  
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        console.error("Error fetching organizations:", data);
        return;
      }
      
      setOrganizations(data?.organizations ?? []);
    } catch (error) {
      console.error("Error fetching organizations:", error);
    }
  };

  const filteredUsers = useMemo(() => {
    const globalSearch = filters.search.trim().toLowerCase();
    const normalizedRoleFilter = String(filters.role || 'all').trim().toUpperCase();

    return users.filter((user) => {
      const managerName = getUserDisplayName(user);
      const organizationName = (user as any).organizations?.name || '';
      const displayRole = getUserDisplayRole(user);
      const status = getUserStatus(user);
      const joined = formatJoinedDate(user.created_at);
      const searchableText = [
        managerName,
        user.email,
        organizationName,
        displayRole,
        status,
        joined,
      ]
        .join(' ')
        .toLowerCase();

      const matchesGlobalSearch =
        !globalSearch || searchableText.includes(globalSearch);

      const matchesManager = matchesText(managerName, filters.manager);
      const matchesEmail = matchesText(user.email, filters.email);
      const matchesOrganization = matchesText(organizationName, filters.organization);
      const matchesRole =
        normalizedRoleFilter === 'ALL'
          ? true
          : displayRole === normalizedRoleFilter;
      const matchesStatus =
        filters.status === 'all'
          ? true
          : filters.status === 'active'
          ? status === 'Active'
          : filters.status === 'disabled'
          ? status === 'Disabled'
          : status === 'Pending confirmation';

      const createdDate = new Date(user.created_at);
      const matchesJoinedFrom =
        !filters.joinedFrom ||
        createdDate >= new Date(`${filters.joinedFrom}T00:00:00`);
      const matchesJoinedTo =
        !filters.joinedTo ||
        createdDate <= new Date(`${filters.joinedTo}T23:59:59`);

      return (
        matchesGlobalSearch &&
        matchesManager &&
        matchesEmail &&
        matchesOrganization &&
        matchesRole &&
        matchesStatus &&
        matchesJoinedFrom &&
        matchesJoinedTo
      );
    });
  }, [filters, users]);

  const updateFilter = <K extends keyof UsersFilters>(
    key: K,
    value: UsersFilters[K]
  ) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setActiveHeaderFilter(null);
  };

  const handleRoleChange = (user: UserProfile, newRole: RoleSelect) => {
    const canModify = canModifyUser(user, newRole);
    if (!canModify.allowed) {
      toast.error(canModify.reason || 'Cannot modify this user');
      return;
    }

    const warning = getRoleChangeWarning(user, newRole);
    if (warning && warning.includes('Cannot demote')) {
      toast.error(warning);
      return;
    }

    setPendingChanges((prev) => ({ ...prev, [user.id]: newRole }));
  };

  const handleSaveRole = async (userId: string) => {
    const selection = pendingChanges[userId];
    if (!selection) return;
  
    const user = users.find((u) => u.id === userId);
    if (!user) return;
  
    const canModify = canModifyUser(user, selection);
    if (!canModify.allowed) {
      toast.error(canModify.reason || 'Cannot modify this user');
      return;
    }
  
    if (user.is_creator) {
      toast.error('Creator account cannot be modified');
      return;
    }
  
    if (selection !== 'SUPER_ADMIN' && isLastOwner(user) && selection !== 'OWNER') {
      toast.error('Cannot demote the last OWNER. At least one OWNER must remain.');
      return;
    }
  
    const oldRole: RoleSelect = user.is_super_admin ? 'SUPER_ADMIN' : user.role;
  
    try {
      setSavingUserId(userId);
  
      const updatePayload: { role?: UserRole; is_super_admin?: boolean } = {};
  
      if (selection === 'SUPER_ADMIN') {
        updatePayload.is_super_admin = true;
      } else {
        updatePayload.role = selection as UserRole;
        updatePayload.is_super_admin = false;
      }
  
      const { error } = await supabase
        .from('user_profiles')
        .update(updatePayload)
        .eq('id', userId);
  
      if (error) {
        toast.error(`UPDATE ROLE failed: ${error.message}`);
        return;
      }
  
      const {
        data: { session },
      } = await supabase.auth.getSession();
      
      const { data: actorProfile } = await supabase
        .from('user_profiles')
        .select('first_name,last_name,email')
        .eq('id', session?.user?.id)
        .single();
      
      if (session?.user?.id) {
        const payload = {
          action: 'role_change',
          actor_id: session.user.id,
          target_id: userId,
          organization_id: user.organization_id ?? null,
          details: {
            message: `Role changed: ${oldRole} → ${selection}`,
            actor_name: `${actorProfile?.first_name ?? ''} ${actorProfile?.last_name ?? ''}`.trim() || null,
            actor_email: actorProfile?.email || session.user.email || null,
            target_name: `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || null,
            target_email: user.email,
            organization_name: user.organizations?.name || null,
          },
        };
  
        const { error: auditError } = await supabase
          .from('audit_logs')
          .insert(payload);
  
        if (auditError) {
          console.error('Audit log insert failed:', auditError);
        }
      }
  
      setUsers((prev) =>
        prev.map((u) => {
          if (u.id !== userId) return u;
  
          if (selection === 'SUPER_ADMIN') {
            return { ...u, is_super_admin: true };
          }
  
          return {
            ...u,
            role: selection as UserRole,
            is_super_admin: false,
          };
        })
      );
  
      setPendingChanges((prev) => {
        const updated = { ...prev };
        delete updated[userId];
        return updated;
      });
  
      toast.success('Role updated successfully');
  
      await fetchUsers();
    } catch (err: any) {
      console.error('Error updating role:', err);
      toast.error(err?.message || 'Failed to update role');
    } finally {
      setSavingUserId(null);
    }
  };

  const handleToggleDisabled = async (userId: string, currentDisabled: boolean) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;
  
    if (!currentDisabled) {
      const canDisable = canDisableUser(user);
      if (!canDisable.allowed) {
        toast.error(canDisable.reason || 'Cannot disable this user');
        return;
      }
    }
  
    try {
      setTogglingUserId(userId);
  
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
  
      if (!accessToken) {
        toast.error('Not authenticated');
        return;
      }
  
      const res = await fetch('/api/admin/users/toggle-disabled', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          userId,
          disabled: !currentDisabled,
        }),
      });
  
      const json = await res.json().catch(() => null);
  
      if (!res.ok) {
        console.error('TOGGLE DISABLED failed:', { status: res.status, json });
        toast.error(json?.error || `Failed (${res.status})`);
        return;
      }
  
      const updatedProfile = json?.profile;
  
      if (updatedProfile) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, ...(updatedProfile as any) } : u))
        );
      } else {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, disabled: !currentDisabled } : u))
        );
      }
  
      toast.success(!currentDisabled ? 'User disabled' : 'User enabled');
  
      const { data: sessionData2 } = await supabase.auth.getSession();
      const actorId = sessionData2?.session?.user?.id;
  
      const { data: actorProfile } = await supabase
        .from('user_profiles')
        .select('first_name,last_name,email')
        .eq('id', actorId)
        .single();
  
      if (actorId) {
        const actionName = !currentDisabled ? 'user_disable' : 'user_enable';
  
        const { error: auditError } = await supabase.from('audit_logs').insert({
          action: actionName,
          actor_id: actorId,
          target_id: userId,
          organization_id: user.organization_id ?? null,
          details: {
            message: !currentDisabled ? 'Account disabled' : 'Account enabled',
            actor_name: `${actorProfile?.first_name ?? ''} ${actorProfile?.last_name ?? ''}`.trim() || null,
            actor_email: actorProfile?.email || sessionData2?.session?.user?.email || null,
            target_name: `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || null,
            target_email: user.email,
            organization_name: user.organizations?.name || null,
          },
        });
  
        if (auditError) {
          console.error('Audit log insert failed:', auditError);
        }
      }
    } catch (err: any) {
      console.error('Error toggling user:', err);
      toast.error(err?.message || 'Failed to update user');
    } finally {
      setTogglingUserId(null);
    }
  };
  
  const handleDeleteUser = async (user: UserRow) => {
    const confirmed = window.confirm(
      `Delete user ${user.email}? This action cannot be undone.`
    );
  
    if (!confirmed) return;
  
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
  
      if (!accessToken) {
        toast.error('Not authenticated');
        return;
      }
  
      const res = await fetch('/api/admin/users/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          userId: user.id,
        }),
      });
  
      const json = await res.json().catch(() => null);
  
      if (!res.ok) {
        toast.error(json?.error || `Delete failed (${res.status})`);
        return;
      }
  
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      toast.success('User deleted');
    } catch (err: any) {
      console.error('Delete user error:', err);
      toast.error(err?.message || 'Failed to delete user');
    }
  };
  
  const handleCreateOrganization = async () => {
    const name = organizationName.trim();
    setOrganizationError('');
    
  
    if (!name) {
      toast.error('Organization name is required');
      return;
    }
  
    try {
      setCreatingOrganization(true);
  
      const {
        data: { session },
      } = await supabase.auth.getSession();
  
      if (!session?.access_token) {
        toast.error('Not authenticated');
        return;
      }
  
      const res = await fetch('/api/admin/organizations/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ name }),
      });
  
      const json = await res.json().catch(() => null);
  
      if (!res.ok) {
        toast.error(json?.error || `Create failed (${res.status})`);
        return;
      }
  
      toast.success('Organization created');
      setOrganizationModalOpen(false);
      setOrganizationName('');
      await fetchOrganizations();
    } catch (err: any) {
      console.error('Create organization error:', err);
      toast.error(err?.message || 'Failed to create organization');
    } finally {
      setCreatingOrganization(false);
    }
  };
  
  const handleDeleteOrganization = async (organizationId: string, organizationName: string) => {
    const confirmed = window.confirm(
      `Delete organization "${organizationName}"? This action cannot be undone.`
    );
  
    if (!confirmed) return;
    setOrganizationError('');
  
    try {
      setDeletingOrganizationId(organizationId);
  
      const {
        data: { session },
      } = await supabase.auth.getSession();
  
      if (!session?.access_token) {
        toast.error('Not authenticated');
        return;
      }
  
      const res = await fetch('/api/admin/organizations/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ organizationId }),
      });
  
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        console.error('DELETE ORGANIZATION ERROR:', { status: res.status, data });
        setOrganizationError(data?.error || data?.message || `Delete failed (${res.status})`);
        return;
      }
  
      toast.success('Organization deleted', {
        duration: 3000,
      });
  
      await fetchOrganizations();
    } catch (err: any) {
      console.error('Delete organization error:', err);
      toast.error(err?.message || 'Failed to delete organization', {
        duration: 4000,
      });
    } finally {
      setDeletingOrganizationId(null);
    }
  };
  
  const handleSendInvite = async () => {
    if (!inviteEmail || !inviteRole || !inviteOrganizationId) {
      toast.error('Email, role and organization are required');
      return;
    }
  
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }
  
    try {
      setSendingInvite(true);
  
      const {
        data: { session },
      } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error('Not authenticated');
        return;
      }
  
      const response = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          organizationId: inviteOrganizationId,
        }),
      });
  
      const data = await response.json();
  
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send invite');
      }
  
      toast.success('Invite sent successfully');
      setInviteModalOpen(false);
      setInviteEmail('');
      setInviteRole('MANAGER');
      setInviteOrganizationId('');
      fetchUsers();
    } catch (error: any) {
      console.error('Error sending invite:', error);
      toast.error(error.message || 'Failed to send invite');
    } finally {
      setSendingInvite(false);
    }
  };
  
  const resetCreateForm = () => {
    setCreateOrganizationId('');
    setCreateFirstName('');
    setCreateLastName('');
    setCreateEmail('');
    setCreateRole('MANAGER');
    setCreatePassword('');
    setCreateConfirmPassword('');
    setCreateShowPasswords(false);
  };
  
  const handleCreateUserClick = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
    const organizationId = createOrganizationId.trim();
    const firstName = createFirstName.trim();
    const lastName = createLastName.trim();
    const email = createEmail.trim().toLowerCase();
  
    if (!organizationId) {
      toast.error('Organization is required');
      return;
    }
  
    if (!firstName) {
      toast.error('Name is required');
      return;
    }
  
    if (!lastName) {
      toast.error('Surname is required');
      return;
    }
  
    if (!emailRegex.test(email)) {
      toast.error('Valid email is required');
      return;
    }
  
    if (!createPwOk) {
      toast.error('Password does not meet requirements');
      return;
    }
  
    if (createPassword !== createConfirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
  
    try {
      setCreating(true);
  
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
  
      if (!accessToken) {
        toast.error('No access token, please login again');
        return;
      }
  
      const res = await fetch('/api/admin/users/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          organizationId,
          firstName,
          lastName,
          email,
          role: createRole,
          password: createPassword,
        }),
      });
  
      const data = await res.json().catch(() => null);
  
      if (!res.ok) {
        console.error('CREATE USER ERROR:', { status: res.status, data });
        toast.error(data?.error || data?.message || `Create failed (${res.status})`);
        return;
      }
  
      toast.success('User created');
  
      setCreateOpen(false);
      resetCreateForm();
      await fetchUsers();
    } catch (err) {
      console.error('CREATE USER EXCEPTION:', err);
      toast.error('Network error (see Console)');
    } finally {
      setCreating(false);
    }
  };

  if (authLoading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-6">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div />

        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-900">Manage Users</h1>
        </div>

        <div className="justify-self-end hidden">
              {/* CREATE USER */}
              <Dialog
                open={createOpen}
                onOpenChange={(v) => {
                  setCreateOpen(v);
                  if (!v) resetCreateForm();
                }}
              >
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <UserCog className="h-4 w-4 mr-2" />
                    Add User
                  </Button>
                </DialogTrigger>
  
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Add New User</DialogTitle>
                    <DialogDescription>Create user for testing (admin sets password).</DialogDescription>
                  </DialogHeader>
  
                  <div className="border rounded-md overflow-hidden">
                    <div className="grid grid-cols-3">
                      <div className="border-b border-r px-4 py-3 text-sm font-medium text-center">Name</div>
                      <div className="border-b px-4 py-3 col-span-2">
                        <Input
                          placeholder="e.g. Artur"
                          value={createFirstName}
                          onChange={(e) => setCreateFirstName(e.target.value)}
                        />
                      </div>
                    </div>
  
                    <div className="grid grid-cols-3">
                      <div className="border-b border-r px-4 py-3 text-sm font-medium text-center">Surname</div>
                      <div className="border-b px-4 py-3 col-span-2">
                        <Input
                          placeholder="e.g. Dobrodej"
                          value={createLastName}
                          onChange={(e) => setCreateLastName(e.target.value)}
                        />
                      </div>
                    </div>
  
                    <div className="grid grid-cols-3">
                      <div className="border-b border-r px-4 py-3 text-sm font-medium text-center">
                        Organization
                      </div>
  
                      <div className="border-b px-4 py-3 col-span-2">
                        <Select
                          value={createOrganizationId}
                          onValueChange={(value) => setCreateOrganizationId(value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select organization" />
                          </SelectTrigger>
  
                          <SelectContent>
                            {organizations.map((org) => (
                              <SelectItem key={org.id} value={org.id}>
                                {org.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
  
                    <div className="grid grid-cols-3">
                      <div className="border-b border-r px-4 py-3 text-sm font-medium text-center">Email</div>
                      <div className="border-b px-4 py-3 col-span-2">
                        <Input
                          type="email"
                          placeholder="user@example.com"
                          value={createEmail}
                          onChange={(e) => setCreateEmail(e.target.value)}
                        />
                      </div>
                    </div>
  
                    <div className="grid grid-cols-3">
                      <div className="border-b border-r px-4 py-3 text-sm font-medium text-center">Role</div>
                      <div className="border-b px-4 py-3 col-span-2">
                        <Select value={createRole} onValueChange={(v) => setCreateRole(v as UserRole)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            {(profile.role === 'OWNER' || isSuperAdmin ? ROLE_OPTIONS : NON_ADMIN_ROLES).map((r) => (
                              <SelectItem key={r} value={r}>
                                {r}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
  
                    <div className="grid grid-cols-3">
                      <div className="border-r px-4 py-3 text-sm font-medium text-center">Password</div>
                      <div className="px-4 py-3 col-span-2">
                        <div className="flex items-center gap-2">
                          <Input
                            type={createShowPasswords ? 'text' : 'password'}
                            placeholder="Min 10, upper/lower/number/symbol"
                            value={createPassword}
                            onChange={(e) => setCreatePassword(e.target.value)}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setCreateShowPasswords((v) => !v)}
                            aria-label={createShowPasswords ? 'Hide password' : 'Show password'}
                          >
                            {createShowPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
  
                        <div className="mt-2 grid grid-cols-2 gap-x-4 text-xs">
                          <div className={createPwRules.min10 ? 'font-medium' : 'text-muted-foreground'}>• Min 10 symbols</div>
                          <div className={createPwRules.lower ? 'font-medium' : 'text-muted-foreground'}>• Lowercase</div>
                          <div className={createPwRules.upper ? 'font-medium' : 'text-muted-foreground'}>• Uppercase</div>
                          <div className={createPwRules.number ? 'font-medium' : 'text-muted-foreground'}>• Number</div>
                          <div className={createPwRules.symbol ? 'font-medium' : 'text-muted-foreground'}>• Symbol</div>
                        </div>
  
                        <div className="mt-3">
                          <div className="text-sm font-medium mb-1">Confirm password</div>
                          <Input
                            type={createShowPasswords ? 'text' : 'password'}
                            placeholder="Repeat password"
                            value={createConfirmPassword}
                            onChange={(e) => setCreateConfirmPassword(e.target.value)}
                          />
                          <div className="mt-1 text-xs">
                            {createConfirmPassword.length === 0 ? (
                              <span className="text-muted-foreground">Re-enter the same password</span>
                            ) : createPwMatch ? (
                              <span className="font-medium">Passwords match</span>
                            ) : (
                              <span className="text-destructive">Passwords do not match</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
  
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setCreateOpen(false);
                        resetCreateForm();
                      }}
                      disabled={creating}
                    >
                      Cancel
                    </Button>
  
                    <Button
                      onClick={handleCreateUserClick}
                      disabled={
                        creating ||
                        !createOrganizationId ||
                        !createFirstName.trim() ||
                        !createLastName.trim() ||
                        !createEmail.trim() ||
                        !createPwOk ||
                        createPassword !== createConfirmPassword
                      }
                    >
                      {creating ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        'Create'
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
  
              {/* INVITE USER */}
              <Dialog open={inviteModalOpen} onOpenChange={setInviteModalOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Invite User
                  </Button>
                </DialogTrigger>
  
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invite New User</DialogTitle>
                    <DialogDescription>
                      Send an invitation email to add a new user to your organization.
                    </DialogDescription>
                  </DialogHeader>
  
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="invite-email">Email</Label>
                      <Input
                        id="invite-email"
                        type="email"
                        placeholder="user@example.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        disabled={sendingInvite}
                      />
                    </div>
  
                    <div className="space-y-2">
                      <Label htmlFor="invite-role">Role</Label>
                      <Select
                        value={inviteRole}
                        onValueChange={(value) => setInviteRole(value as UserRole)}
                        disabled={sendingInvite}
                      >
                        <SelectTrigger id="invite-role">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          {(profile.role === 'OWNER' || isSuperAdmin ? ROLE_OPTIONS : NON_ADMIN_ROLES).map((role) => (
                            <SelectItem key={role} value={role}>
                              {role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
  
                    <div className="space-y-2">
                      <Label htmlFor="invite-organization">Organization</Label>
                      <Select
                        value={inviteOrganizationId}
                        onValueChange={setInviteOrganizationId}
                        disabled={sendingInvite}
                      >
                        <SelectTrigger id="invite-organization">
                          <SelectValue placeholder="Select organization" />
                        </SelectTrigger>
                        <SelectContent>
                          {organizations.map((org) => (
                            <SelectItem key={org.id} value={org.id}>
                              {org.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
  
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setInviteModalOpen(false)}
                      disabled={sendingInvite}
                    >
                      Cancel
                    </Button>
  
                    <Button onClick={handleSendInvite} disabled={sendingInvite}>
                      {sendingInvite ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        'Send Invite'
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Input
              placeholder="Search..."
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              className="w-full max-w-xs"
            />

            <Button variant="outline" onClick={resetFilters}>
              Reset filters
            </Button>

            <Button variant="outline" onClick={() => setCreateOpen(true)}>
              <UserCog className="h-4 w-4 mr-2" />
              Add User
            </Button>

            <Button onClick={() => setInviteModalOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Invite User
            </Button>
          </div>

          {loading && !filtersHydrated ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">No users yet</h3>
              <p className="text-slate-600">User data will appear here</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead data-admin-user-header-filter-root="true">
                      <div className="relative">
                        <HeaderFilterButton
                          label="Manager"
                          active={activeHeaderFilter === 'manager'}
                          onClick={() =>
                            setActiveHeaderFilter((prev) =>
                              prev === 'manager' ? null : 'manager'
                            )
                          }
                        />
                        {activeHeaderFilter === 'manager' ? (
                          <div className="absolute left-0 top-full z-20 mt-2 w-48 rounded-xl border bg-white p-2 shadow-lg">
                            <Input
                              value={filters.manager}
                              onChange={(e) => updateFilter('manager', e.target.value)}
                              placeholder="Manager"
                            />
                          </div>
                        ) : null}
                      </div>
                    </TableHead>
                    <TableHead data-admin-user-header-filter-root="true">
                      <div className="relative">
                        <HeaderFilterButton
                          label="Email"
                          active={activeHeaderFilter === 'email'}
                          onClick={() =>
                            setActiveHeaderFilter((prev) => (prev === 'email' ? null : 'email'))
                          }
                        />
                        {activeHeaderFilter === 'email' ? (
                          <div className="absolute left-0 top-full z-20 mt-2 w-56 rounded-xl border bg-white p-2 shadow-lg">
                            <Input
                              value={filters.email}
                              onChange={(e) => updateFilter('email', e.target.value)}
                              placeholder="Email"
                            />
                          </div>
                        ) : null}
                      </div>
                    </TableHead>
                    <TableHead data-admin-user-header-filter-root="true">
                      <div className="relative">
                        <HeaderFilterButton
                          label="Organization"
                          active={activeHeaderFilter === 'organization'}
                          onClick={() =>
                            setActiveHeaderFilter((prev) =>
                              prev === 'organization' ? null : 'organization'
                            )
                          }
                        />
                        {activeHeaderFilter === 'organization' ? (
                          <div className="absolute left-0 top-full z-20 mt-2 w-52 rounded-xl border bg-white p-2 shadow-lg">
                            <Input
                              value={filters.organization}
                              onChange={(e) => updateFilter('organization', e.target.value)}
                              placeholder="Organization"
                            />
                          </div>
                        ) : null}
                      </div>
                    </TableHead>
                    <TableHead data-admin-user-header-filter-root="true">
                      <div className="relative">
                        <HeaderFilterButton
                          label="Role"
                          active={activeHeaderFilter === 'role'}
                          onClick={() =>
                            setActiveHeaderFilter((prev) => (prev === 'role' ? null : 'role'))
                          }
                        />
                        {activeHeaderFilter === 'role' ? (
                          <div className="absolute left-0 top-full z-20 mt-2 w-44 rounded-xl border bg-white p-2 shadow-lg">
                            <select
                              value={filters.role}
                              onChange={(e) => updateFilter('role', e.target.value)}
                              className="w-full rounded-md border px-2 py-2 text-sm"
                            >
                              <option value="all">All roles</option>
                              <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                              {ROLE_OPTIONS.map((role) => (
                                <option key={role} value={role}>
                                  {role}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : null}
                      </div>
                    </TableHead>
                    <TableHead data-admin-user-header-filter-root="true">
                      <div className="relative">
                        <HeaderFilterButton
                          label="Status"
                          active={activeHeaderFilter === 'status'}
                          onClick={() =>
                            setActiveHeaderFilter((prev) => (prev === 'status' ? null : 'status'))
                          }
                        />
                        {activeHeaderFilter === 'status' ? (
                          <div className="absolute left-0 top-full z-20 mt-2 w-48 rounded-xl border bg-white p-2 shadow-lg">
                            <Select
                              value={filters.status}
                              onValueChange={(value) =>
                                updateFilter('status', value as UsersFilters['status'])
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="All statuses" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All statuses</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="disabled">Disabled</SelectItem>
                                <SelectItem value="pending">Pending confirmation</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        ) : null}
                      </div>
                    </TableHead>
                    <TableHead data-admin-user-header-filter-root="true">
                      <div className="relative">
                        <HeaderFilterButton
                          label="Joined"
                          active={activeHeaderFilter === 'joined'}
                          onClick={() =>
                            setActiveHeaderFilter((prev) => (prev === 'joined' ? null : 'joined'))
                          }
                        />
                        {activeHeaderFilter === 'joined' ? (
                          <div className="absolute right-0 top-full z-20 mt-2 w-52 space-y-2 rounded-xl border bg-white p-2 shadow-lg">
                            <Input
                              type="date"
                              value={filters.joinedFrom}
                              onChange={(e) => updateFilter('joinedFrom', e.target.value)}
                            />
                            <Input
                              type="date"
                              value={filters.joinedTo}
                              onChange={(e) => updateFilter('joinedTo', e.target.value)}
                            />
                          </div>
                        ) : null}
                      </div>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-slate-500">
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                  filteredUsers.map((user) => {
                    const hasPendingChange = pendingChanges[user.id] !== undefined;
                    const isSaving = savingUserId === user.id;
                    const isToggling = togglingUserId === user.id;

                    const displayRole: RoleSelect =
                      (pendingChanges[user.id] as RoleSelect) || (user.is_super_admin ? 'SUPER_ADMIN' : user.role);

                    const isCurrentUser = user.id === profile?.id;

                    const canModify = canModifyUser(user, displayRole);
                    const canDisable = canDisableUser(user);
                    const availableRoles = getAvailableRoles();
                    const lastOwner = isLastOwner(user);

                    return (
                      <TableRow key={user.id} className={user.disabled ? 'opacity-60' : ''}>
                        {/* MANAGER */}
                        <TableCell className="font-medium">
  <div className="flex items-start justify-between gap-2">
    <div>
      <div
        className="font-medium text-slate-900 cursor-pointer hover:text-slate-600"
        onClick={() => router.push(`/app/admin/users/${user.id}`)}
      >
        {[user.first_name, user.last_name].filter(Boolean).join(' ') || '—'}
      </div>
      <div className="hidden text-sm text-slate-500">
        {user.email}
      </div>
    </div>

    <div className="flex items-center gap-2">
      {isCurrentUser && <Badge variant="outline" className="text-xs">You</Badge>}

      {lastOwner && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <AlertCircle className="h-4 w-4 text-amber-500" />
            </TooltipTrigger>
            <TooltipContent>
              <p>Last OWNER - cannot be demoted or disabled</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  </div>
</TableCell>

                        {/* EMAIL */}
                        <TableCell>{user.email}</TableCell>

                        {/* ORGANIZATION */}
                        <TableCell>{(user as any).organizations?.name || '—'}</TableCell>

                        {/* ROLE */}
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <Select
                                  value={displayRole}
                                  onValueChange={(value) => handleRoleChange(user, value as RoleSelect)}
                                  disabled={isSaving || user.disabled || !canModify.allowed || isCurrentUser || user.is_creator}
                                >
                                    <SelectTrigger className="w-[140px]">
                                      <SelectValue />
                                    </SelectTrigger>

                                    <SelectContent>
                                      {isSuperAdmin && <SelectItem value="SUPER_ADMIN">SUPER_ADMIN</SelectItem>}

                                      {availableRoles.map((role) => {
  const isLastProtectedOwner =
    lastOwner &&
    !user.is_super_admin &&
    role !== 'OWNER';

  return (
    <SelectItem key={role} value={role} disabled={isLastProtectedOwner}>
      {role}
      {isLastProtectedOwner && ' (Last OWNER)'}
    </SelectItem>
  );
})}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </TooltipTrigger>

                              {!canModify.allowed && (
                                <TooltipContent>
                                  <p>{canModify.reason}</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>

                        {/* STATUS */}
                        <TableCell>
  <Badge
    variant={
      user.is_pending
        ? 'secondary'
        : user.disabled
        ? 'destructive'
        : 'default'
    }
  >
    {user.is_pending ? 'Pending confirmation' : user.disabled ? 'Disabled' : 'Active'}
  </Badge>
</TableCell>

                        {/* JOINED */}
                        <TableCell>
  {formatJoinedDate(user.created_at)}
</TableCell>

                        {/* ACTIONS */}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {hasPendingChange && (
                              <Button size="sm" onClick={() => handleSaveRole(user.id)} disabled={isSaving || isToggling}>
                                {isSaving ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Saving...
                                  </>
                                ) : (
                                  <>
                                    <Check className="h-4 w-4 mr-2" />
                                    Save
                                  </>
                                )}
                              </Button>
                            )}

{!user.is_pending && (
  <TooltipProvider>
    <Tooltip>
      <AlertDialog>
        <TooltipTrigger asChild>
          <div>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant={user.disabled ? 'default' : 'destructive'}
                disabled={
                  isToggling ||
                  isSaving ||
                  (!user.disabled && !canDisable.allowed) ||
                  isCurrentUser ||
                  user.is_super_admin
                }
              >
                {isToggling ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : user.disabled ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Enable
                  </>
                ) : (
                  <>
                    <Ban className="h-4 w-4 mr-2" />
                    Disable
                  </>
                )}
              </Button>
            </AlertDialogTrigger>
          </div>
        </TooltipTrigger>

        {!user.disabled && !canDisable.allowed && (
          <TooltipContent>
            <p>{canDisable.reason}</p>
          </TooltipContent>
        )}

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{user.disabled ? 'Enable User' : 'Disable User'}</AlertDialogTitle>
            <AlertDialogDescription>
              {user.disabled
                ? `Are you sure you want to enable ${user.email}? They will regain access to the application.`
                : `Are you sure you want to disable ${user.email}? They will be immediately logged out and unable to access the application.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleToggleDisabled(user.id, user.disabled)}>
              {user.disabled ? 'Enable User' : 'Disable User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tooltip>
  </TooltipProvider>
)}

<Button
  size="sm"
  variant="destructive"
  onClick={() => handleDeleteUser(user)}
  disabled={isToggling || isSaving || isCurrentUser || user.is_super_admin || user.is_creator}
>
  Delete
</Button>
</div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
