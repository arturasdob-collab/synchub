'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type WorkflowStandaloneRow = {
  row_type: 'order_row' | 'trip_row';
  id: string;
  order_id: string | null;
  trip_id: string | null;
  status: string | null;
  prep_date: string | null;
  delivery_date: string | null;
  record_number: string;
  kind: string;
  company_display: string;
  contact_display: string;
  shipper_name: string;
  loading_display: string;
  loading_extra: string;
  loading_customs_display: string;
  consignee_name: string;
  unloading_display: string;
  unloading_extra: string;
  unloading_customs_display: string;
  cargo_display: string;
  cargo_kg: number | null;
  cargo_ldm: number | null;
  revenue_value: number | null;
  revenue_display: string | null;
  cost_value: number | null;
  cost_display: string | null;
  profit_value: number | null;
  profit_display: string | null;
  trip_display: string;
  trip_status: string | null;
  vehicle_display: string;
  open_order_id: string | null;
  open_trip_id: string | null;
};

type WorkflowGroupFooter = {
  id: string;
  kg_value: number | null;
  ldm_value: number | null;
  revenue_value: number | null;
  revenue_display: string | null;
  cost_value: number | null;
  cost_display: string | null;
  profit_value: number | null;
  profit_display: string | null;
};

type WorkflowGroup = {
  id: string;
  trip_id: string;
  trip_number: string;
  trip_status: string | null;
  carrier_display: string;
  responsible_display: string;
  vehicle_display: string;
  cost_value: number | null;
  cost_display: string | null;
  rows: WorkflowStandaloneRow[];
  footer: WorkflowGroupFooter;
};

type WorkflowResponse = {
  viewer_user_id: string;
  viewer_is_elevated: boolean;
  current_organization_id: string | null;
  effective_organization_id: string | null;
  effective_manager_user_id: string | null;
  manager_name: string;
  groupage_groups: WorkflowGroup[];
  standalone_rows: WorkflowStandaloneRow[];
};

type OrganizationOption = {
  id: string;
  name: string;
};

type ManagerOption = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

function formatStatusLabel(value: string | null | undefined) {
  if (!value) return '-';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatMoneyCell(value: string | null | undefined) {
  return value || '-';
}

function formatNumberCell(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }

  return `${value}`;
}

function formatManagerLabel(manager: ManagerOption | null | undefined) {
  if (!manager) return '-';

  const value = `${manager.first_name || ''} ${manager.last_name || ''}`.trim();
  return value || '-';
}

function removeCompanyCode(value: string | null | undefined) {
  if (!value) return '-';

  return value.replace(/\s*\([^)]*\)\s*$/, '').trim() || value;
}

function buildLocationCell(display: string, extra: string) {
  return [display, extra]
    .filter((value) => value && value !== '-')
    .join(' / ') || '-';
}

function CompactCell({
  value,
  scrollable = false,
}: {
  value: string | null | undefined;
  scrollable?: boolean;
}) {
  const content = value && value.trim() !== '' ? value : '-';

  if (scrollable) {
    return (
      <div
        className="workflow-scrollbar flex h-6 items-center overflow-x-auto overflow-y-hidden whitespace-nowrap rounded-md border bg-slate-50 px-2 leading-none"
        title={content}
      >
        {content}
      </div>
    );
  }

  return (
    <div className="flex h-6 items-center truncate leading-none" title={content}>
      {content}
    </div>
  );
}

