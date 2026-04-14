'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';

type CompanyRow = {
  id: string;
  company_code: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  is_client: boolean;
  is_carrier: boolean;
  display_type: 'Client' | 'Carrier' | 'Client / Carrier' | '-';
  rating: number | null;
  cmr_status: 'Valid' | 'Not valid' | null;
  created_at: string | null;
  created_by_user: {
    first_name: string | null;
    last_name: string | null;
  } | null;
};

type CompaniesFilters = {
  search: string;
  type: 'all' | 'client' | 'carrier';
  company: string;
  address: string;
  rating: string;
  cmr: 'all' | 'valid' | 'not_valid' | 'not_applicable';
  createdBy: string;
  createdFrom: string;
  createdTo: string;
  rowsPerPage: 20 | 50 | 100;
};

type HeaderFilterId =
  | 'company'
  | 'address'
  | 'type'
  | 'rating'
  | 'cmr'
  | 'created';

const DEFAULT_FILTERS: CompaniesFilters = {
  search: '',
  type: 'all',
  company: '',
  address: '',
  rating: '',
  cmr: 'all',
  createdBy: '',
  createdFrom: '',
  createdTo: '',
  rowsPerPage: 20,
};

function formatPerson(
  person: { first_name: string | null; last_name: string | null } | null | undefined
) {
  if (!person) {
    return '-';
  }

  return `${person.first_name || ''} ${person.last_name || ''}`.trim() || '-';
}

function formatShortCompanyName(value: string | null | undefined) {
  const normalized = (value || '').trim();

  if (!normalized) {
    return '-';
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).join(' ');
}

function formatAddress(row: CompanyRow) {
  return [row.address, row.city, row.country].filter(Boolean).join(', ') || '-';
}

