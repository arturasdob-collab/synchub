'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type OrganizationRow = {
  id: string;
  name: string;
  created_at?: string | null;
  users_count?: number;
  pending_invites_count?: number;
};

export default function AdminOrganizationsPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();

  const [organizations, setOrganizations] = useState<OrganizationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [organizationName, setOrganizationName] = useState('');
  const [creatingOrganization, setCreatingOrganization] = useState(false);

  const [renamingOrganizationId, setRenamingOrganizationId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [savingRename, setSavingRename] = useState(false);

  const [deletingOrganizationId, setDeletingOrganizationId] = useState<string | null>(null);
  const [organizationError, setOrganizationError] = useState('');

  const canViewOrganizations =
    !!profile &&
    ((profile as any).is_super_admin ||
      profile.role === 'OWNER' ||
      profile.role === 'ADMIN' ||
      (profile as any).is_creator);

  useEffect(() => {
    if (authLoading) return;

    if (!profile) {
      router.push('/login');
      return;
    }

    if (!canViewOrganizations) {
      router.push('/app');
      return;
    }

    fetchOrganizations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, profile]);

  const fetchOrganizations = async () => {
    try {
      setLoading(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error('Not authenticated');
        return;
      }

      const res = await fetch('/api/admin/organizations/list', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        toast.error(data?.error || data?.message || `Failed to load organizations (${res.status})`);
        return;
      }

      setOrganizations(data?.organizations ?? []);
    } catch (error) {
      console.error('FETCH ORGANIZATIONS PAGE ERROR:', error);
      toast.error('Failed to load organizations');
    } finally {
      setLoading(false);
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

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setOrganizationError(data?.error || data?.message || `Create failed (${res.status})`);
        return;
      }

      toast.success('Organization created');
      setOrganizationName('');
      await fetchOrganizations();
    } catch (error) {
      console.error('CREATE ORGANIZATION PAGE ERROR:', error);
      toast.error('Failed to create organization');
    } finally {
      setCreatingOrganization(false);
    }
  };

  const handleStartRename = (org: OrganizationRow) => {
    setOrganizationError('');
    setRenamingOrganizationId(org.id);
    setRenameValue(org.name);
  };

  const handleSaveRename = async (organizationId: string) => {
    const name = renameValue.trim();
    setOrganizationError('');

    if (!name) {
      toast.error('Organization name is required');
      return;
    }

    try {
      setSavingRename(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error('Not authenticated');
        return;
      }

      const res = await fetch('/api/admin/organizations/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          organizationId,
          name,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setOrganizationError(data?.error || data?.message || `Rename failed (${res.status})`);
        return;
      }

      toast.success('Organization renamed');
      setRenamingOrganizationId(null);
      setRenameValue('');
      await fetchOrganizations();
    } catch (error) {
      console.error('RENAME ORGANIZATION PAGE ERROR:', error);
      toast.error('Failed to rename organization');
    } finally {
      setSavingRename(false);
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
        setOrganizationError(data?.error || data?.message || `Delete failed (${res.status})`);
        return;
      }

      toast.success('Organization deleted');
      await fetchOrganizations();
    } catch (error) {
      console.error('DELETE ORGANIZATION PAGE ERROR:', error);
      toast.error('Failed to delete organization');
    } finally {
      setDeletingOrganizationId(null);
    }
  };

  if (authLoading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin mx-auto" />
          <p className="mt-3 text-sm text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!canViewOrganizations) {
    return null;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Organizations</h1>
        <p className="text-slate-600 mt-2">Manage tenant/workspace organizations</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Organizations</CardTitle>
          <CardDescription>
            Separate admin page for organizations. User Management stays unchanged for now.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="Organization name"
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
              disabled={creatingOrganization}
            />

            <button
              onClick={handleCreateOrganization}
              disabled={creatingOrganization}
              className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {creatingOrganization ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Add Organization'
              )}
            </button>
          </div>

          {organizationError && (
            <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {organizationError}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : organizations.length === 0 ? (
            <div className="py-10 text-sm text-slate-500">No organizations found</div>
          ) : (
            <div className="space-y-3">
              {organizations.map((org) => {
                const isRenaming = renamingOrganizationId === org.id;

                return (
                  <div
                    key={org.id}
                    className="flex items-center justify-between rounded-lg border px-4 py-3"
                  >
                    <div className="flex-1 pr-4">
                      {isRenaming ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                            disabled={savingRename}
                          />

                          <button
                            onClick={() => handleSaveRename(org.id)}
                            disabled={savingRename}
                            className="inline-flex items-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                          >
                            {savingRename ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              'Save'
                            )}
                          </button>

                          <button
                            onClick={() => {
                              setRenamingOrganizationId(null);
                              setRenameValue('');
                              setOrganizationError('');
                            }}
                            disabled={savingRename}
                            className="inline-flex items-center rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="font-medium text-slate-900">{org.name}</div>
                          <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                            <span>{org.users_count ?? 0} users</span>
                            <span>{org.pending_invites_count ?? 0} pending invites</span>
                            <span>
                              {org.created_at ? new Date(org.created_at).toLocaleDateString() : '—'}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-slate-400">{org.id}</div>
                        </>
                      )}
                    </div>

                    {!isRenaming && (
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleStartRename(org)}
                            className="inline-flex items-center rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
                          >
                            Rename
                          </button>

                          <button
                            onClick={() => handleDeleteOrganization(org.id, org.name)}
                            disabled={
                              deletingOrganizationId === org.id ||
                              (org.users_count ?? 0) > 0 ||
                              (org.pending_invites_count ?? 0) > 0
                            }
                            className="inline-flex items-center rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {deletingOrganizationId === org.id ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Deleting...
                              </>
                            ) : (
                              'Delete'
                            )}
                          </button>
                        </div>

                        {((org.users_count ?? 0) > 0 || (org.pending_invites_count ?? 0) > 0) && (
  <div className="text-xs text-amber-600">
    {(org.users_count ?? 0) > 0 && (org.pending_invites_count ?? 0) > 0
      ? 'Cannot delete: organization has users and pending invites'
      : (org.users_count ?? 0) > 0
      ? 'Cannot delete: organization has users'
      : 'Cannot delete: organization has pending invites'}
  </div>
)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}