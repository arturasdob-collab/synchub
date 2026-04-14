'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';

const orderStatusOptions = [
  'unconfirmed',
  'confirmed',
  'active',
  'completed',
] as const;

type OrderRow = {
  id: string;
  internal_order_number: string;
  client_order_number: string;
  status: (typeof orderStatusOptions)[number];
  loading_date: string | null;
  unloading_date: string | null;
  price: number | null;
  currency: 'EUR' | 'PLN' | 'USD';
  created_at: string;
  load_type: 'LTL' | 'FTL' | null;
  display_load_type: 'Groupage' | 'LTL' | 'FTL' | null;
  client: {
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

type OrdersFilters = {
  search: string;
  status: string;
  internalOrder: string;
  client: string;
  clientOrder: string;
  cargo: string;
  price: string;
  loadingFrom: string;
  loadingTo: string;
  unloadingFrom: string;
  unloadingTo: string;
  linked: string;
  createdBy: string;
  createdFrom: string;
  createdTo: string;
  rowsPerPage: number;
};

type HeaderFilterId =
  | 'status'
  | 'order'
  | 'client'
  | 'client_order'
  | 'cargo'
  | 'price'
  | 'loading'
  | 'unloading'
  | 'linked'
  | 'created';

const DEFAULT_FILTERS: OrdersFilters = {
  search: '',
  status: 'all',
  internalOrder: '',
  client: '',
  clientOrder: '',
  cargo: 'all',
  price: '',
  loadingFrom: '',
  loadingTo: '',
  unloadingFrom: '',
  unloadingTo: '',
  linked: '',
  createdBy: '',
  createdFrom: '',
  createdTo: '',
  rowsPerPage: 20,
};

function formatStatusLabel(status: string) {
  if (!status) return '-';

  return status.charAt(0).toUpperCase() + status.slice(1);
}

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

function getStatusBadgeClass(status: string) {
  if (status === 'unconfirmed') {
    return 'bg-yellow-100 text-yellow-800';
  }

  if (status === 'confirmed') {
    return 'bg-blue-100 text-blue-800';
  }

  if (status === 'active') {
    return 'bg-indigo-100 text-indigo-800';
  }

  if (status === 'completed') {
    return 'bg-green-100 text-green-800';
  }

  return 'bg-slate-100 text-slate-800';
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

export default function OrdersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [viewerUserId, setViewerUserId] = useState('');
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const [filters, setFilters] = useState<OrdersFilters>(DEFAULT_FILTERS);
  const [activeHeaderFilter, setActiveHeaderFilter] =
    useState<HeaderFilterId | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    void fetchOrders();
  }, []);

  useEffect(() => {
    if (!viewerUserId) {
      return;
    }

    try {
      const saved = window.localStorage.getItem(
        `synchub.orders.filters.${viewerUserId}`
      );

      if (!saved) {
        setFiltersHydrated(true);
        return;
      }

      const parsed = JSON.parse(saved) as Partial<OrdersFilters>;

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
      console.error('Failed to hydrate order filters:', error);
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
      `synchub.orders.filters.${viewerUserId}`,
      JSON.stringify(filters)
    );
  }, [filters, filtersHydrated, viewerUserId]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;

      if (!target?.closest('[data-order-header-filter-root="true"]')) {
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

  const fetchOrders = async () => {
    try {
      setLoading(true);

      const res = await fetch('/api/orders/list', {
        method: 'GET',
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to load orders');
        setOrders([]);
        return;
      }

      setOrders(data.orders || []);
      setViewerUserId(data.viewer_user_id || '');
    } catch (error) {
      console.error('FETCH ORDERS ERROR:', error);
      toast.error('Failed to load orders');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = useMemo(() => {
    const globalSearch = filters.search.trim().toLowerCase();

    return orders.filter((order) => {
      const createdBy = formatPerson(order.created_by_user);
      const linkedManager = order.linked_manager?.name || '';
      const priceText =
        order.can_view_financials &&
        order.price !== null &&
        order.price !== undefined
          ? `${order.price} ${order.currency}`
          : '';
      const searchableText = [
        formatStatusLabel(order.status),
        order.internal_order_number,
        order.client?.name || '',
        order.client?.company_code || '',
        order.client_order_number || '',
        order.display_load_type || '',
        priceText,
        order.loading_date || '',
        order.unloading_date || '',
        linkedManager,
        createdBy,
        order.created_at ? new Date(order.created_at).toLocaleString() : '',
      ]
        .join(' ')
        .toLowerCase();

      const matchesGlobalSearch =
        !globalSearch || searchableText.includes(globalSearch);

      const matchesStatus =
        filters.status === 'all' ? true : order.status === filters.status;

      const matchesInternalOrder = matchesText(
        order.internal_order_number,
        filters.internalOrder
      );

      const matchesClient =
        matchesText(order.client?.name, filters.client) ||
        matchesText(order.client?.company_code, filters.client);
      const matchesClientOrder = matchesText(
        order.client_order_number,
        filters.clientOrder
      );

      const matchesCargo =
        filters.cargo === 'all'
          ? true
          : (order.display_load_type || '').toLowerCase() === filters.cargo.toLowerCase();

      const matchesPrice = matchesText(priceText, filters.price);

      const loadingDate = order.loading_date ? `${order.loading_date}T00:00:00` : null;
      const unloadingDate = order.unloading_date
        ? `${order.unloading_date}T00:00:00`
        : null;
      const createdDate = order.created_at ? new Date(order.created_at) : null;

      const matchesLoadingFrom =
        !filters.loadingFrom ||
        (loadingDate &&
          new Date(loadingDate) >= new Date(`${filters.loadingFrom}T00:00:00`));
      const matchesLoadingTo =
        !filters.loadingTo ||
        (loadingDate &&
          new Date(loadingDate) <= new Date(`${filters.loadingTo}T23:59:59`));

      const matchesUnloadingFrom =
        !filters.unloadingFrom ||
        (unloadingDate &&
          new Date(unloadingDate) >= new Date(`${filters.unloadingFrom}T00:00:00`));
      const matchesUnloadingTo =
        !filters.unloadingTo ||
        (unloadingDate &&
          new Date(unloadingDate) <= new Date(`${filters.unloadingTo}T23:59:59`));

      const matchesLinked = matchesText(linkedManager, filters.linked);
      const matchesCreatedBy = matchesText(createdBy, filters.createdBy);

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
        matchesInternalOrder &&
        matchesClient &&
        matchesClientOrder &&
        matchesCargo &&
        matchesPrice &&
        matchesLoadingFrom &&
        matchesLoadingTo &&
        matchesUnloadingFrom &&
        matchesUnloadingTo &&
        matchesLinked &&
        matchesCreatedBy &&
        matchesCreatedFrom &&
        matchesCreatedTo
      );
    });
  }, [filters, orders]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / filters.rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedOrders = filteredOrders.slice(
    (safeCurrentPage - 1) * filters.rowsPerPage,
    safeCurrentPage * filters.rowsPerPage
  );

  const updateFilter = <K extends keyof OrdersFilters>(
    key: K,
    value: OrdersFilters[K]
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
          <h1 className="text-3xl font-bold">Orders</h1>
        </div>

        <button
          onClick={() => router.push('/app/orders/new')}
          className="justify-self-end inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
        >
          <Plus size={16} />
          Add Order
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
                  <th className="px-2 py-2 text-left align-top" data-order-header-filter-root="true">
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
                            {orderStatusOptions.map((status) => (
                              <option key={status} value={status}>
                                {formatStatusLabel(status)}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}
                    </div>
                  </th>
                  <th className="px-2 py-2 text-left align-top" data-order-header-filter-root="true">
                    <div className="relative">
                      <HeaderFilterButton
                        label="Order"
                        active={activeHeaderFilter === 'order'}
                        onClick={() =>
                          setActiveHeaderFilter((prev) => (prev === 'order' ? null : 'order'))
                        }
                      />
                      {activeHeaderFilter === 'order' ? (
                        <div className="absolute left-0 top-full z-20 mt-2 w-48 rounded-xl border bg-white p-2 shadow-lg">
                          <input
                            value={filters.internalOrder}
                            onChange={(e) => updateFilter('internalOrder', e.target.value)}
                            placeholder="Internal order no."
                            className="w-full rounded-md border px-2 py-2 text-sm"
                          />
                        </div>
                      ) : null}
                    </div>
                  </th>
                  <th className="px-2 py-2 text-left align-top" data-order-header-filter-root="true">
                    <div className="relative">
                      <HeaderFilterButton
                        label="Client"
                        active={activeHeaderFilter === 'client'}
                        onClick={() =>
                          setActiveHeaderFilter((prev) => (prev === 'client' ? null : 'client'))
                        }
                      />
                      {activeHeaderFilter === 'client' ? (
                        <div className="absolute left-0 top-full z-20 mt-2 w-52 rounded-xl border bg-white p-2 shadow-lg">
                          <input
                            value={filters.client}
                            onChange={(e) => updateFilter('client', e.target.value)}
                            placeholder="Name or code"
                            className="w-full rounded-md border px-2 py-2 text-sm"
                          />
                        </div>
                      ) : null}
                    </div>
                  </th>
                  <th className="px-2 py-2 text-left align-top" data-order-header-filter-root="true">
                    <div className="relative">
                      <HeaderFilterButton
                        label="Client Order No."
                        active={activeHeaderFilter === 'client_order'}
                        onClick={() =>
                          setActiveHeaderFilter((prev) =>
                            prev === 'client_order' ? null : 'client_order'
                          )
                        }
                      />
                      {activeHeaderFilter === 'client_order' ? (
                        <div className="absolute left-0 top-full z-20 mt-2 w-48 rounded-xl border bg-white p-2 shadow-lg">
                          <input
                            value={filters.clientOrder}
                            onChange={(e) => updateFilter('clientOrder', e.target.value)}
                            placeholder="Client order no."
                            className="w-full rounded-md border px-2 py-2 text-sm"
                          />
                        </div>
                      ) : null}
                    </div>
                  </th>
                  <th className="px-2 py-2 text-left align-top" data-order-header-filter-root="true">
                    <div className="relative">
                      <HeaderFilterButton
                        label="Cargo"
                        active={activeHeaderFilter === 'cargo'}
                        onClick={() =>
                          setActiveHeaderFilter((prev) => (prev === 'cargo' ? null : 'cargo'))
                        }
                      />
                      {activeHeaderFilter === 'cargo' ? (
                        <div className="absolute left-0 top-full z-20 mt-2 w-40 rounded-xl border bg-white p-2 shadow-lg">
                          <select
                            value={filters.cargo}
                            onChange={(e) => updateFilter('cargo', e.target.value)}
                            className="w-full rounded-md border px-2 py-2 text-sm"
                          >
                            <option value="all">All</option>
                            <option value="Groupage">Groupage</option>
                            <option value="LTL">LTL</option>
                            <option value="FTL">FTL</option>
                          </select>
                        </div>
                      ) : null}
                    </div>
                  </th>
                  <th className="px-2 py-2 text-left align-top" data-order-header-filter-root="true">
                    <div className="relative">
                      <HeaderFilterButton
                        label="Price"
                        active={activeHeaderFilter === 'price'}
                        onClick={() =>
                          setActiveHeaderFilter((prev) => (prev === 'price' ? null : 'price'))
                        }
                      />
                      {activeHeaderFilter === 'price' ? (
                        <div className="absolute left-0 top-full z-20 mt-2 w-44 rounded-xl border bg-white p-2 shadow-lg">
                          <input
                            value={filters.price}
                            onChange={(e) => updateFilter('price', e.target.value)}
                            placeholder="Price or currency"
                            className="w-full rounded-md border px-2 py-2 text-sm"
                          />
                        </div>
                      ) : null}
                    </div>
                  </th>
                  <th className="px-2 py-2 text-left align-top" data-order-header-filter-root="true">
                    <div className="relative">
                      <HeaderFilterButton
                        label="Loading"
                        active={activeHeaderFilter === 'loading'}
                        onClick={() =>
                          setActiveHeaderFilter((prev) => (prev === 'loading' ? null : 'loading'))
                        }
                      />
                      {activeHeaderFilter === 'loading' ? (
                        <div className="absolute left-0 top-full z-20 mt-2 w-48 rounded-xl border bg-white p-2 shadow-lg space-y-2">
                          <input
                            type="date"
                            value={filters.loadingFrom}
                            onChange={(e) => updateFilter('loadingFrom', e.target.value)}
                            className="w-full rounded-md border px-2 py-2 text-sm"
                          />
                          <input
                            type="date"
                            value={filters.loadingTo}
                            onChange={(e) => updateFilter('loadingTo', e.target.value)}
                            className="w-full rounded-md border px-2 py-2 text-sm"
                          />
                        </div>
                      ) : null}
                    </div>
                  </th>
                  <th className="px-2 py-2 text-left align-top" data-order-header-filter-root="true">
                    <div className="relative">
                      <HeaderFilterButton
                        label="Unloading"
                        active={activeHeaderFilter === 'unloading'}
                        onClick={() =>
                          setActiveHeaderFilter((prev) =>
                            prev === 'unloading' ? null : 'unloading'
                          )
                        }
                      />
                      {activeHeaderFilter === 'unloading' ? (
                        <div className="absolute left-0 top-full z-20 mt-2 w-48 rounded-xl border bg-white p-2 shadow-lg space-y-2">
                          <input
                            type="date"
                            value={filters.unloadingFrom}
                            onChange={(e) => updateFilter('unloadingFrom', e.target.value)}
                            className="w-full rounded-md border px-2 py-2 text-sm"
                          />
                          <input
                            type="date"
                            value={filters.unloadingTo}
                            onChange={(e) => updateFilter('unloadingTo', e.target.value)}
                            className="w-full rounded-md border px-2 py-2 text-sm"
                          />
                        </div>
                      ) : null}
                    </div>
                  </th>
                  <th className="px-2 py-2 text-left align-top" data-order-header-filter-root="true">
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
                  <th className="px-2 py-2 text-left align-top" data-order-header-filter-root="true">
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
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-slate-500">
                      No orders found
                    </td>
                  </tr>
                ) : (
                  paginatedOrders.map((order) => (
                    <tr
                      key={order.id}
                      onClick={() => router.push(`/app/orders/${order.id}`)}
                      className="cursor-pointer border-b hover:bg-slate-50"
                    >
                      <td className="px-2 py-2">
                        <span
                          className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${getStatusBadgeClass(
                            order.status
                          )}`}
                        >
                          {formatStatusLabel(order.status)}
                        </span>
                      </td>
                      <td className="px-2 py-2 font-medium">{order.internal_order_number}</td>
                      <td className="px-2 py-2">{formatShortCompanyName(order.client?.name)}</td>
                      <td className="px-2 py-2">{order.client_order_number || '-'}</td>
                      <td className="px-2 py-2">{order.display_load_type || '-'}</td>
                      <td className="px-2 py-2">
                        {order.can_view_financials &&
                        order.price !== null &&
                        order.price !== undefined
                          ? `${order.price} ${order.currency}`
                          : <span className="text-slate-400">-</span>}
                      </td>
                      <td className="px-2 py-2">{order.loading_date || '-'}</td>
                      <td className="px-2 py-2">{order.unloading_date || '-'}</td>
                      <td className="px-2 py-2">{order.linked_manager?.name || '-'}</td>
                      <td className="px-2 py-2">
                        <div className="whitespace-nowrap">
                          <div>{order.created_at ? new Date(order.created_at).toLocaleDateString() : '-'}</div>
                          <div className="text-xs text-slate-500">
                            {formatPerson(order.created_by_user)}
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
              onChange={(e) => updateFilter('rowsPerPage', Number(e.target.value) as 20 | 50 | 100)}
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
