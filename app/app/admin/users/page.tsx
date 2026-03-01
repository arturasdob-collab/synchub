'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { supabase } from '@/lib/supabase/client';
import { UserProfile, UserRole } from '@/lib/types/database';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, Loader2, Check, Ban, CheckCircle, UserPlus, AlertCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { toast } from 'sonner';

const ROLE_OPTIONS: UserRole[] = ['OWNER', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'FINANCE'];

const NON_ADMIN_ROLES: UserRole[] = ['MANAGER', 'ACCOUNTANT', 'FINANCE'];
const ADMIN_ROLES: UserRole[] = ['OWNER', 'ADMIN'];

export default function AdminUsersPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingChanges, setPendingChanges] = useState<Record<string, UserRole>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('MANAGER');
  const [sendingInvite, setSendingInvite] = useState(false);

  const canModifyUser = (targetUser: UserProfile, newRole?: UserRole): { allowed: boolean; reason?: string } => {
    if (!profile) return { allowed: false, reason: 'Not authenticated' };

    if (targetUser.id === profile.id) {
      return { allowed: false, reason: 'You cannot modify your own account' };
    }

    const isOwner = profile.role === 'OWNER';
    const roleToCheck = newRole || targetUser.role;

    if (!isOwner) {
      if (ADMIN_ROLES.includes(targetUser.role) || ADMIN_ROLES.includes(roleToCheck)) {
        return { allowed: false, reason: 'Only OWNER can modify ADMIN and OWNER roles' };
      }
    }

    return { allowed: true };
  };

  const canDisableUser = (targetUser: UserProfile): { allowed: boolean; reason?: string } => {
    if (!profile) return { allowed: false, reason: 'Not authenticated' };

    if (targetUser.id === profile.id) {
      return { allowed: false, reason: 'You cannot disable your own account' };
    }

    if (targetUser.role === 'OWNER') {
      return { allowed: false, reason: 'Cannot disable OWNER accounts' };
    }

    return { allowed: true };
  };

  const isLastOwner = (targetUser: UserProfile): boolean => {
    if (targetUser.role !== 'OWNER') return false;
    const activeOwners = users.filter(u => u.role === 'OWNER' && !u.disabled);
    return activeOwners.length === 1;
  };

  const getAvailableRoles = (targetUser: UserProfile): UserRole[] => {
    if (!profile) return NON_ADMIN_ROLES;

    if (profile.role === 'OWNER') {
      if (isLastOwner(targetUser)) {
        return ROLE_OPTIONS;
      }
      return ROLE_OPTIONS;
    }

    return NON_ADMIN_ROLES;
  };

  const getRoleChangeWarning = (targetUser: UserProfile, newRole: UserRole): string | null => {
    if (targetUser.role === 'OWNER' && newRole !== 'OWNER') {
      if (isLastOwner(targetUser)) {
        return 'Cannot demote the last OWNER';
      }
      return 'Demoting an OWNER will remove their full system access';
    }

    if (targetUser.role === 'ADMIN' && !ADMIN_ROLES.includes(newRole)) {
      return 'Demoting an ADMIN will reduce their permissions';
    }

    return null;
  };

  useEffect(() => {
    if (profile && (profile.role === 'OWNER' || profile.role === 'ADMIN')) {
      cleanupExpiredInvites();
      fetchUsers();
    }
  }, [profile]);

  const cleanupExpiredInvites = async () => {
    const CLEANUP_KEY = 'last_invite_cleanup';
    const lastCleanup = localStorage.getItem(CLEANUP_KEY);
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    if (lastCleanup && now - parseInt(lastCleanup) < oneDayMs) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await fetch('/api/admin/cleanup-invites', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      localStorage.setItem(CLEANUP_KEY, now.toString());
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = (user: UserProfile, newRole: UserRole) => {
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

    setPendingChanges(prev => ({
      ...prev,
      [user.id]: newRole
    }));
  };

  const handleSaveRole = async (userId: string) => {
    const newRole = pendingChanges[userId];
    if (!newRole) return;

    const user = users.find(u => u.id === userId);
    if (!user) return;

    const canModify = canModifyUser(user, newRole);
    if (!canModify.allowed) {
      toast.error(canModify.reason || 'Cannot modify this user');
      return;
    }

    if (isLastOwner(user) && newRole !== 'OWNER') {
      toast.error('Cannot demote the last OWNER. At least one OWNER must remain.');
      return;
    }

    try {
      setSavingUserId(userId);
      const { error } = await supabase
        .from('user_profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) {
        throw error;
      }

      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, role: newRole } : u
      ));

      setPendingChanges(prev => {
        const updated = { ...prev };
        delete updated[userId];
        return updated;
      });

      toast.success('Role updated successfully');
    } catch (error: any) {
      console.error('Error updating role:', error);
      toast.error(error.message || 'Failed to update role');
    } finally {
      setSavingUserId(null);
    }
  };

  const handleToggleDisabled = async (userId: string, currentDisabled: boolean) => {
    const user = users.find(u => u.id === userId);
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
      const { error } = await supabase
        .from('user_profiles')
        .update({ disabled: !currentDisabled })
        .eq('id', userId);

      if (error) {
        throw error;
      }

      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, disabled: !currentDisabled } : u
      ));

      toast.success(`User ${!currentDisabled ? 'disabled' : 'enabled'} successfully`);
    } catch (error: any) {
      console.error('Error toggling user status:', error);
      toast.error(error.message || 'Failed to update user status');
    } finally {
      setTogglingUserId(null);
    }
  };

  const handleSendInvite = async () => {
    if (!inviteEmail || !inviteRole) {
      toast.error('Email and role are required');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }

    try {
      setSendingInvite(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Not authenticated');
        return;
      }

      const response = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send invite');
      }

      toast.success('Invite sent successfully');
      setInviteModalOpen(false);
      setInviteEmail('');
      setInviteRole('MANAGER');
      fetchUsers();
    } catch (error: any) {
      console.error('Error sending invite:', error);
      toast.error(error.message || 'Failed to send invite');
    } finally {
      setSendingInvite(false);
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
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">User Management</h1>
        <p className="text-slate-600 mt-2">
          Manage user accounts and permissions
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Users</CardTitle>
              <CardDescription>
                View and manage user roles across the organization
              </CardDescription>
            </div>
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
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(profile?.role === 'OWNER' ? ROLE_OPTIONS : NON_ADMIN_ROLES).map((role) => (
                          <SelectItem key={role} value={role}>
                            {role}
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
        </CardHeader>
        <CardContent>
          {loading ? (
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => {
                    const hasPendingChange = pendingChanges[user.id] !== undefined;
                    const isSaving = savingUserId === user.id;
                    const isToggling = togglingUserId === user.id;
                    const displayRole = pendingChanges[user.id] || user.role;
                    const isCurrentUser = user.id === profile?.id;
                    const canModify = canModifyUser(user);
                    const canDisable = canDisableUser(user);
                    const availableRoles = getAvailableRoles(user);
                    const isOwnerUser = user.role === 'OWNER';
                    const lastOwner = isLastOwner(user);

                    return (
                      <TableRow key={user.id} className={user.disabled ? 'opacity-60' : ''}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {user.email}
                            {isCurrentUser && (
                              <Badge variant="outline" className="text-xs">You</Badge>
                            )}
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
                        </TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <Select
                                    value={displayRole}
                                    onValueChange={(value) => handleRoleChange(user, value as UserRole)}
                                    disabled={isSaving || user.disabled || !canModify.allowed || isCurrentUser}
                                  >
                                    <SelectTrigger className="w-[140px]">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {availableRoles.map((role) => {
                                        const isDisabled = lastOwner && role !== 'OWNER';
                                        return (
                                          <SelectItem
                                            key={role}
                                            value={role}
                                            disabled={isDisabled}
                                          >
                                            {role}
                                            {isDisabled && ' (Last OWNER)'}
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
                        <TableCell>
                          <Badge variant={user.disabled ? 'destructive' : 'default'}>
                            {user.disabled ? 'Disabled' : 'Active'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {format(new Date(user.created_at), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {hasPendingChange && (
                              <Button
                                size="sm"
                                onClick={() => handleSaveRole(user.id)}
                                disabled={isSaving || isToggling}
                              >
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
                            <TooltipProvider>
                              <Tooltip>
                                <AlertDialog>
                                  <TooltipTrigger asChild>
                                    <div>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          size="sm"
                                          variant={user.disabled ? 'default' : 'destructive'}
                                          disabled={isToggling || isSaving || (!user.disabled && !canDisable.allowed)}
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
                                      <AlertDialogTitle>
                                        {user.disabled ? 'Enable User' : 'Disable User'}
                                      </AlertDialogTitle>
                                      <AlertDialogDescription>
                                        {user.disabled
                                          ? `Are you sure you want to enable ${user.email}? They will regain access to the application.`
                                          : `Are you sure you want to disable ${user.email}? They will be immediately logged out and unable to access the application.`
                                        }
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleToggleDisabled(user.id, user.disabled)}
                                      >
                                        {user.disabled ? 'Enable User' : 'Disable User'}
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