function buildStandaloneSearchText(row: WorkflowStandaloneRow) {
  return [
    row.record_number,
    row.kind,
    row.status,
    row.company_display,
    row.contact_display,
    row.shipper_name,
    row.loading_display,
    row.loading_extra,
    row.loading_customs_display,
    row.consignee_name,
    row.unloading_display,
    row.unloading_extra,
    row.unloading_customs_display,
    row.cargo_display,
    row.trip_display,
    row.trip_status,
    row.vehicle_display,
    row.revenue_display,
    row.cost_display,
    row.profit_display,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function buildGroupSearchText(group: WorkflowGroup) {
  return [
    group.trip_number,
    group.trip_status,
    group.carrier_display,
    group.responsible_display,
    group.vehicle_display,
    group.cost_display,
    ...group.rows.map(buildStandaloneSearchText),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function WorkflowTableHeader() {
  return (
    <thead className="border-b bg-slate-50">
      <tr>
        <th className="w-[82px] px-2 py-2 text-left font-semibold text-slate-700">Status</th>
        <th className="w-[82px] px-2 py-2 text-left font-semibold text-slate-700">Prep</th>
        <th className="w-[82px] px-2 py-2 text-left font-semibold text-slate-700">Delivery</th>
        <th className="w-[110px] px-2 py-2 text-left font-semibold text-slate-700">No. / Trip</th>
        <th className="w-[82px] px-2 py-2 text-left font-semibold text-slate-700">Kind</th>
        <th className="w-[180px] px-2 py-2 text-left font-semibold text-slate-700">Company</th>
        <th className="w-[180px] px-2 py-2 text-left font-semibold text-slate-700">Contact</th>
        <th className="w-[150px] px-2 py-2 text-left font-semibold text-slate-700">Sender</th>
        <th className="w-[250px] px-2 py-2 text-left font-semibold text-slate-700">Loading</th>
        <th className="w-[190px] px-2 py-2 text-left font-semibold text-slate-700">Loading customs</th>
        <th className="w-[150px] px-2 py-2 text-left font-semibold text-slate-700">Receiver</th>
        <th className="w-[250px] px-2 py-2 text-left font-semibold text-slate-700">Unloading</th>
        <th className="w-[190px] px-2 py-2 text-left font-semibold text-slate-700">Unloading customs</th>
        <th className="w-[260px] px-2 py-2 text-left font-semibold text-slate-700">Cargo</th>
        <th className="w-[70px] px-2 py-2 text-left font-semibold text-slate-700">KG</th>
        <th className="w-[70px] px-2 py-2 text-left font-semibold text-slate-700">LDM</th>
        <th className="w-[95px] px-2 py-2 text-left font-semibold text-slate-700">Revenue</th>
        <th className="w-[95px] px-2 py-2 text-left font-semibold text-slate-700">Cost</th>
        <th className="w-[95px] px-2 py-2 text-left font-semibold text-slate-700">Profit</th>
        <th className="w-[260px] px-2 py-2 text-left font-semibold text-slate-700">Trip / Vehicle</th>
        <th className="w-[100px] px-2 py-2 text-left font-semibold text-slate-700">Open</th>
      </tr>
    </thead>
  );
}

function WorkflowRowActions({
  orderId,
  tripId,
  onOpenOrder,
  onOpenTrip,
}: {
  orderId: string | null;
  tripId: string | null;
  onOpenOrder: (orderId: string) => void;
  onOpenTrip: (tripId: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {orderId ? (
        <button
          type="button"
          onClick={() => onOpenOrder(orderId)}
          className="rounded-md border px-1.5 py-0.5 text-[10px] hover:bg-white"
        >
          Order
        </button>
      ) : null}
      {tripId ? (
        <button
          type="button"
          onClick={() => onOpenTrip(tripId)}
          className="rounded-md border px-1.5 py-0.5 text-[10px] hover:bg-white"
        >
          Trip
        </button>
      ) : null}
    </div>
  );
}

function WorkflowStandaloneRowView({
  row,
  onOpenOrder,
  onOpenTrip,
}: {
  row: WorkflowStandaloneRow;
  onOpenOrder: (orderId: string) => void;
  onOpenTrip: (tripId: string) => void;
}) {
  return (
    <tr className="border-b hover:bg-slate-50">
      <td className="px-2 py-1.5 whitespace-nowrap">
        <CompactCell value={formatStatusLabel(row.status)} />
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap">
        <CompactCell value={row.prep_date || '-'} />
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap">
        <CompactCell value={row.delivery_date || '-'} />
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap font-medium text-slate-900">
        <CompactCell value={row.record_number} />
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap">
        <CompactCell value={row.kind} />
      </td>
      <td className="px-2 py-1.5">
        <CompactCell value={removeCompanyCode(row.company_display)} scrollable />
      </td>
      <td className="px-2 py-1.5">
        <CompactCell value={row.contact_display} scrollable />
      </td>
      <td className="px-2 py-1.5">
        <CompactCell value={row.shipper_name} scrollable />
      </td>
      <td className="px-2 py-1.5">
        <CompactCell
          value={buildLocationCell(row.loading_display, row.loading_extra)}
          scrollable
        />
      </td>
      <td className="px-2 py-1.5">
        <CompactCell value={row.loading_customs_display} scrollable />
      </td>
      <td className="px-2 py-1.5">
        <CompactCell value={row.consignee_name} scrollable />
      </td>
      <td className="px-2 py-1.5">
        <CompactCell
          value={buildLocationCell(row.unloading_display, row.unloading_extra)}
          scrollable
        />
      </td>
      <td className="px-2 py-1.5">
        <CompactCell value={row.unloading_customs_display} scrollable />
      </td>
      <td className="px-2 py-1.5">
        <CompactCell
          value={row.cargo_display}
          scrollable
        />
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap">
        <CompactCell value={formatNumberCell(row.cargo_kg)} />
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap">
        <CompactCell value={formatNumberCell(row.cargo_ldm)} />
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap">
        <CompactCell value={formatMoneyCell(row.revenue_display)} />
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap">
        <CompactCell value={formatMoneyCell(row.cost_display)} />
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap">
        <CompactCell value={formatMoneyCell(row.profit_display)} />
      </td>
      <td className="px-2 py-1.5">
        <CompactCell
          value={
            [row.trip_display, row.trip_status ? formatStatusLabel(row.trip_status) : '', row.vehicle_display]
              .filter((value) => value && value !== '-')
              .join(' / ') || '-'
          }
          scrollable
        />
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap">
        <WorkflowRowActions
          orderId={row.open_order_id}
          tripId={row.open_trip_id}
          onOpenOrder={onOpenOrder}
          onOpenTrip={onOpenTrip}
        />
      </td>
    </tr>
  );
}

function GroupageBlock({
  group,
  onOpenOrder,
  onOpenTrip,
}: {
  group: WorkflowGroup;
  onOpenOrder: (orderId: string) => void;
  onOpenTrip: (tripId: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="min-w-[2200px] w-full table-fixed text-[11px] leading-tight">
        <WorkflowTableHeader />
        <tbody>
          <tr className="border-b-2 border-amber-300 bg-amber-100/70">
            <td className="px-2 py-1 whitespace-nowrap">
              <CompactCell value={formatStatusLabel(group.trip_status)} />
            </td>
            <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>
            <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>
            <td className="px-2 py-1 whitespace-nowrap font-semibold text-slate-900">
              <CompactCell value={group.trip_number} />
            </td>
            <td className="px-2 py-1 whitespace-nowrap font-medium text-amber-900">
              <CompactCell value="Groupage start" />
            </td>
            <td className="px-2 py-1">
              <CompactCell value={removeCompanyCode(group.carrier_display)} scrollable />
            </td>
            <td className="px-2 py-1">
              <CompactCell value={group.responsible_display} scrollable />
            </td>
              <td className="px-2 py-1"><CompactCell value="-" /></td>
              <td className="px-2 py-1"><CompactCell value="-" /></td>
              <td className="px-2 py-1"><CompactCell value="-" /></td>
              <td className="px-2 py-1"><CompactCell value="-" /></td>
              <td className="px-2 py-1"><CompactCell value="-" /></td>
              <td className="px-2 py-1"><CompactCell value="-" /></td>
              <td className="px-2 py-1 whitespace-nowrap">
                <CompactCell value={`${group.rows.length} orders`} />
              </td>
            <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>
            <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>
            <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>
            <td className="px-2 py-1 whitespace-nowrap">
              <CompactCell value={formatMoneyCell(group.cost_display)} />
            </td>
            <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>
            <td className="px-2 py-1">
              <CompactCell value={group.vehicle_display} scrollable />
            </td>
            <td className="px-2 py-1 whitespace-nowrap">
              <WorkflowRowActions
                orderId={null}
                tripId={group.trip_id}
                onOpenOrder={onOpenOrder}
                onOpenTrip={onOpenTrip}
              />
            </td>
          </tr>

          {group.rows.map((row) => (
            <WorkflowStandaloneRowView
              key={row.id}
              row={row}
              onOpenOrder={onOpenOrder}
              onOpenTrip={onOpenTrip}
            />
          ))}

          <tr className="border-t-2 border-amber-300 bg-amber-100/70 font-medium">
            <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>
            <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>
            <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>
            <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="Summary" /></td>
            <td className="px-2 py-1 whitespace-nowrap text-amber-900"><CompactCell value="Groupage end" /></td>
            <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>
            <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>
            <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>
            <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>
            <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>
            <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>
            <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>
            <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>
            <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>
            <td className="px-2 py-1 whitespace-nowrap">
              <CompactCell value={formatNumberCell(group.footer.kg_value)} />
            </td>
            <td className="px-2 py-1 whitespace-nowrap">
              <CompactCell value={formatNumberCell(group.footer.ldm_value)} />
            </td>
            <td className="px-2 py-1 whitespace-nowrap">
              <CompactCell value={formatMoneyCell(group.footer.revenue_display)} />
            </td>
            <td className="px-2 py-1 whitespace-nowrap">
              <CompactCell value={formatMoneyCell(group.footer.cost_display)} />
            </td>
            <td className="px-2 py-1 whitespace-nowrap">
              <CompactCell value={formatMoneyCell(group.footer.profit_display)} />
            </td>
            <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>
            <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function WorkflowPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [viewerUserId, setViewerUserId] = useState('');
  const [viewerIsElevated, setViewerIsElevated] = useState(false);
  const [currentOrganizationId, setCurrentOrganizationId] = useState('');
  const [groupageGroups, setGroupageGroups] = useState<WorkflowGroup[]>([]);
  const [standaloneRows, setStandaloneRows] = useState<WorkflowStandaloneRow[]>([]);
  const [search, setSearch] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [selectedManagerUserId, setSelectedManagerUserId] = useState('');
  const [loadingOrganizations, setLoadingOrganizations] = useState(false);
  const [loadingManagers, setLoadingManagers] = useState(false);

  useEffect(() => {
    void fetchWorkflow();
  }, []);

  useEffect(() => {
    if (!viewerUserId) {
      return;
    }

    try {
      const saved = window.localStorage.getItem(
        `synchub.workflow.search.${viewerUserId}`
      );
      setSearch(saved || '');
    } catch (error) {
      console.error('Failed to hydrate workflow search:', error);
      setSearch('');
    } finally {
      setHydrated(true);
    }
  }, [viewerUserId]);

  useEffect(() => {
    if (!viewerUserId || !hydrated) {
      return;
    }

    window.localStorage.setItem(`synchub.workflow.search.${viewerUserId}`, search);
  }, [hydrated, search, viewerUserId]);

  useEffect(() => {
    if (!viewerIsElevated) {
      return;
    }

    void fetchOrganizations();
  }, [viewerIsElevated]);

  useEffect(() => {
    if (!viewerIsElevated || !selectedOrganizationId) {
      setManagers([]);
      setSelectedManagerUserId('');
      return;
    }

    void fetchManagers(selectedOrganizationId);
  }, [selectedOrganizationId, viewerIsElevated]);

  useEffect(() => {
    if (!viewerIsElevated) {
      return;
    }

    if (!selectedOrganizationId) {
      return;
    }

    void fetchWorkflow(selectedOrganizationId, selectedManagerUserId);
  }, [selectedManagerUserId, selectedOrganizationId, viewerIsElevated]);

  const fetchWorkflow = async (
    organizationId?: string,
    managerUserId?: string
  ) => {
    try {
      setLoading(true);

      const params = new URLSearchParams();

      if (organizationId) {
        params.set('organizationId', organizationId);
      }

      if (managerUserId) {
        params.set('managerUserId', managerUserId);
      }

      const res = await fetch(
        params.toString() ? `/api/workflow/list?${params.toString()}` : '/api/workflow/list',
        {
          method: 'GET',
        }
      );

      const data = (await res.json()) as WorkflowResponse & { error?: string };

      if (!res.ok) {
        toast.error(data.error || 'Failed to load workflow');
        setGroupageGroups([]);
        setStandaloneRows([]);
        return;
      }

      setViewerUserId(data.viewer_user_id || '');
      setViewerIsElevated(!!data.viewer_is_elevated);
      setCurrentOrganizationId(data.current_organization_id || '');
      setGroupageGroups(data.groupage_groups || []);
      setStandaloneRows(data.standalone_rows || []);

      if (data.viewer_is_elevated) {
        setSelectedOrganizationId((prev) => prev || data.current_organization_id || '');
      }
    } catch (error) {
      toast.error('Failed to load workflow');
      setGroupageGroups([]);
      setStandaloneRows([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrganizations = async () => {
    try {
      setLoadingOrganizations(true);

      const res = await fetch('/api/organizations/share-targets', {
        method: 'GET',
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to load organizations');
        setOrganizations([]);
        return;
      }

      setOrganizations(
        (data.organizations || []).map((organization: any) => ({
          id: organization.id,
          name: organization.name,
        }))
      );
    } catch (error) {
      toast.error('Failed to load organizations');
      setOrganizations([]);
    } finally {
      setLoadingOrganizations(false);
    }
  };

  const fetchManagers = async (organizationId: string) => {
    try {
      setLoadingManagers(true);

      const res = await fetch(
        `/api/organization/managers?organizationId=${encodeURIComponent(organizationId)}`,
        {
          method: 'GET',
        }
      );

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to load managers');
        setManagers([]);
        setSelectedManagerUserId('');
        return;
      }

      const nextManagers = (data.managers || []) as ManagerOption[];
      setManagers(nextManagers);
      setSelectedManagerUserId((prev) =>
        nextManagers.some((manager) => manager.id === prev) ? prev : ''
      );
    } catch (error) {
      toast.error('Failed to load managers');
      setManagers([]);
      setSelectedManagerUserId('');
    } finally {
      setLoadingManagers(false);
    }
  };

  const filteredData = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return {
        groups: groupageGroups,
        rows: standaloneRows,
      };
    }

    const groups = groupageGroups
      .map((group) => {
        const groupMatches = buildGroupSearchText(group).includes(query);

        if (groupMatches) {
          return group;
        }

        const matchingRows = group.rows.filter((row) =>
          buildStandaloneSearchText(row).includes(query)
        );

        return matchingRows.length > 0
          ? {
              ...group,
              rows: matchingRows,
            }
          : null;
      })
      .filter(Boolean) as WorkflowGroup[];

    const rows = standaloneRows.filter((row) =>
      buildStandaloneSearchText(row).includes(query)
    );

    return { groups, rows };
  }, [groupageGroups, search, standaloneRows]);

  const resetFilters = () => {
    setSearch('');

    if (viewerIsElevated) {
      setSelectedOrganizationId(currentOrganizationId || '');
      setSelectedManagerUserId('');
    }
  };

  const showSelectManagerState = viewerIsElevated && !selectedManagerUserId;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <style jsx global>{`
        .workflow-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 transparent;
        }

        .workflow-scrollbar::-webkit-scrollbar {
          height: 4px;
          width: 4px;
        }

        .workflow-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }

        .workflow-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 9999px;
        }

        .workflow-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
      <div className="text-center">
        <h1 className="text-3xl font-bold">Workflow</h1>
      </div>

      <div className="rounded-2xl border bg-white p-4 space-y-3">
        {viewerIsElevated ? (
          <div className="flex flex-col items-center justify-center gap-3 xl:flex-row">
            <select
              value={selectedOrganizationId}
              onChange={(e) => setSelectedOrganizationId(e.target.value)}
              className="w-full max-w-xs rounded-md border px-3 py-2"
              disabled={loadingOrganizations}
            >
              <option value="">Select organization</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>

            <select
              value={selectedManagerUserId}
              onChange={(e) => setSelectedManagerUserId(e.target.value)}
              className="w-full max-w-xs rounded-md border px-3 py-2"
              disabled={!selectedOrganizationId || loadingManagers}
            >
              <option value="">
                {loadingManagers ? 'Loading managers...' : 'Select manager'}
              </option>
              {managers.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {formatManagerLabel(manager)}
                </option>
              ))}
            </select>

            <input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 md:flex-row">
            <input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
        )}
      </div>

      <div className="space-y-4">
        {loading && !hydrated ? (
          <div className="rounded-2xl border bg-white p-10 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : showSelectManagerState ? (
          <div className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">
            Select organization and manager to view workflow.
          </div>
        ) : filteredData.groups.length === 0 && filteredData.rows.length === 0 ? (
          <div className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">
            No workflow items found.
          </div>
        ) : (
          <>
            {filteredData.groups.map((group) => (
              <GroupageBlock
                key={group.id}
                group={group}
                onOpenOrder={(orderId) => router.push(`/app/orders/${orderId}`)}
                onOpenTrip={(tripId) => router.push(`/app/trips/${tripId}`)}
              />
            ))}

            {filteredData.rows.length > 0 ? (
              <div className="overflow-x-auto rounded-2xl border bg-white">
                <table className="min-w-[2200px] w-full table-fixed text-[11px] leading-tight">
                  <WorkflowTableHeader />
                  <tbody>
                    {filteredData.rows.map((row) => (
                      <WorkflowStandaloneRowView
                        key={row.id}
                        row={row}
                        onOpenOrder={(orderId) => router.push(`/app/orders/${orderId}`)}
                        onOpenTrip={(tripId) => router.push(`/app/trips/${tripId}`)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
