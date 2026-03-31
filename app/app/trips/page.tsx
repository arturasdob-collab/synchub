'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';

type TripRow = {
  id: string;
  trip_number: string;
  status: 'unconfirmed' | 'confirmed' | 'completed';
  truck_plate: string | null;
  trailer_plate: string | null;
  driver_name: string | null;
  price: number | null;
  payment_term_days: number | null;
  payment_type: string | null;
  vat_rate: string | null;
  is_groupage: boolean;
  created_at: string;
  carrier: {
    name: string | null;
    company_code: string | null;
  } | null;
  created_by_user: {
    first_name: string | null;
    last_name: string | null;
  } | null;
};

export default function TripsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createdByFilter, setCreatedByFilter] = useState('');
  const [selectedCreatedBy, setSelectedCreatedBy] = useState('');
  const [tripTypeFilter, setTripTypeFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [createdFrom, setCreatedFrom] = useState('');
const [createdTo, setCreatedTo] = useState('');

  useEffect(() => {
    fetchTrips();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, createdByFilter, selectedCreatedBy, tripTypeFilter, rowsPerPage, createdFrom, createdTo]);

  const fetchTrips = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('trips')
        .select(`
          id,
          trip_number,
          status,
          truck_plate,
          trailer_plate,
          driver_name,
          price,
          payment_term_days,
          payment_type,
          vat_rate,
          is_groupage,
          created_at,
          carrier:carrier_company_id (
            name,
            company_code
          ),
          created_by_user:created_by (
            first_name,
            last_name
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('FETCH TRIPS ERROR:', error);
        toast.error('Failed to load trips');
        setTrips([]);
        return;
      }

      const normalized: TripRow[] = (data || []).map((item: any) => {
        const carrier = Array.isArray(item.carrier)
          ? item.carrier[0] ?? null
          : item.carrier;

        const createdByUser = Array.isArray(item.created_by_user)
          ? item.created_by_user[0] ?? null
          : item.created_by_user;

        return {
          id: item.id,
          trip_number: item.trip_number,
          status: item.status,
          truck_plate: item.truck_plate ?? null,
          trailer_plate: item.trailer_plate ?? null,
          driver_name: item.driver_name ?? null,
          price: item.price ?? null,
          payment_term_days: item.payment_term_days ?? null,
          payment_type: item.payment_type ?? null,
          vat_rate: item.vat_rate ?? null,
          is_groupage: !!item.is_groupage,
          created_at: item.created_at,
          carrier: carrier
            ? {
                name: carrier.name ?? null,
                company_code: carrier.company_code ?? null,
              }
            : null,
          created_by_user: createdByUser
            ? {
                first_name: createdByUser.first_name ?? null,
                last_name: createdByUser.last_name ?? null,
              }
            : null,
        };
      });

      setTrips(normalized);
    } catch (error) {
      console.error('FETCH TRIPS UNEXPECTED ERROR:', error);
      toast.error('Failed to load trips');
      setTrips([]);
    } finally {
      setLoading(false);
    }
  };

  const createdByOptions = useMemo(() => {
    const uniqueMap = new Map<string, string>();

    trips.forEach((trip) => {
      const firstName = trip.created_by_user?.first_name || '';
      const lastName = trip.created_by_user?.last_name || '';
      const fullName = `${firstName} ${lastName}`.trim();

      if (fullName) {
        uniqueMap.set(fullName, fullName);
      }
    });

    return Array.from(uniqueMap.values()).sort((a, b) => a.localeCompare(b));
  }, [trips]);

  const filteredCreatedByOptions = useMemo(() => {
    const q = createdByFilter.trim().toLowerCase();

    if (!q) return createdByOptions.slice(0, 20);

    return createdByOptions
      .filter((name) => name.toLowerCase().includes(q))
      .slice(0, 20);
  }, [createdByOptions, createdByFilter]);

  const filteredTrips = useMemo(() => {
    const q = search.trim().toLowerCase();

    return trips.filter((trip) => {
      const matchesStatus =
        statusFilter === 'all' ? true : trip.status === statusFilter;

      const matchesTripType =
        tripTypeFilter === 'all'
          ? true
          : tripTypeFilter === 'groupage'
            ? trip.is_groupage
            : !trip.is_groupage;

      const createdByNameRaw =
        `${trip.created_by_user?.first_name || ''} ${trip.created_by_user?.last_name || ''}`.trim();
      const createdByName = createdByNameRaw.toLowerCase();

      const createdByQuery = createdByFilter.trim().toLowerCase();
      const selectedCreatedByQuery = selectedCreatedBy.trim().toLowerCase();

      const matchesCreatedBy = selectedCreatedByQuery
        ? createdByName === selectedCreatedByQuery
        : !createdByQuery || createdByName.includes(createdByQuery);

        const tripCreatedDate = trip.created_at ? new Date(trip.created_at) : null;

const matchesCreatedFrom =
  !createdFrom ||
  (tripCreatedDate &&
    tripCreatedDate >= new Date(`${createdFrom}T00:00:00`));

const matchesCreatedTo =
  !createdTo ||
  (tripCreatedDate &&
    tripCreatedDate <= new Date(`${createdTo}T23:59:59`));

      const searchableText = [
        trip.trip_number || '',
        trip.driver_name || '',
        trip.truck_plate || '',
        trip.trailer_plate || '',
        trip.carrier?.name || '',
        trip.carrier?.company_code || '',
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch = !q || searchableText.includes(q);

      return (
        matchesStatus &&
        matchesTripType &&
        matchesCreatedBy &&
        matchesCreatedFrom &&
        matchesCreatedTo &&
        matchesSearch
      );
    });
  }, [trips, search, statusFilter, createdByFilter, selectedCreatedBy, tripTypeFilter, createdFrom, createdTo]);

  const totalPages = Math.max(1, Math.ceil(filteredTrips.length / rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedTrips = filteredTrips.slice(
    (safeCurrentPage - 1) * rowsPerPage,
    safeCurrentPage * rowsPerPage
  );

  const getStatusLabel = (status: TripRow['status']) => {
    if (status === 'unconfirmed') return 'Unconfirmed';
    if (status === 'confirmed') return 'Confirmed';
    if (status === 'completed') return 'Completed';
    return status;
  };

  const getStatusBadgeClass = (status: TripRow['status']) => {
    if (status === 'unconfirmed') {
      return 'bg-yellow-100 text-yellow-800';
    }
    if (status === 'confirmed') {
      return 'bg-blue-100 text-blue-800';
    }
    return 'bg-green-100 text-green-800';
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Trips</h1>

        <button
          onClick={() => router.push('/app/trips/new')}
          className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
        >
          <Plus size={16} />
          Add Trip
        </button>
      </div>

      <div className="rounded-2xl border bg-white p-4">
      <div className="grid grid-cols-1 md:grid-cols-7 gap-4 items-start">
          <input
            placeholder="Search by trip number, carrier, driver, plate..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border rounded-md px-3 py-2"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full border rounded-md px-3 py-2"
          >
            <option value="all">All statuses</option>
            <option value="unconfirmed">Unconfirmed</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
          </select>

          <div className="relative">
            <input
              placeholder="Search by creator..."
              value={createdByFilter}
              onChange={(e) => {
                setCreatedByFilter(e.target.value);
                setSelectedCreatedBy('');
              }}
              className="w-full border rounded-md px-3 py-2"
            />

{createdByFilter.trim() !== '' && selectedCreatedBy !== createdByFilter && (
              <div className="absolute left-0 right-0 top-full mt-1 z-20 border rounded-md bg-white max-h-56 overflow-y-auto shadow-lg">
                {filteredCreatedByOptions.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-slate-500">No creators found</div>
                ) : (
                  filteredCreatedByOptions.map((name) => (
<button
  key={name}
  type="button"
  onMouseDown={(e) => e.preventDefault()}
  onClick={() => {
    setCreatedByFilter(name);
    setSelectedCreatedBy(name);
  }}
  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b last:border-b-0"
>
  {name}
</button>
                  ))
                )}
              </div>
            )}
          </div>

          <select
            value={tripTypeFilter}
            onChange={(e) => setTripTypeFilter(e.target.value)}
            className="w-full border rounded-md px-3 py-2"
          >
            <option value="all">All types</option>
            <option value="groupage">Groupage</option>
            <option value="regular">Regular</option>
          </select>

          <input
      type="date"
      value={createdFrom}
      onChange={(e) => setCreatedFrom(e.target.value)}
      className="w-full border rounded-md px-3 py-2"
      title="Created from"
    />

    <input
      type="date"
      value={createdTo}
      onChange={(e) => setCreatedTo(e.target.value)}
      className="w-full border rounded-md px-3 py-2"
      title="Created to"
    />

<button
  type="button"
  onClick={() => {
    setSearch('');
    setStatusFilter('all');
    setCreatedByFilter('');
    setSelectedCreatedBy('');
    setTripTypeFilter('all');
    setCreatedFrom('');
    setCreatedTo('');
    setRowsPerPage(20);
    setCurrentPage(1);
  }}
  className="w-full border rounded-md px-3 py-2 text-sm hover:bg-slate-50"
>
  Reset filters
</button>

        </div>
      </div>

      <div className="rounded-2xl border bg-white overflow-hidden">
        {loading ? (
          <div className="p-10 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : filteredTrips.length === 0 ? (
          <div className="p-10 text-center text-slate-500">No trips found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Trip No.</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                  <th className="text-left px-4 py-3 font-semibold">Carrier</th>
                  <th className="text-left px-4 py-3 font-semibold">Driver</th>
                  <th className="text-left px-4 py-3 font-semibold">Truck / Trailer</th>
                  <th className="text-left px-4 py-3 font-semibold">Price</th>
                  <th className="text-left px-4 py-3 font-semibold">Payment term</th>
                  <th className="text-left px-4 py-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTrips.map((trip) => (
                  <tr
                    key={trip.id}
                    onClick={() => router.push(`/app/trips/${trip.id}`)}
                    className="border-b hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="px-4 py-3 font-medium">{trip.trip_number}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${getStatusBadgeClass(
                          trip.status
                        )}`}
                      >
                        {getStatusLabel(trip.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {trip.carrier?.name || '-'}
                      {trip.carrier?.company_code ? ` (${trip.carrier.company_code})` : ''}
                    </td>
                    <td className="px-4 py-3">{trip.driver_name || '-'}</td>
                    <td className="px-4 py-3">
                      {[trip.truck_plate, trip.trailer_plate].filter(Boolean).join(' / ') || '-'}
                    </td>
                    <td className="px-4 py-3">
                      {trip.price !== null && trip.price !== undefined ? `${trip.price} €` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {trip.payment_term_days !== null && trip.payment_term_days !== undefined
                        ? `${trip.payment_term_days} d.`
                        : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <div>
                          {trip.created_at ? new Date(trip.created_at).toLocaleString() : '-'}
                        </div>
                        <div className="text-xs text-slate-500">
                          {trip.created_by_user?.first_name || trip.created_by_user?.last_name
                            ? `${trip.created_by_user?.first_name || ''} ${trip.created_by_user?.last_name || ''}`.trim()
                            : '-'}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="pt-4">
        <div className="flex justify-center items-center gap-8">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Rows per page</span>
            <select
              value={rowsPerPage}
              onChange={(e) => setRowsPerPage(Number(e.target.value))}
              className="border rounded-md px-3 py-2 text-sm"
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <button
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={safeCurrentPage === 1}
            className="border rounded-md px-6 py-2 text-sm disabled:opacity-50"
          >
            Prev
          </button>

          <span className="text-sm text-slate-700">Page {safeCurrentPage}</span>

          <button
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={safeCurrentPage === totalPages}
            className="border rounded-md px-6 py-2 text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}