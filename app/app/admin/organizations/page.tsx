'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { supabase } from '@/lib/supabase/client';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';

type OrganizationType = 'company' | 'partner' | 'terminal' | 'warehouse';

type OrganizationRow = {
  id: string;
  name: string;
  type: OrganizationType | null;
  display_type: string;
  company_code: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  created_at: string | null;
  users_count: number;
  pending_invites_count: number;
};

type OrganizationsFilters = {
  search: string;
  organization: string;
  address: string;
  type: 'all' | OrganizationType;
  createdFrom: string;
  createdTo: string;
};

type HeaderFilterId = 'organization' | 'address' | 'type' | 'created';

const DEFAULT_FILTERS: OrganizationsFilters = {
  search: '',
  organization: '',
  address: '',
  type: 'all',
  createdFrom: '',
  createdTo: '',
};

function matchesText(value: string | null | undefined, query: string) {
  if (!query.trim()) {
    return true;
  }

  return (value || '').toLowerCase().includes(query.trim().toLowerCase());
}

function formatShortOrganizationName(value: string | null | undefined) {
  const normalized = (value || '').trim();

  if (!normalized) {
    return '-';
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).join(' ');
}

function formatAddress(row: OrganizationRow) {
  return [row.address, row.city, row.postal_code, row.country]
    .filter(Boolean)
    .join(', ') || '-';
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

export default function AdminOrganizationsPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();

  const [organizations, setOrganizations] = useState<OrganizationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerUserId, setViewerUserId] = useState('');
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const [filters, setFilters] = useState<OrganizationsFilters>(DEFAULT_FILTERS);
  const [activeHeaderFilter, setActiveHeaderFilter] =
    useState<HeaderFilterId | null>(null);

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

    void fetchOrganizations();
  }, [authLoading, canViewOrganizations, profile, router]);

  useEffect(() => {
    if (!viewerUserId) {
      return;
    }

    try {
      const saved = window.localStorage.getItem(
        `synchub.organizations.filters.${viewerUserId}`
      );

      if (!saved) {
        setFiltersHydrated(true);
        return;
      }

      const parsed = JSON.parse(saved) as Partial<OrganizationsFilters>;
      setFilters({
        ...DEFAULT_FILTERS,
        ...parsed,
        type:
          parsed.type === 'company' ||
          parsed.type === 'partner' ||
          parsed.type === 'terminal' ||
          parsed.type === 'warehouse'
            ? parsed.type
            : 'all',
      });
    } catch (error) {
      console.error('Failed to hydrate organization filters:', error);
      setFilters(DEFAULT_FILTERS);
    } finally {
      setFiltersHydrated(true);
    }
  }, [viewerUserId]);

  useEffect(() => {
    if (!viewerUserId || !filtersHydrated) {
      return;
    }

    window.localStorage.setItem(
      `synchub.organizations.filters.${viewerUserId}`,
      JSON.stringify(filters)
    );
  }, [filters, filtersHydrated, viewerUserId]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;

      if (!target?.closest('[data-organization-header-filter-root="true"]')) {
        setActiveHeaderFilter(null);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, []);

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
        toast.error(data?.error || data?.message || 'Failed to load organizations');
        setOrganizations([]);
        return;
      }

      setOrganizations(data?.organizations ?? []);
      setViewerUserId(data?.viewer_user_id ?? '');
    } catch (error) {
      console.error('FETCH ORGANIZATIONS PAGE ERROR:', error);
      toast.error('Failed to load organizations');
      setOrganizations([]);
    } finally {
      setLoading(false);
    }
  };

  const updateFilter = <K extends keyof OrganizationsFilters>(
    key: K,
    value: OrganizationsFilters[K]
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

  const filteredOrganizations = useMemo(() => {
    const globalSearch = filters.search.trim().toLowerCase();

    return organizations.filter((organization) => {
      const address = formatAddress(organization);
      const searchable = [
        organization.name,
        organization.company_code,
        organization.display_type,
        address,
        organization.created_at
          ? new Date(organization.created_at).toLocaleDateString()
          : '',
      ]
        .join(' ')
        .toLowerCase();

      const matchesGlobalSearch =
        !globalSearch || searchable.includes(globalSearch);

      const matchesOrganization =
        matchesText(organization.name, filters.organization) ||
        matchesText(organization.company_code, filters.organization);

      const matchesAddress = matchesText(address, filters.address);
      const matchesType =
        filters.type === 'all' ? true : organization.type === filters.type;

      const createdDate = organization.created_at
        ? new Date(organization.created_at)
        : null;
      const matchesCreatedFrom =
        !filters.createdFrom ||
        (createdDate &&
          createdDate >= new Date(`${filters.createdFrom}T00:00:00`));
      const matchesCreatedTo =
        !filters.createdTo ||
        (createdDate &&
          createdDate <= new Date(`${filters.createdTo}T23:59:59`));

      return (
        matchesGlobalSearch &&
        matchesOrganization &&
        matchesAddress &&
        matchesType &&
        matchesCreatedFrom &&
        matchesCreatedTo
      );
    });
  }, [filters, organizations]);

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
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="text-center">
          <h1 className="text-3xl font-bold">Organizations</h1>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <input
            placeholder="Search..."
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            className="w-full max-w-xs rounded-md border px-3 py-2"
          />

          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm hover:bg-slate-50"
          >
            Reset filters
          </button>

          <button
            type="button"
            onClick={() => router.push('/app/admin/organizations/new')}
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
          >
            <Plus size={16} />
            Add Organization
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white">
        {loading && !filtersHydrated ? (
          <div className="flex justify-center p-10">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full text-sm">
              <thead className="border-b bg-slate-50">
                <tr>
                  <th
                    className="px-2 py-2 text-left align-top"
                    data-organization-header-filter-root="true"
                  >
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
                          <input
                            value={filters.organization}
                            onChange={(e) => updateFilter('organization', e.target.value)}
                            placeholder="Name or code"
                            className="w-full rounded-md border px-2 py-2 text-sm"
                          />
                        </div>
                      ) : null}
                    </div>
                  </th>

                  <th
                    className="px-2 py-2 text-left align-top"
                    data-organization-header-filter-root="true"
                  >
                    <div className="relative">
                      <HeaderFilterButton
                        label="Address"
                        active={activeHeaderFilter === 'address'}
                        onClick={() =>
                          setActiveHeaderFilter((prev) =>
                            prev === 'address' ? null : 'address'
                          )
                        }
                      />
                      {activeHeaderFilter === 'address' ? (
                        <div className="absolute left-0 top-full z-20 mt-2 w-56 rounded-xl border bg-white p-2 shadow-lg">
                          <input
                            value={filters.address}
                            onChange={(e) => updateFilter('address', e.target.value)}
                            placeholder="Address"
                            className="w-full rounded-md border px-2 py-2 text-sm"
                          />
                        </div>
                      ) : null}
                    </div>
                  </th>

                  <th
                    className="px-2 py-2 text-left align-top"
                    data-organization-header-filter-root="true"
                  >
                    <div className="relative">
                      <HeaderFilterButton
                        label="Type"
                        active={activeHeaderFilter === 'type'}
                        onClick={() =>
                          setActiveHeaderFilter((prev) =>
                            prev === 'type' ? null : 'type'
                          )
                        }
                      />
                      {activeHeaderFilter === 'type' ? (
                        <div className="absolute left-0 top-full z-20 mt-2 w-44 rounded-xl border bg-white p-2 shadow-lg">
                          <select
                            value={filters.type}
                            onChange={(e) =>
                              updateFilter(
                                'type',
                                e.target.value as OrganizationsFilters['type']
                              )
                            }
                            className="w-full rounded-md border px-2 py-2 text-sm"
                          >
                            <option value="all">All</option>
                            <option value="company">Company</option>
                            <option value="partner">Partner</option>
                            <option value="terminal">Terminal</option>
                            <option value="warehouse">Warehouse</option>
                          </select>
                        </div>
                      ) : null}
                    </div>
                  </th>

                  <th
                    className="px-2 py-2 text-left align-top"
                    data-organization-header-filter-root="true"
                  >
                    <div className="relative">
                      <HeaderFilterButton
                        label="Created"
                        active={activeHeaderFilter === 'created'}
                        onClick={() =>
                          setActiveHeaderFilter((prev) =>
                            prev === 'created' ? null : 'created'
                          )
                        }
                      />
                      {activeHeaderFilter === 'created' ? (
                        <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border bg-white p-2 shadow-lg space-y-2">
                          <input
                            type="date"
                            value={filters.createdFrom}
                            onChange={(e) => updateFilter('createdFrom', e.target.value)}
                            className="w-full rounded-md border px-2 py-2 text-sm"
                          />
                          <input
                            type="date"
                            value={filters.createdTo}
                            onChange={(e) => updateFilter('createdTo', e.target.value)}
                            className="w-full rounded-md border px-2 py-2 text-sm"
                          />
                        </div>
                      ) : null}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredOrganizations.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                      No organizations found
                    </td>
                  </tr>
                ) : (
                  filteredOrganizations.map((organization) => (
                    <tr
                      key={organization.id}
                      onClick={() =>
                        router.push(`/app/admin/organizations/${organization.id}`)
                      }
                      className="cursor-pointer border-b hover:bg-slate-50"
                    >
                      <td className="px-2 py-2">
                        <div className="font-medium">
                          {formatShortOrganizationName(organization.name)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {organization.company_code || '-'}
                        </div>
                      </td>
                      <td className="px-2 py-2">{formatAddress(organization)}</td>
                      <td className="px-2 py-2">{organization.display_type}</td>
                      <td className="px-2 py-2">
                        {organization.created_at
                          ? new Date(organization.created_at).toLocaleDateString()
                          : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
