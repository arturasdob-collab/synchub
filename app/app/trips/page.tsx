'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';

type TripRow = {
  id: string;
  trip_number: string;
  status: 'unconfirmed' | 'confirmed' | 'active' | 'completed';
  truck_plate: string | null;
  trailer_plate: string | null;
  driver_name: string | null;
  price: number | null;
  payment_term_days: number | null;
  payment_type: string | null;
  vat_rate: string | null;
  is_groupage: boolean;
  display_type: 'Groupage' | 'Regular';
  created_at: string;
  carrier: {
    name: string | null;
    company_code: string | null;
  } | null;
  linked_manager: {
    id: string | null;
    name: string;
  } | null;
  can_view_financials: boolean;
  created_by_user: {
    first_name: string | null;
    last_name: string | null;
  } | null;
};

type TripsFilters = {
  search: string;
  status: string;
  trip: string;
  carrier: string;
  type: string;
  driver: string;
  truckTrailer: string;
  price: string;
  linked: string;
  createdBy: string;
  createdFrom: string;
  createdTo: string;
  rowsPerPage: number;
};

type HeaderFilterId =
  | 'status'
  | 'trip'
  | 'carrier'
  | 'type'
  | 'driver'
  | 'truck_trailer'
  | 'price'
  | 'linked'
  | 'created';

const DEFAULT_FILTERS: TripsFilters = {
  search: '',
  status: 'all',
  trip: '',
  carrier: '',
  type: 'all',
  driver: '',
  truckTrailer: '',
  price: '',
  linked: '',
  createdBy: '',
  createdFrom: '',
  createdTo: '',
  rowsPerPage: 20,
};