function matchesText(value: string | null | undefined, query: string) {
  if (!query.trim()) {
    return true;
  }

  return (value || '').toLowerCase().includes(query.trim().toLowerCase());
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

function getCmrBadgeClass(status: CompanyRow['cmr_status']) {
  if (status === 'Valid') {
    return 'bg-green-100 text-green-700';
  }

  if (status === 'Not valid') {
    return 'bg-red-100 text-red-700';
  }

  return 'bg-slate-100 text-slate-500';
}

export default function CompaniesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [viewerUserId, setViewerUserId] = useState('');
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const [filters, setFilters] = useState<CompaniesFilters>(DEFAULT_FILTERS);
  const [activeHeaderFilter, setActiveHeaderFilter] =
    useState<HeaderFilterId | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    void fetchCompanies();
  }, []);

  useEffect(() => {
    if (!viewerUserId) {
      return;
    }

    try {
      const saved = window.localStorage.getItem(
        `synchub.companies.filters.${viewerUserId}`
      );

      if (!saved) {
        setFiltersHydrated(true);
        return;
      }

      const parsed = JSON.parse(saved) as Partial<CompaniesFilters>;

      setFilters({
        ...DEFAULT_FILTERS,
        ...parsed,
        rowsPerPage:
          parsed.rowsPerPage === 20 ||
          parsed.rowsPerPage === 50 ||
          parsed.rowsPerPage === 100
            ? parsed.rowsPerPage
            : DEFAULT_FILTERS.rowsPerPage,
      });
    } catch (error) {
      console.error('Failed to hydrate company filters:', error);
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
      `synchub.companies.filters.${viewerUserId}`,
      JSON.stringify(filters)
    );
  }, [filters, filtersHydrated, viewerUserId]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;

      if (!target?.closest('[data-company-header-filter-root="true"]')) {
        setActiveHeaderFilter(null);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  const fetchCompanies = async () => {
    try {
      setLoading(true);

      const res = await fetch('/api/companies/list', {
        method: 'GET',
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to load companies');
        setCompanies([]);
        return;
      }

      setCompanies(data.companies || []);
      setViewerUserId(data.viewer_user_id || '');
    } catch (error) {
      console.error('FETCH COMPANIES ERROR:', error);
      toast.error('Failed to load companies');
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredCompanies = useMemo(() => {
    const globalSearch = filters.search.trim().toLowerCase();

    return companies.filter((company) => {
      const creator = formatPerson(company.created_by_user);
      const addressText = formatAddress(company);
      const searchableText = [
        company.name,
        company.company_code,
        addressText,
        company.display_type,
        company.rating !== null ? String(company.rating) : '',
        company.cmr_status || '',
        creator,
        company.created_at ? new Date(company.created_at).toLocaleString() : '',
      ]
        .join(' ')
        .toLowerCase();

      const matchesGlobalSearch =
        !globalSearch || searchableText.includes(globalSearch);

      const matchesType =
        filters.type === 'all'
          ? true
          : filters.type === 'client'
          ? company.is_client
          : company.is_carrier;

      const matchesCompany =
        matchesText(company.name, filters.company) ||
        matchesText(company.company_code, filters.company);

      const matchesAddress = matchesText(addressText, filters.address);
      const matchesRating = matchesText(
        company.rating !== null ? String(company.rating) : '',
        filters.rating
      );

      const matchesCmr =
        filters.cmr === 'all'
          ? true
          : filters.cmr === 'valid'
          ? company.cmr_status === 'Valid'
          : filters.cmr === 'not_valid'
          ? company.cmr_status === 'Not valid'
          : company.cmr_status === null;

      const matchesCreatedBy = matchesText(creator, filters.createdBy);

      const createdDate = company.created_at ? new Date(company.created_at) : null;
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
        matchesType &&
        matchesCompany &&
        matchesAddress &&
        matchesRating &&
        matchesCmr &&
        matchesCreatedBy &&
        matchesCreatedFrom &&
        matchesCreatedTo
      );
    });
  }, [companies, filters]);

  const totalPages = Math.max(1, Math.ceil(filteredCompanies.length / filters.rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedCompanies = filteredCompanies.slice(
    (safeCurrentPage - 1) * filters.rowsPerPage,
    safeCurrentPage * filters.rowsPerPage
  );

  const updateFilter = <K extends keyof CompaniesFilters>(
    key: K,
    value: CompaniesFilters[K]
  ) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setCurrentPage(1);
    setActiveHeaderFilter(null);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div />

        <div className="text-center">
          <h1 className="text-3xl font-bold">Companies</h1>
        </div>

        <button
          onClick={() => router.push('/app/companies/new')}
          className="justify-self-end inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
        >
          <Plus size={16} />
          Add Company
        </button>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <input
            placeholder="Search..."
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            className="w-full max-w-xs rounded-md border px-3 py-2"
          />

          <div className="inline-flex overflow-hidden rounded-md border">
            <button
              type="button"
              onClick={() => updateFilter('type', 'all')}
              className={`px-4 py-2 text-sm ${
                filters.type === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => updateFilter('type', 'client')}
              className={`border-l px-4 py-2 text-sm ${
                filters.type === 'client'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              Client
            </button>
            <button
              type="button"
              onClick={() => updateFilter('type', 'carrier')}
              className={`border-l px-4 py-2 text-sm ${
                filters.type === 'carrier'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              Carrier
            </button>
          </div>

          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm hover:bg-slate-50"
          >
            Reset filters
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
            <table className="min-w-[980px] w-full text-sm">
              <thead className="border-b bg-slate-50">
                <tr>
                  <th className="px-2 py-2 text-left align-top" data-company-header-filter-root="true">
                    <div className="relative">
                      <HeaderFilterButton
                        label="Company"
                        active={activeHeaderFilter === 'company'}
                        onClick={() =>
                          setActiveHeaderFilter((prev) => (prev === 'company' ? null : 'company'))
                        }
                      />
                      {activeHeaderFilter === 'company' ? (
                        <div className="absolute left-0 top-full z-20 mt-2 w-52 rounded-xl border bg-white p-2 shadow-lg">
                          <input
                            value={filters.company}
                            onChange={(e) => updateFilter('company', e.target.value)}
                            placeholder="Name or code"
                            className="w-full rounded-md border px-2 py-2 text-sm"
                          />
                        </div>
                      ) : null}
                    </div>
                  </th>
                  <th className="px-2 py-2 text-left align-top" data-company-header-filter-root="true">
                    <div className="relative">
                      <HeaderFilterButton
                        label="Address"
                        active={activeHeaderFilter === 'address'}
                        onClick={() =>
                          setActiveHeaderFilter((prev) => (prev === 'address' ? null : 'address'))
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
                  <th className="px-2 py-2 text-left align-top" data-company-header-filter-root="true">
                    <div className="relative">
                      <HeaderFilterButton
                        label="Type"
                        active={activeHeaderFilter === 'type'}
                        onClick={() =>
                          setActiveHeaderFilter((prev) => (prev === 'type' ? null : 'type'))
                        }
                      />
                      {activeHeaderFilter === 'type' ? (
                        <div className="absolute left-0 top-full z-20 mt-2 w-40 rounded-xl border bg-white p-2 shadow-lg">
                          <select
                            value={filters.type}
                            onChange={(e) =>
                              updateFilter('type', e.target.value as CompaniesFilters['type'])
                            }
                            className="w-full rounded-md border px-2 py-2 text-sm"
                          >
                            <option value="all">All</option>
                            <option value="client">Client</option>
                            <option value="carrier">Carrier</option>
                          </select>
                        </div>
                      ) : null}
                    </div>
                  </th>
                  <th className="px-2 py-2 text-left align-top" data-company-header-filter-root="true">
                    <div className="relative">
                      <HeaderFilterButton
                        label="Rating"
                        active={activeHeaderFilter === 'rating'}
                        onClick={() =>
                          setActiveHeaderFilter((prev) => (prev === 'rating' ? null : 'rating'))
                        }
                      />
                      {activeHeaderFilter === 'rating' ? (
                        <div className="absolute left-0 top-full z-20 mt-2 w-36 rounded-xl border bg-white p-2 shadow-lg">
                          <input
                            value={filters.rating}
                            onChange={(e) => updateFilter('rating', e.target.value)}
                            placeholder="Rating"
                            className="w-full rounded-md border px-2 py-2 text-sm"
                          />
                        </div>
                      ) : null}
                    </div>
                  </th>
                  <th className="px-2 py-2 text-left align-top" data-company-header-filter-root="true">
                    <div className="relative">
                      <HeaderFilterButton
                        label="CMR"
                        active={activeHeaderFilter === 'cmr'}
                        onClick={() =>
                          setActiveHeaderFilter((prev) => (prev === 'cmr' ? null : 'cmr'))
                        }
                      />
                      {activeHeaderFilter === 'cmr' ? (
                        <div className="absolute left-0 top-full z-20 mt-2 w-40 rounded-xl border bg-white p-2 shadow-lg">
                          <select
                            value={filters.cmr}
                            onChange={(e) =>
                              updateFilter('cmr', e.target.value as CompaniesFilters['cmr'])
                            }
                            className="w-full rounded-md border px-2 py-2 text-sm"
                          >
                            <option value="all">All</option>
                            <option value="valid">Valid</option>
                            <option value="not_valid">Not valid</option>
                            <option value="not_applicable">-</option>
                          </select>
                        </div>
                      ) : null}
                    </div>
                  </th>
                  <th className="px-2 py-2 text-left align-top" data-company-header-filter-root="true">
                    <div className="relative">
                      <HeaderFilterButton
                        label="Created"
                        active={activeHeaderFilter === 'created'}
                        onClick={() =>
                          setActiveHeaderFilter((prev) => (prev === 'created' ? null : 'created'))
                        }
                      />
                      {activeHeaderFilter === 'created' ? (
                        <div className="absolute right-0 top-full z-20 mt-2 w-60 rounded-xl border bg-white p-2 shadow-lg space-y-2">
                          <input
                            value={filters.createdBy}
                            onChange={(e) => updateFilter('createdBy', e.target.value)}
                            placeholder="Creator"
                            className="w-full rounded-md border px-2 py-2 text-sm"
                          />
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
                {filteredCompanies.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                      No companies found
                    </td>
                  </tr>
                ) : (
                  paginatedCompanies.map((company) => (
                    <tr
                      key={company.id}
                      onClick={() => router.push(`/app/companies/${company.id}`)}
                      className="cursor-pointer border-b hover:bg-slate-50"
                    >
                      <td className="px-2 py-2">
                        <div className="font-medium">{formatShortCompanyName(company.name)}</div>
                        <div className="text-xs text-slate-500">
                          {company.company_code || '-'}
                        </div>
                      </td>
                      <td className="px-2 py-2">{formatAddress(company)}</td>
                      <td className="px-2 py-2">{company.display_type}</td>
                      <td className="px-2 py-2">
                        {company.rating !== null ? company.rating.toFixed(1) : '-'}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${getCmrBadgeClass(
                            company.cmr_status
                          )}`}
                        >
                          {company.cmr_status || '-'}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <div className="whitespace-nowrap">
                          <div>
                            {company.created_at
                              ? new Date(company.created_at).toLocaleDateString()
                              : '-'}
                          </div>
                          <div className="text-xs text-slate-500">
                            {formatPerson(company.created_by_user)}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="pt-4">
        <div className="flex flex-wrap items-center justify-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Rows per page</span>
            <select
              value={filters.rowsPerPage}
              onChange={(e) =>
                updateFilter(
                  'rowsPerPage',
                  Number(e.target.value) as CompaniesFilters['rowsPerPage']
                )
              }
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <button
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={safeCurrentPage === 1}
            className="rounded-md border px-6 py-2 text-sm disabled:opacity-50"
          >
            Prev
          </button>

          <span className="text-sm text-slate-700">Page {safeCurrentPage}</span>

          <button
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={safeCurrentPage === totalPages}
            className="rounded-md border px-6 py-2 text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