function formatPerson(
  person: { first_name: string | null; last_name: string | null } | null | undefined
) {
  if (!person) return '-';

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

function formatStatusLabel(status: TripRow['status']) {
  if (status === 'unconfirmed') return 'Unconfirmed';
  if (status === 'confirmed') return 'Confirmed';
  if (status === 'active') return 'Active';
  if (status === 'completed') return 'Completed';
  return status;
}

function getStatusBadgeClass(status: TripRow['status']) {
  if (status === 'unconfirmed') {
    return 'bg-yellow-100 text-yellow-800';
  }
  if (status === 'confirmed') {
    return 'bg-blue-100 text-blue-800';
  }
  if (status === 'active') {
    return 'bg-indigo-100 text-indigo-800';
  }
  return 'bg-green-100 text-green-800';
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

export default function TripsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [viewerUserId, setViewerUserId] = useState('');
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const [filters, setFilters] = useState<TripsFilters>(DEFAULT_FILTERS);
  const [activeHeaderFilter, setActiveHeaderFilter] =
    useState<HeaderFilterId | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    void fetchTrips();
  }, []);

  useEffect(() => {
    if (!viewerUserId) {
      return;
    }

    try {
      const saved = window.localStorage.getItem(
        `synchub.trips.filters.${viewerUserId}`
      );

      if (!saved) {
        setFiltersHydrated(true);
        return;
      }

      const parsed = JSON.parse(saved) as Partial<TripsFilters>;

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
      console.error('Failed to hydrate trip filters:', error);
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
      `synchub.trips.filters.${viewerUserId}`,
      JSON.stringify(filters)
    );
  }, [filters, filtersHydrated, viewerUserId]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;

      if (!target?.closest('[data-trip-header-filter-root="true"]')) {
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

  const fetchTrips = async () => {
    try {
      setLoading(true);

      const res = await fetch('/api/trips/list', {
        method: 'GET',
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to load trips');
        setTrips([]);
        return;
      }

      setTrips(data.trips || []);
      setViewerUserId(data.viewer_user_id || '');
    } catch (error) {
      console.error('FETCH TRIPS ERROR:', error);
      toast.error('Failed to load trips');
      setTrips([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredTrips = useMemo(() => {
    const globalSearch = filters.search.trim().toLowerCase();

    return trips.filter((trip) => {
      const createdBy = formatPerson(trip.created_by_user);
      const linkedManager = trip.linked_manager?.name || '';
      const carrierName = trip.carrier?.name || '';
      const carrierCode = trip.carrier?.company_code || '';
      const priceText =
        trip.can_view_financials &&
        trip.price !== null &&
        trip.price !== undefined
          ? `${trip.price} EUR`
          : '';
      const truckTrailerText =
        [trip.truck_plate, trip.trailer_plate].filter(Boolean).join(' / ') || '';
      const searchableText = [
        formatStatusLabel(trip.status),
        trip.trip_number,
        carrierName,
        carrierCode,
        trip.display_type,
        trip.driver_name || '',
        truckTrailerText,
        priceText,
        linkedManager,
        createdBy,
        trip.created_at ? new Date(trip.created_at).toLocaleString() : '',
      ]
        .join(' ')
        .toLowerCase();

      const matchesGlobalSearch =
        !globalSearch || searchableText.includes(globalSearch);

      const matchesStatus =
        filters.status === 'all' ? true : trip.status === filters.status;
      const matchesTrip = matchesText(trip.trip_number, filters.trip);
      const matchesCarrier =
        matchesText(carrierName, filters.carrier) ||
        matchesText(carrierCode, filters.carrier);
      const matchesType =
        filters.type === 'all'
          ? true
          : trip.display_type.toLowerCase() === filters.type.toLowerCase();
      const matchesDriver = matchesText(trip.driver_name, filters.driver);
      const matchesTruckTrailer = matchesText(
        truckTrailerText,
        filters.truckTrailer
      );
      const matchesPrice = matchesText(priceText, filters.price);
      const matchesLinked = matchesText(linkedManager, filters.linked);
      const matchesCreatedBy = matchesText(createdBy, filters.createdBy);

      const createdDate = trip.created_at ? new Date(trip.created_at) : null;
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
        matchesStatus &&
        matchesTrip &&
        matchesCarrier &&
        matchesType &&
        matchesDriver &&
        matchesTruckTrailer &&
        matchesPrice &&
        matchesLinked &&
        matchesCreatedBy &&
        matchesCreatedFrom &&
        matchesCreatedTo
      );
    });
  }, [filters, trips]);

  const totalPages = Math.max(1, Math.ceil(filteredTrips.length / filters.rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedTrips = filteredTrips.slice(
    (safeCurrentPage - 1) * filters.rowsPerPage,
    safeCurrentPage * filters.rowsPerPage
  );

  const updateFilter = <K extends keyof TripsFilters>(
    key: K,
    value: TripsFilters[K]
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
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div />

        <div className="text-center">
          <h1 className="text-3xl font-bold">Trips</h1>
        </div>

        <button
          onClick={() => router.push('/app/trips/new')}
          className="justify-self-end inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
        >
          <Plus size={16} />
          Add Trip
        </button>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <div className="flex flex-col items-center justify-center gap-3 md:flex-row">
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
        </div>
      </div>

      <div className="rounded-2xl border bg-white overflow-hidden">
        {loading && !filtersHydrated ? (
          <div className="p-10 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-2 py-2 text-left align-top" data-trip-header-filter-root="true">
                    <div className="relative">
                      <HeaderFilterButton
                        label="Status"
                        active={activeHeaderFilter === 'status'}
                        onClick={() =>
                          setActiveHeaderFilter((prev) => (prev === 'status' ? null : 'status'))
                        }
                      />
                      {activeHeaderFilter === 'status' ? (
                        <div className="absolute left-0 top-full z-20 mt-2 w-44 rounded-xl border bg-white p-2 shadow-lg">
                          <select
                            value={filters.status}
                            onChange={(e) => updateFilter('status', e.target.value)}
                            className="w-full rounded-md border px-2 py-2 text-sm"
                          >
                            <option value="all">All statuses</option>
                            <option value="unconfirmed">Unconfirmed</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="active">Active</option>
                            <option value="completed">Completed</option>
                          </select>
                        </div>
                      ) : null}
                    </div>
                  </th>
                  <th className="px-2 py-2 text-left align-top" data-trip-header-filter-root="true">
                    <div className="relative">
                      <HeaderFilterButton
                        label="Trip"
                        active={activeHeaderFilter === 'trip'}
                        onClick={() =>
                          setActiveHeaderFilter((prev) => (prev === 'trip' ? null : 'trip'))
                        }
                      />
                      {activeHeaderFilter === 'trip' ? (
                        <div className="absolute left-0 top-full z-20 mt-2 w-44 rounded-xl border bg-white p-2 shadow-lg">
                          <input
                            value={filters.trip}
                            onChange={(e) => updateFilter('trip', e.target.value)}
                            placeholder="Trip no."
                            className="w-full rounded-md border px-2 py-2 text-sm"
                          />
                        </div>
                      ) : null}
                    </div>
                  </th>
                  <th className="px-2 py-2 text-left align-top" data-trip-header-filter-root="true">
                    <div className="relative">
                      <HeaderFilterButton
                        label="Carrier"
                        active={activeHeaderFilter === 'carrier'}
                        onClick={() =>
                          setActiveHeaderFilter((prev) => (prev === 'carrier' ? null : 'carrier'))
                        }
                      />
                      {activeHeaderFilter === 'carrier' ? (
                        <div className="absolute left-0 top-full z-20 mt-2 w-52 rounded-xl border bg-white p-2 shadow-lg">
                          <input
                            value={filters.carrier}
                            onChange={(e) => updateFilter('carrier', e.target.value)}
                            placeholder="Carrier name or code"
                            className="w-full rounded-md border px-2 py-2 text-sm"
                          />
                        </div>
                      ) : null}
                    </div>
                  </th>
                  <th className="px-2 py-2 text-left align-top" data-trip-header-filter-root="true">
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
                            onChange={(e) => updateFilter('type', e.target.value)}
                            className="w-full rounded-md border px-2 py-2 text-sm"
                          >
                            <option value="all">All</option>
                            <option value="Groupage">Groupage</option>
                            <option value="Regular">Regular</option>
                          </select>
                        </div>
                      ) : null}
                    </div>
                  </th>
                  <th className="px-2 py-2 text-left align-top" data-trip-header-filter-root="true">
                    <div className="relative">
                      <HeaderFilterButton
                        label="Driver"
                        active={activeHeaderFilter === 'driver'}
                        onClick={() =>
                          setActiveHeaderFilter((prev) => (prev === 'driver' ? null : 'driver'))
                        }
                      />
                      {activeHeaderFilter === 'driver' ? (
                        <div className="absolute left-0 top-full z-20 mt-2 w-44 rounded-xl border bg-white p-2 shadow-lg">
                          <input
                            value={filters.driver}
                            onChange={(e) => updateFilter('driver', e.target.value)}
                            placeholder="Driver"
                            className="w-full rounded-md border px-2 py-2 text-sm"
                          />
                        </div>
                      ) : null}
                    </div>
                  </th>
                  <th className="px-2 py-2 text-left align-top" data-trip-header-filter-root="true">
                    <div className="relative">
                      <HeaderFilterButton
                        label="Truck / Trailer"
                        active={activeHeaderFilter === 'truck_trailer'}
                        onClick={() =>
                          setActiveHeaderFilter((prev) =>
                            prev === 'truck_trailer' ? null : 'truck_trailer'
                          )
                        }
                      />
                      {activeHeaderFilter === 'truck_trailer' ? (
                        <div className="absolute left-0 top-full z-20 mt-2 w-48 rounded-xl border bg-white p-2 shadow-lg">
                          <input
                            value={filters.truckTrailer}
                            onChange={(e) => updateFilter('truckTrailer', e.target.value)}
                            placeholder="Truck or trailer"
                            className="w-full rounded-md border px-2 py-2 text-sm"
                          />
                        </div>
                      ) : null}
                    </div>
                  </th>
                  <th className="px-2 py-2 text-left align-top" data-trip-header-filter-root="true">
                    <div className="relative">
                      <HeaderFilterButton
                        label="Price"
                        active={activeHeaderFilter === 'price'}
                        onClick={() =>
                          setActiveHeaderFilter((prev) => (prev === 'price' ? null : 'price'))
                        }
                      />
                      {activeHeaderFilter === 'price' ? (
                        <div className="absolute left-0 top-full z-20 mt-2 w-40 rounded-xl border bg-white p-2 shadow-lg">
                          <input
                            value={filters.price}
                            onChange={(e) => updateFilter('price', e.target.value)}
                            placeholder="Price"
                            className="w-full rounded-md border px-2 py-2 text-sm"
                          />
                        </div>
                      ) : null}
                    </div>
                  </th>
                  <th className="px-2 py-2 text-left align-top" data-trip-header-filter-root="true">
                    <div className="relative">
                      <HeaderFilterButton
                        label="Linked"
                        active={activeHeaderFilter === 'linked'}
                        onClick={() =>
                          setActiveHeaderFilter((prev) => (prev === 'linked' ? null : 'linked'))
                        }
                      />
                      {activeHeaderFilter === 'linked' ? (
                        <div className="absolute left-0 top-full z-20 mt-2 w-48 rounded-xl border bg-white p-2 shadow-lg">
                          <input
                            value={filters.linked}
                            onChange={(e) => updateFilter('linked', e.target.value)}
                            placeholder="Linked manager"
                            className="w-full rounded-md border px-2 py-2 text-sm"
                          />
                        </div>
                      ) : null}
                    </div>
                  </th>
                  <th className="px-2 py-2 text-left align-top" data-trip-header-filter-root="true">
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
                {filteredTrips.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                      No trips found
                    </td>
                  </tr>
                ) : (
                  paginatedTrips.map((trip) => (
                    <tr
                      key={trip.id}
                      onClick={() => router.push(`/app/trips/${trip.id}`)}
                      className="cursor-pointer border-b hover:bg-slate-50"
                    >
                      <td className="px-2 py-2">
                        <span
                          className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${getStatusBadgeClass(
                            trip.status
                          )}`}
                        >
                          {formatStatusLabel(trip.status)}
                        </span>
                      </td>
                      <td className="px-2 py-2 font-medium">{trip.trip_number}</td>
                      <td className="px-2 py-2">{formatShortCompanyName(trip.carrier?.name)}</td>
                      <td className="px-2 py-2">{trip.display_type}</td>
                      <td className="px-2 py-2">{trip.driver_name || '-'}</td>
                      <td className="px-2 py-2">
                        {[trip.truck_plate, trip.trailer_plate].filter(Boolean).join(' / ') || '-'}
                      </td>
                      <td className="px-2 py-2">
                        {trip.can_view_financials &&
                        trip.price !== null &&
                        trip.price !== undefined
                          ? `${trip.price} EUR`
                          : <span className="text-slate-400">-</span>}
                      </td>
                      <td className="px-2 py-2">{trip.linked_manager?.name || '-'}</td>
                      <td className="px-2 py-2">
                        <div className="whitespace-nowrap">
                          <div>{trip.created_at ? new Date(trip.created_at).toLocaleDateString() : '-'}</div>
                          <div className="text-xs text-slate-500">
                            {formatPerson(trip.created_by_user)}
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
        <div className="flex flex-wrap justify-center items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Rows per page</span>
            <select
              value={filters.rowsPerPage}
              onChange={(e) =>
                updateFilter('rowsPerPage', Number(e.target.value) as 20 | 50 | 100)
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
