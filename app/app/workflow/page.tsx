'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  WORKFLOW_EXECUTION_STATUSES,
  WORKFLOW_EXECUTION_STATUS_LABELS,
  type WorkflowEditableFieldKey,
  type WorkflowExecutionStatus,
} from '@/lib/constants/workflow-fields';

type WorkflowFieldState = {
  update_id: string;
  record_type: 'order' | 'trip';
  record_id: string;
  field_key: WorkflowEditableFieldKey;
  value_text: string | null;
  revision: number;
  pending_ack: boolean;
  acknowledged: boolean;
  updated_by_current_user: boolean;
  has_override: boolean;
};

type WorkflowFieldStateMap = Partial<
  Record<WorkflowEditableFieldKey, WorkflowFieldState>
>;

type WorkflowStandaloneRow = {
  row_type: 'order_row' | 'trip_row';
  id: string;
  order_id: string | null;
  trip_id: string | null;
  status: string | null;
  prep_date: string | null;
  delivery_date: string | null;
  record_number: string;
  client_order_number?: string | null;
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
  kg_display: string | null;
  cargo_ldm: number | null;
  ldm_display: string | null;
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
  field_states: WorkflowFieldStateMap;
  trip_editable_by_current_user?: boolean;
};

type WorkflowGroupFooter = {
  id: string;
  kg_value: number | null;
  kg_display: string | null;
  ldm_value: number | null;
  ldm_display: string | null;
  revenue_value: number | null;
  revenue_display: string | null;
  cost_value: number | null;
  cost_display: string | null;
  profit_value: number | null;
  profit_display: string | null;
  field_states: WorkflowFieldStateMap;
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
  field_states: WorkflowFieldStateMap;
  rows: WorkflowStandaloneRow[];
  footer: WorkflowGroupFooter;
  trip_editable_by_current_user?: boolean;
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

type WorkflowFieldUpdateResponse = {
  id: string;
  record_type: 'order' | 'trip';
  record_id: string;
  field_key: WorkflowEditableFieldKey;
  value_text: string | null;
  revision: number;
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

type WorkflowEditingCell = {
  row_id: string;
  record_type: 'order' | 'trip';
  record_id: string;
  field_key: WorkflowEditableFieldKey;
};

type WorkflowFilters = {
  search: string;
  status: string;
  prepFrom: string;
  prepTo: string;
  deliveryFrom: string;
  deliveryTo: string;
  recordNumber: string;
  kind: string;
  company: string;
  contact: string;
  sender: string;
  loading: string;
  loadingCustoms: string;
  receiver: string;
  unloading: string;
  unloadingCustoms: string;
  cargo: string;
  kg: string;
  ldm: string;
  revenue: string;
  cost: string;
  profit: string;
  tripVehicle: string;
};

type WorkflowHeaderFilterId =
  | 'status'
  | 'prep'
  | 'delivery'
  | 'record_number'
  | 'kind'
  | 'company'
  | 'contact'
  | 'sender'
  | 'loading'
  | 'loading_customs'
  | 'receiver'
  | 'unloading'
  | 'unloading_customs'
  | 'cargo'
  | 'kg'
  | 'ldm'
  | 'revenue'
  | 'cost'
  | 'profit'
  | 'trip_vehicle';

type WorkflowColumnId = WorkflowHeaderFilterId;

type WorkflowColumnWidths = Record<WorkflowColumnId, number>;

const DEFAULT_FILTERS: WorkflowFilters = {
  search: '',
  status: 'all',
  prepFrom: '',
  prepTo: '',
  deliveryFrom: '',
  deliveryTo: '',
  recordNumber: '',
  kind: '',
  company: '',
  contact: '',
  sender: '',
  loading: '',
  loadingCustoms: '',
  receiver: '',
  unloading: '',
  unloadingCustoms: '',
  cargo: '',
  kg: '',
  ldm: '',
  revenue: '',
  cost: '',
  profit: '',
  tripVehicle: '',
};

const WORKFLOW_STATUS_OPTIONS = WORKFLOW_EXECUTION_STATUSES.map((status) => ({
  value: status,
  label: WORKFLOW_EXECUTION_STATUS_LABELS[status],
}));

const WORKFLOW_COLUMN_CONFIG = [
  { id: 'status', defaultWidth: 84, minWidth: 70 },
  { id: 'prep', defaultWidth: 88, minWidth: 74 },
  { id: 'delivery', defaultWidth: 92, minWidth: 78 },
  { id: 'record_number', defaultWidth: 170, minWidth: 130 },
  { id: 'kind', defaultWidth: 96, minWidth: 84 },
  { id: 'company', defaultWidth: 170, minWidth: 130 },
  { id: 'contact', defaultWidth: 170, minWidth: 130 },
  { id: 'sender', defaultWidth: 150, minWidth: 120 },
  { id: 'loading', defaultWidth: 220, minWidth: 160 },
  { id: 'loading_customs', defaultWidth: 140, minWidth: 110 },
  { id: 'receiver', defaultWidth: 150, minWidth: 120 },
  { id: 'unloading', defaultWidth: 220, minWidth: 160 },
  { id: 'unloading_customs', defaultWidth: 140, minWidth: 110 },
  { id: 'cargo', defaultWidth: 170, minWidth: 130 },
  { id: 'kg', defaultWidth: 82, minWidth: 70 },
  { id: 'ldm', defaultWidth: 82, minWidth: 70 },
  { id: 'revenue', defaultWidth: 94, minWidth: 80 },
  { id: 'cost', defaultWidth: 94, minWidth: 80 },
  { id: 'profit', defaultWidth: 94, minWidth: 80 },
  { id: 'trip_vehicle', defaultWidth: 230, minWidth: 160 },
] as const satisfies ReadonlyArray<{
  id: WorkflowColumnId;
  defaultWidth: number;
  minWidth: number;
}>;

const DEFAULT_WORKFLOW_COLUMN_WIDTHS = WORKFLOW_COLUMN_CONFIG.reduce(
  (acc, column) => {
    acc[column.id] = column.defaultWidth;
    return acc;
  },
  {} as WorkflowColumnWidths
);

const WORKFLOW_COLUMN_MIN_WIDTHS = WORKFLOW_COLUMN_CONFIG.reduce(
  (acc, column) => {
    acc[column.id] = column.minWidth;
    return acc;
  },
  {} as WorkflowColumnWidths
);

function formatStatusLabel(value: string | null | undefined) {
  if (!value) return '-';

  return (
    WORKFLOW_EXECUTION_STATUS_LABELS[
      value as WorkflowExecutionStatus
    ] ||
    value.charAt(0).toUpperCase() + value.slice(1)
  );
}

function formatMoneyCell(value: string | null | undefined) {
  return value || '-';
}

function parseWorkflowNumericValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(',', '.');
  const match = normalized.match(/-?\d+(?:\.\d+)?/);

  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
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
  pendingAck = false,
  canAcknowledge = false,
  onAcknowledge,
}: {
  value: string | null | undefined;
  scrollable?: boolean;
  pendingAck?: boolean;
  canAcknowledge?: boolean;
  onAcknowledge?: (() => void) | null;
}) {
  const content = value && value.trim() !== '' ? value : '-';
  const cellClasses = pendingAck
    ? 'border-slate-900 bg-slate-800 text-white'
    : 'border bg-slate-50 text-slate-900';

  if (scrollable) {
    return (
      <div className="relative">
        <div
          className={`workflow-scrollbar flex h-6 items-center overflow-x-auto overflow-y-hidden whitespace-nowrap rounded-md px-2 leading-none ${cellClasses} ${canAcknowledge ? 'pr-6' : ''}`}
          title={content}
        >
          {content}
        </div>
        {canAcknowledge && onAcknowledge ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onAcknowledge();
            }}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-emerald-500 p-0.5 text-white shadow-sm hover:bg-emerald-600"
            aria-label="Acknowledge field update"
            title="Acknowledge field update"
          >
            <Check className="h-2.5 w-2.5" />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        className={`flex h-6 items-center truncate rounded-md px-2 leading-none ${pendingAck ? 'bg-slate-800 text-white' : 'text-slate-900'} ${canAcknowledge ? 'pr-6' : ''}`}
        title={content}
      >
        {content}
      </div>
      {canAcknowledge && onAcknowledge ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onAcknowledge();
          }}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-emerald-500 p-0.5 text-white shadow-sm hover:bg-emerald-600"
          aria-label="Acknowledge field update"
          title="Acknowledge field update"
        >
          <Check className="h-2.5 w-2.5" />
        </button>
      ) : null}
    </div>
  );
}

function buildStandaloneSearchText(row: WorkflowStandaloneRow) {
  return [
    row.record_number,
    row.client_order_number,
    row.kind,
    row.status,
    formatStatusLabel(row.status),
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
    formatStatusLabel(row.trip_status),
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
    formatStatusLabel(group.trip_status),
    group.carrier_display,
    group.responsible_display,
    group.vehicle_display,
    group.cost_display,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function buildRecordNumberDisplay(row: WorkflowStandaloneRow) {
  const values =
    row.row_type === 'order_row'
      ? [row.record_number, row.client_order_number]
      : [row.record_number];

  const normalized = values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value, index, array) => value !== '' && array.indexOf(value) === index);

  return normalized.length > 0 ? normalized.join(' / ') : '-';
}

function buildPendingFieldState(
  fieldUpdate: WorkflowFieldUpdateResponse
): WorkflowFieldState {
  return {
    update_id: fieldUpdate.id,
    record_type: fieldUpdate.record_type,
    record_id: fieldUpdate.record_id,
    field_key: fieldUpdate.field_key,
    value_text: fieldUpdate.value_text,
    revision: fieldUpdate.revision,
    pending_ack: false,
    acknowledged: true,
    updated_by_current_user: true,
    has_override: true,
  };
}

function applyFieldUpdateToStandaloneRow(
  row: WorkflowStandaloneRow,
  fieldUpdate: WorkflowFieldUpdateResponse,
  fieldState: WorkflowFieldState
) {
  const matchesRecord =
    (fieldUpdate.record_type === 'order' && row.order_id === fieldUpdate.record_id) ||
    (fieldUpdate.record_type === 'trip' && row.trip_id === fieldUpdate.record_id);

  if (!matchesRecord) {
    return row;
  }

  const nextRow: WorkflowStandaloneRow = {
    ...row,
    field_states: {
      ...row.field_states,
      [fieldUpdate.field_key]: fieldState,
    },
  };

  switch (fieldUpdate.field_key) {
    case 'status': {
      if (fieldUpdate.record_type === 'order') {
        nextRow.status = fieldUpdate.value_text || nextRow.status || 'active';
      } else {
        nextRow.trip_status = fieldUpdate.value_text || nextRow.trip_status || 'active';
        if (nextRow.row_type === 'trip_row') {
          nextRow.status = fieldUpdate.value_text || nextRow.status || 'active';
        }
      }
      break;
    }
    case 'contact': {
      if (fieldUpdate.record_type === 'order') {
        nextRow.contact_display = fieldUpdate.value_text || '-';
      } else if (nextRow.row_type === 'trip_row') {
        nextRow.contact_display = fieldUpdate.value_text || '-';
      }
      break;
    }
    case 'sender': {
      nextRow.shipper_name = fieldUpdate.value_text || '-';
      break;
    }
    case 'loading': {
      nextRow.loading_display = fieldUpdate.value_text || '-';
      nextRow.loading_extra = '';
      break;
    }
    case 'loading_customs': {
      nextRow.loading_customs_display = fieldUpdate.value_text || '-';
      break;
    }
    case 'receiver': {
      nextRow.consignee_name = fieldUpdate.value_text || '-';
      break;
    }
    case 'unloading': {
      nextRow.unloading_display = fieldUpdate.value_text || '-';
      nextRow.unloading_extra = '';
      break;
    }
    case 'unloading_customs': {
      nextRow.unloading_customs_display = fieldUpdate.value_text || '-';
      break;
    }
    case 'cargo': {
      nextRow.cargo_display = fieldUpdate.value_text || '-';
      break;
    }
    case 'kg': {
      nextRow.kg_display = fieldUpdate.value_text || '-';
      nextRow.cargo_kg = parseWorkflowNumericValue(fieldUpdate.value_text);
      break;
    }
    case 'ldm': {
      nextRow.ldm_display = fieldUpdate.value_text || '-';
      nextRow.cargo_ldm = parseWorkflowNumericValue(fieldUpdate.value_text);
      break;
    }
    case 'revenue': {
      nextRow.revenue_display = fieldUpdate.value_text || '-';
      nextRow.revenue_value = parseWorkflowNumericValue(fieldUpdate.value_text);
      break;
    }
    case 'cost': {
      nextRow.cost_display = fieldUpdate.value_text || '-';
      nextRow.cost_value = parseWorkflowNumericValue(fieldUpdate.value_text);
      break;
    }
    case 'profit': {
      nextRow.profit_display = fieldUpdate.value_text || '-';
      nextRow.profit_value = parseWorkflowNumericValue(fieldUpdate.value_text);
      break;
    }
    case 'trip_vehicle': {
      nextRow.vehicle_display = fieldUpdate.value_text || '-';
      break;
    }
  }

  return nextRow;
}

function recalculateGroupFooter(group: WorkflowGroup): WorkflowGroupFooter {
  const kgValue = group.rows.reduce(
    (sum, row) => sum + (parseWorkflowNumericValue(row.kg_display) ?? 0),
    0
  );
  const ldmValue = group.rows.reduce(
    (sum, row) => sum + (parseWorkflowNumericValue(row.ldm_display) ?? 0),
    0
  );
  const revenueValue = group.rows.reduce(
    (sum, row) => sum + (parseWorkflowNumericValue(row.revenue_display) ?? 0),
    0
  );
  const costValue =
    group.footer.field_states.cost?.value_text !== undefined
      ? parseWorkflowNumericValue(group.footer.field_states.cost.value_text)
      : group.cost_value;
  const profitStateValue =
    group.footer.field_states.profit?.value_text !== undefined
      ? parseWorkflowNumericValue(group.footer.field_states.profit.value_text)
      : null;
  const derivedProfitValue =
    revenueValue !== null && costValue !== null ? revenueValue - costValue : null;

  return {
    ...group.footer,
    kg_value: kgValue,
    kg_display: formatNumberCell(kgValue),
    ldm_value: ldmValue,
    ldm_display: formatNumberCell(ldmValue),
    revenue_value: revenueValue,
    revenue_display: formatMoneyCell(revenueValue !== null ? `${revenueValue} EUR` : null),
    cost_value: costValue,
    cost_display: formatMoneyCell(costValue !== null ? `${costValue} EUR` : group.footer.cost_display),
    profit_value: profitStateValue ?? derivedProfitValue,
    profit_display: formatMoneyCell(
      profitStateValue !== null
        ? `${profitStateValue} EUR`
        : derivedProfitValue !== null
          ? `${derivedProfitValue} EUR`
          : group.footer.profit_display
    ),
  };
}

function applyFieldUpdateToGroup(
  group: WorkflowGroup,
  fieldUpdate: WorkflowFieldUpdateResponse,
  fieldState: WorkflowFieldState
) {
  let nextGroup: WorkflowGroup = {
    ...group,
    rows: group.rows.map((row) => applyFieldUpdateToStandaloneRow(row, fieldUpdate, fieldState)),
    footer: {
      ...group.footer,
      field_states: { ...group.footer.field_states },
    },
    field_states: { ...group.field_states },
  };

  if (fieldUpdate.record_type === 'trip' && group.trip_id === fieldUpdate.record_id) {
    nextGroup.field_states[fieldUpdate.field_key] = fieldState;

    switch (fieldUpdate.field_key) {
      case 'status':
        nextGroup.trip_status = fieldUpdate.value_text || nextGroup.trip_status || 'active';
        break;
      case 'contact':
        nextGroup.responsible_display = fieldUpdate.value_text || '-';
        break;
      case 'cost':
        nextGroup.cost_display = fieldUpdate.value_text || '-';
        nextGroup.cost_value = parseWorkflowNumericValue(fieldUpdate.value_text);
        nextGroup.footer.field_states.cost = fieldState;
        break;
      case 'profit':
        nextGroup.footer.field_states.profit = fieldState;
        break;
      case 'trip_vehicle':
        nextGroup.vehicle_display = fieldUpdate.value_text || '-';
        break;
    }
  }

  nextGroup = {
    ...nextGroup,
    footer: recalculateGroupFooter(nextGroup),
  };

  return nextGroup;
}

function matchesText(value: string | null | undefined, query: string) {
  if (!query.trim()) {
    return true;
  }

  return (value || '').toLowerCase().includes(query.trim().toLowerCase());
}

function matchesDateRange(
  value: string | null | undefined,
  from: string,
  to: string
) {
  if (!from && !to) {
    return true;
  }

  if (!value) {
    return false;
  }

  const date = new Date(`${value}T00:00:00`);

  if (from && date < new Date(`${from}T00:00:00`)) {
    return false;
  }

  if (to && date > new Date(`${to}T23:59:59`)) {
    return false;
  }

  return true;
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
      className={`inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-left text-[10px] font-semibold ${
        active ? 'bg-slate-200 text-slate-900' : 'text-slate-700 hover:bg-slate-100'
      }`}
    >
      {label}
    </button>
  );
}

function WorkflowColGroup({
  columnWidths,
}: {
  columnWidths: WorkflowColumnWidths;
}) {
  return (
    <colgroup>
      {WORKFLOW_COLUMN_CONFIG.map((column) => (
        <col
          key={column.id}
          style={{ width: `${columnWidths[column.id] ?? column.defaultWidth}px` }}
        />
      ))}
    </colgroup>
  );
}

function WorkflowHeaderCell({
  columnId,
  children,
  onStartResize,
  onResetColumnWidth,
}: {
  columnId: WorkflowColumnId;
  children: ReactNode;
  onStartResize: (columnId: WorkflowColumnId, clientX: number) => void;
  onResetColumnWidth: (columnId: WorkflowColumnId) => void;
}) {
  return (
    <th
      className="relative px-1 py-1.5 text-left align-top"
      data-workflow-header-filter-root="true"
    >
      <div className="pr-3">{children}</div>
      <button
        type="button"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onStartResize(columnId, event.clientX);
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onResetColumnWidth(columnId);
        }}
        className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none border-r border-slate-200/70 bg-transparent transition hover:border-sky-300 hover:bg-sky-100/40"
        aria-label={`Resize ${columnId} column`}
        title="Drag to resize, double click to reset"
      />
    </th>
  );
}

function WorkflowTableHeader({
  filters,
  headerScope,
  activeHeaderFilter,
  activeHeaderScope,
  setActiveHeaderFilter,
  setActiveHeaderScope,
  updateFilter,
  onStartResize,
  onResetColumnWidth,
}: {
  filters: WorkflowFilters;
  headerScope: string;
  activeHeaderFilter: WorkflowHeaderFilterId | null;
  activeHeaderScope: string | null;
  setActiveHeaderFilter: (value: WorkflowHeaderFilterId | null) => void;
  setActiveHeaderScope: (value: string | null) => void;
  updateFilter: <K extends keyof WorkflowFilters>(key: K, value: WorkflowFilters[K]) => void;
  onStartResize: (columnId: WorkflowColumnId, clientX: number) => void;
  onResetColumnWidth: (columnId: WorkflowColumnId) => void;
}) {
  const toggleFilter = (filterId: WorkflowHeaderFilterId) => {
    const isSameFilter =
      activeHeaderFilter === filterId && activeHeaderScope === headerScope;

    setActiveHeaderFilter(isSameFilter ? null : filterId);
    setActiveHeaderScope(isSameFilter ? null : headerScope);
  };

  const isFilterActive = (filterId: WorkflowHeaderFilterId) =>
    activeHeaderFilter === filterId && activeHeaderScope === headerScope;

  const renderTextFilter = (
    filterId: WorkflowHeaderFilterId,
    label: string,
    filterKey: keyof WorkflowFilters,
    widthClass = 'w-40',
    placeholder = 'Filter value'
  ) => (
    <WorkflowHeaderCell
      columnId={filterId}
      onStartResize={onStartResize}
      onResetColumnWidth={onResetColumnWidth}
    >
      <div className="relative">
        <HeaderFilterButton
          label={label}
          active={isFilterActive(filterId)}
          onClick={() => toggleFilter(filterId)}
        />
        {isFilterActive(filterId) ? (
          <div
            className={`absolute left-0 top-full z-20 mt-1 ${widthClass} rounded-xl border bg-white p-2 shadow-lg`}
          >
            <input
              value={filters[filterKey] as string}
              onChange={(event) =>
                updateFilter(filterKey, event.target.value as WorkflowFilters[typeof filterKey])
              }
              placeholder={placeholder}
              className="w-full rounded-md border px-2 py-2 text-sm"
            />
          </div>
        ) : null}
      </div>
    </WorkflowHeaderCell>
  );

  return (
    <thead className="border-b bg-slate-50">
      <tr>
        <WorkflowHeaderCell
          columnId="status"
          onStartResize={onStartResize}
          onResetColumnWidth={onResetColumnWidth}
        >
          <div className="relative">
            <HeaderFilterButton
              label="Status"
              active={isFilterActive('status')}
              onClick={() => toggleFilter('status')}
            />
            {isFilterActive('status') ? (
              <div className="absolute left-0 top-full z-20 mt-1 w-40 rounded-xl border bg-white p-2 shadow-lg">
                <select
                  value={filters.status}
                  onChange={(event) => updateFilter('status', event.target.value)}
                  className="w-full rounded-md border px-2 py-2 text-sm"
                >
                  <option value="all">All statuses</option>
                  {WORKFLOW_EXECUTION_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {WORKFLOW_EXECUTION_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        </WorkflowHeaderCell>
        <WorkflowHeaderCell
          columnId="prep"
          onStartResize={onStartResize}
          onResetColumnWidth={onResetColumnWidth}
        >
          <div className="relative">
            <HeaderFilterButton
              label="Prep"
              active={isFilterActive('prep')}
              onClick={() => toggleFilter('prep')}
            />
            {isFilterActive('prep') ? (
              <div className="absolute left-0 top-full z-20 mt-1 w-40 rounded-xl border bg-white p-2 shadow-lg space-y-2">
                <input
                  type="date"
                  value={filters.prepFrom}
                  onChange={(event) => updateFilter('prepFrom', event.target.value)}
                  className="w-full rounded-md border px-2 py-2 text-sm"
                />
                <input
                  type="date"
                  value={filters.prepTo}
                  onChange={(event) => updateFilter('prepTo', event.target.value)}
                  className="w-full rounded-md border px-2 py-2 text-sm"
                />
              </div>
            ) : null}
          </div>
        </WorkflowHeaderCell>
        <WorkflowHeaderCell
          columnId="delivery"
          onStartResize={onStartResize}
          onResetColumnWidth={onResetColumnWidth}
        >
          <div className="relative">
            <HeaderFilterButton
              label="Delivery"
              active={isFilterActive('delivery')}
              onClick={() => toggleFilter('delivery')}
            />
            {isFilterActive('delivery') ? (
              <div className="absolute left-0 top-full z-20 mt-1 w-40 rounded-xl border bg-white p-2 shadow-lg space-y-2">
                <input
                  type="date"
                  value={filters.deliveryFrom}
                  onChange={(event) => updateFilter('deliveryFrom', event.target.value)}
                  className="w-full rounded-md border px-2 py-2 text-sm"
                />
                <input
                  type="date"
                  value={filters.deliveryTo}
                  onChange={(event) => updateFilter('deliveryTo', event.target.value)}
                  className="w-full rounded-md border px-2 py-2 text-sm"
                />
              </div>
            ) : null}
          </div>
        </WorkflowHeaderCell>
        {renderTextFilter('record_number', 'No. / Trip', 'recordNumber', 'w-44', 'Order, client or trip no.')}
        {renderTextFilter('kind', 'Kind', 'kind', 'w-32', 'Kind')}
        {renderTextFilter('company', 'Company', 'company', 'w-40', 'Company')}
        {renderTextFilter('contact', 'Contact', 'contact', 'w-40', 'Contact')}
        {renderTextFilter('sender', 'Sender', 'sender', 'w-36', 'Sender')}
        {renderTextFilter('loading', 'Loading', 'loading', 'w-44', 'Loading')}
        {renderTextFilter('loading_customs', 'Loading customs', 'loadingCustoms', 'w-44', 'Loading customs')}
        {renderTextFilter('receiver', 'Receiver', 'receiver', 'w-36', 'Receiver')}
        {renderTextFilter('unloading', 'Unloading', 'unloading', 'w-44', 'Unloading')}
        {renderTextFilter('unloading_customs', 'Unloading customs', 'unloadingCustoms', 'w-44', 'Unloading customs')}
        {renderTextFilter('cargo', 'Cargo', 'cargo', 'w-44', 'Cargo')}
        {renderTextFilter('kg', 'KG', 'kg', 'w-32', 'KG')}
        {renderTextFilter('ldm', 'LDM', 'ldm', 'w-32', 'LDM')}
        {renderTextFilter('revenue', 'Revenue', 'revenue', 'w-36', 'Revenue')}
        {renderTextFilter('cost', 'Cost', 'cost', 'w-36', 'Cost')}
        {renderTextFilter('profit', 'Profit', 'profit', 'w-36', 'Profit')}
        {renderTextFilter('trip_vehicle', 'Trip / Vehicle', 'tripVehicle', 'w-44', 'Trip / Vehicle')}
      </tr>
    </thead>
  );
}

function WorkflowDisplayCell({
  value,
  scrollable = false,
  state,
  onAcknowledge,
  editable = false,
  onStartEdit,
  isEditing = false,
  editingValue = '',
  onChangeEditingValue,
  onSubmitEdit,
  onCancelEdit,
  selectOptions,
}: {
  value: string | null | undefined;
  scrollable?: boolean;
  state?: WorkflowFieldState | null;
  onAcknowledge?: (() => void) | null;
  editable?: boolean;
  onStartEdit?: (() => void) | null;
  isEditing?: boolean;
  editingValue?: string;
  onChangeEditingValue?: ((value: string) => void) | null;
  onSubmitEdit?: (() => void) | null;
  onCancelEdit?: (() => void) | null;
  selectOptions?: Array<{ value: string; label: string }>;
}) {
  if (isEditing) {
    if (selectOptions && selectOptions.length > 0) {
      return (
        <select
          autoFocus
          value={editingValue}
          onChange={(e) => onChangeEditingValue?.(e.target.value)}
          onBlur={() => onSubmitEdit?.()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onCancelEdit?.();
            }
          }}
          className="h-6 w-full rounded-md border border-sky-400 bg-white px-1 text-[11px] leading-none outline-none ring-1 ring-sky-200"
        >
          {selectOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        autoFocus
        value={editingValue}
        onChange={(e) => onChangeEditingValue?.(e.target.value)}
        onBlur={() => onSubmitEdit?.()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSubmitEdit?.();
          }

          if (e.key === 'Escape') {
            e.preventDefault();
            onCancelEdit?.();
          }
        }}
        className="h-6 w-full rounded-md border border-sky-400 bg-white px-2 text-[11px] leading-none outline-none ring-1 ring-sky-200"
      />
    );
  }

  const wrapperClasses = editable
    ? 'cursor-text'
    : '';

  return (
    <div className={wrapperClasses} onClick={editable ? onStartEdit || undefined : undefined}>
      <CompactCell
        value={value}
        scrollable={scrollable}
        pendingAck={!!state?.pending_ack}
        canAcknowledge={!!state?.pending_ack && !!onAcknowledge}
        onAcknowledge={onAcknowledge || null}
      />
    </div>
  );
}

function WorkflowStandaloneRowView({
  row,
  onOpenOrder,
  onOpenTrip,
  onAcknowledgeField,
  allowAcknowledge,
  editingCell,
  editingValue,
  onStartEdit,
  onChangeEditingValue,
  onSubmitEdit,
  onCancelEdit,
}: {
  row: WorkflowStandaloneRow;
  onOpenOrder: (orderId: string) => void;
  onOpenTrip: (tripId: string) => void;
  onAcknowledgeField: (
    recordType: 'order' | 'trip',
    recordId: string,
    fieldKey: WorkflowEditableFieldKey
  ) => void;
  allowAcknowledge: boolean;
  editingCell: WorkflowEditingCell | null;
  editingValue: string;
  onStartEdit: (
    cell: WorkflowEditingCell,
    initialValue: string | null | undefined
  ) => void;
  onChangeEditingValue: (value: string) => void;
  onSubmitEdit: () => void;
  onCancelEdit: () => void;
}) {
  const acknowledge = (
    state: WorkflowFieldState | null | undefined
  ) =>
    state && allowAcknowledge
      ? () => onAcknowledgeField(state.record_type, state.record_id, state.field_key)
      : null;

  const orderFieldCell = (fieldKey: WorkflowEditableFieldKey) =>
    row.order_id
      ? {
          row_id: row.id,
          record_type: 'order' as const,
          record_id: row.order_id,
          field_key: fieldKey,
        }
      : null;

  const tripFieldCell = (fieldKey: WorkflowEditableFieldKey) =>
    row.trip_id
      ? {
          row_id: row.id,
          record_type: 'trip' as const,
          record_id: row.trip_id,
          field_key: fieldKey,
        }
      : null;

  const matchesEditingCell = (cell: WorkflowEditingCell | null) =>
    !!cell &&
    !!editingCell &&
    cell.row_id === editingCell.row_id &&
    cell.record_type === editingCell.record_type &&
    cell.record_id === editingCell.record_id &&
    cell.field_key === editingCell.field_key;

  const canEditTripOwnedField =
    allowAcknowledge && !!row.trip_editable_by_current_user && !!row.trip_id;
  const canEditOrderField = allowAcknowledge && !!row.order_id;
  const canEditTripField = allowAcknowledge && row.row_type === 'trip_row' && !!row.trip_id;
  const statusCell =
    row.row_type === 'trip_row' ? tripFieldCell('status') : orderFieldCell('status');
  const canEditStatus = allowAcknowledge && !!statusCell;

  return (
    <tr className="border-b hover:bg-slate-50">
      <td className="px-2 py-1.5 whitespace-nowrap">
        <WorkflowDisplayCell
          value={formatStatusLabel(row.status)}
          state={row.field_states.status}
          onAcknowledge={acknowledge(row.field_states.status)}
          editable={canEditStatus}
          onStartEdit={
            canEditStatus && statusCell
              ? () => onStartEdit(statusCell, row.status || 'active')
              : null
          }
          isEditing={matchesEditingCell(statusCell)}
          editingValue={editingValue}
          onChangeEditingValue={onChangeEditingValue}
          onSubmitEdit={onSubmitEdit}
          onCancelEdit={onCancelEdit}
          selectOptions={WORKFLOW_STATUS_OPTIONS}
        />
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap">
        <CompactCell value={row.prep_date || '-'} />
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap">
        <CompactCell value={row.delivery_date || '-'} />
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap font-medium text-slate-900">
        <button
          type="button"
          onClick={() => {
            if (row.row_type === 'trip_row' && row.open_trip_id) {
              onOpenTrip(row.open_trip_id);
              return;
            }

            if (row.open_order_id) {
              onOpenOrder(row.open_order_id);
              return;
            }

            if (row.open_trip_id) {
              onOpenTrip(row.open_trip_id);
            }
          }}
          className="block w-full text-left"
          title={buildRecordNumberDisplay(row)}
        >
          <CompactCell value={buildRecordNumberDisplay(row)} scrollable />
        </button>
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap">
        <CompactCell value={row.kind} />
      </td>
      <td className="px-2 py-1.5">
        <WorkflowDisplayCell
          value={removeCompanyCode(row.company_display)}
          scrollable
        />
      </td>
      <td className="px-2 py-1.5">
        {(() => {
          const cell = orderFieldCell('contact') ?? (canEditTripField ? tripFieldCell('contact') : null);
          return (
        <WorkflowDisplayCell
          value={row.contact_display}
          scrollable
          state={row.field_states.contact}
          onAcknowledge={acknowledge(row.field_states.contact)}
          editable={!!cell}
          onStartEdit={cell ? () => onStartEdit(cell, row.contact_display) : null}
          isEditing={matchesEditingCell(cell)}
          editingValue={editingValue}
          onChangeEditingValue={onChangeEditingValue}
          onSubmitEdit={onSubmitEdit}
          onCancelEdit={onCancelEdit}
        />
          );
        })()}
      </td>
      <td className="px-2 py-1.5">
        <WorkflowDisplayCell
          value={row.shipper_name}
          scrollable
          state={row.field_states.sender}
          onAcknowledge={acknowledge(row.field_states.sender)}
          editable={canEditOrderField}
          onStartEdit={
            canEditOrderField
              ? () => onStartEdit(orderFieldCell('sender')!, row.shipper_name)
              : null
          }
          isEditing={matchesEditingCell(orderFieldCell('sender'))}
          editingValue={editingValue}
          onChangeEditingValue={onChangeEditingValue}
          onSubmitEdit={onSubmitEdit}
          onCancelEdit={onCancelEdit}
        />
      </td>
      <td className="px-2 py-1.5">
        <WorkflowDisplayCell
          value={buildLocationCell(row.loading_display, row.loading_extra)}
          scrollable
          state={row.field_states.loading}
          onAcknowledge={acknowledge(row.field_states.loading)}
          editable={canEditOrderField}
          onStartEdit={
            canEditOrderField
              ? () =>
                  onStartEdit(
                    orderFieldCell('loading')!,
                    buildLocationCell(row.loading_display, row.loading_extra)
                  )
              : null
          }
          isEditing={matchesEditingCell(orderFieldCell('loading'))}
          editingValue={editingValue}
          onChangeEditingValue={onChangeEditingValue}
          onSubmitEdit={onSubmitEdit}
          onCancelEdit={onCancelEdit}
        />
      </td>
      <td className="px-2 py-1.5">
        <WorkflowDisplayCell
          value={row.loading_customs_display}
          scrollable
          state={row.field_states.loading_customs}
          onAcknowledge={acknowledge(row.field_states.loading_customs)}
          editable={canEditOrderField}
          onStartEdit={
            canEditOrderField
              ? () =>
                  onStartEdit(
                    orderFieldCell('loading_customs')!,
                    row.loading_customs_display
                  )
              : null
          }
          isEditing={matchesEditingCell(orderFieldCell('loading_customs'))}
          editingValue={editingValue}
          onChangeEditingValue={onChangeEditingValue}
          onSubmitEdit={onSubmitEdit}
          onCancelEdit={onCancelEdit}
        />
      </td>
      <td className="px-2 py-1.5">
        <WorkflowDisplayCell
          value={row.consignee_name}
          scrollable
          state={row.field_states.receiver}
          onAcknowledge={acknowledge(row.field_states.receiver)}
          editable={canEditOrderField}
          onStartEdit={
            canEditOrderField
              ? () => onStartEdit(orderFieldCell('receiver')!, row.consignee_name)
              : null
          }
          isEditing={matchesEditingCell(orderFieldCell('receiver'))}
          editingValue={editingValue}
          onChangeEditingValue={onChangeEditingValue}
          onSubmitEdit={onSubmitEdit}
          onCancelEdit={onCancelEdit}
        />
      </td>
      <td className="px-2 py-1.5">
        <WorkflowDisplayCell
          value={buildLocationCell(row.unloading_display, row.unloading_extra)}
          scrollable
          state={row.field_states.unloading}
          onAcknowledge={acknowledge(row.field_states.unloading)}
          editable={canEditOrderField}
          onStartEdit={
            canEditOrderField
              ? () =>
                  onStartEdit(
                    orderFieldCell('unloading')!,
                    buildLocationCell(row.unloading_display, row.unloading_extra)
                  )
              : null
          }
          isEditing={matchesEditingCell(orderFieldCell('unloading'))}
          editingValue={editingValue}
          onChangeEditingValue={onChangeEditingValue}
          onSubmitEdit={onSubmitEdit}
          onCancelEdit={onCancelEdit}
        />
      </td>
      <td className="px-2 py-1.5">
        <WorkflowDisplayCell
          value={row.unloading_customs_display}
          scrollable
          state={row.field_states.unloading_customs}
          onAcknowledge={acknowledge(row.field_states.unloading_customs)}
          editable={canEditOrderField}
          onStartEdit={
            canEditOrderField
              ? () =>
                  onStartEdit(
                    orderFieldCell('unloading_customs')!,
                    row.unloading_customs_display
                  )
              : null
          }
          isEditing={matchesEditingCell(orderFieldCell('unloading_customs'))}
          editingValue={editingValue}
          onChangeEditingValue={onChangeEditingValue}
          onSubmitEdit={onSubmitEdit}
          onCancelEdit={onCancelEdit}
        />
      </td>
      <td className="px-2 py-1.5">
        <WorkflowDisplayCell
          value={row.cargo_display}
          scrollable
          state={row.field_states.cargo}
          onAcknowledge={acknowledge(row.field_states.cargo)}
          editable={canEditOrderField}
          onStartEdit={
            canEditOrderField
              ? () => onStartEdit(orderFieldCell('cargo')!, row.cargo_display)
              : null
          }
          isEditing={matchesEditingCell(orderFieldCell('cargo'))}
          editingValue={editingValue}
          onChangeEditingValue={onChangeEditingValue}
          onSubmitEdit={onSubmitEdit}
          onCancelEdit={onCancelEdit}
        />
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap">
        <WorkflowDisplayCell
          value={row.kg_display || formatNumberCell(row.cargo_kg)}
          state={row.field_states.kg}
          onAcknowledge={acknowledge(row.field_states.kg)}
          editable={canEditOrderField}
          onStartEdit={
            canEditOrderField
              ? () =>
                  onStartEdit(
                    orderFieldCell('kg')!,
                    row.kg_display || formatNumberCell(row.cargo_kg)
                  )
              : null
          }
          isEditing={matchesEditingCell(orderFieldCell('kg'))}
          editingValue={editingValue}
          onChangeEditingValue={onChangeEditingValue}
          onSubmitEdit={onSubmitEdit}
          onCancelEdit={onCancelEdit}
        />
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap">
        <WorkflowDisplayCell
          value={row.ldm_display || formatNumberCell(row.cargo_ldm)}
          state={row.field_states.ldm}
          onAcknowledge={acknowledge(row.field_states.ldm)}
          editable={canEditOrderField}
          onStartEdit={
            canEditOrderField
              ? () =>
                  onStartEdit(
                    orderFieldCell('ldm')!,
                    row.ldm_display || formatNumberCell(row.cargo_ldm)
                  )
              : null
          }
          isEditing={matchesEditingCell(orderFieldCell('ldm'))}
          editingValue={editingValue}
          onChangeEditingValue={onChangeEditingValue}
          onSubmitEdit={onSubmitEdit}
          onCancelEdit={onCancelEdit}
        />
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap">
        <WorkflowDisplayCell
          value={formatMoneyCell(row.revenue_display)}
          state={row.field_states.revenue}
          onAcknowledge={acknowledge(row.field_states.revenue)}
          editable={canEditOrderField}
          onStartEdit={
            canEditOrderField
              ? () =>
                  onStartEdit(
                    orderFieldCell('revenue')!,
                    formatMoneyCell(row.revenue_display)
                  )
              : null
          }
          isEditing={matchesEditingCell(orderFieldCell('revenue'))}
          editingValue={editingValue}
          onChangeEditingValue={onChangeEditingValue}
          onSubmitEdit={onSubmitEdit}
          onCancelEdit={onCancelEdit}
        />
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap">
        <WorkflowDisplayCell
          value={formatMoneyCell(row.cost_display)}
          state={row.field_states.cost}
          onAcknowledge={acknowledge(row.field_states.cost)}
          editable={canEditTripOwnedField}
          onStartEdit={
            canEditTripOwnedField
              ? () =>
                  onStartEdit(
                    tripFieldCell('cost')!,
                    formatMoneyCell(row.cost_display)
                  )
              : null
          }
          isEditing={matchesEditingCell(tripFieldCell('cost'))}
          editingValue={editingValue}
          onChangeEditingValue={onChangeEditingValue}
          onSubmitEdit={onSubmitEdit}
          onCancelEdit={onCancelEdit}
        />
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap">
        <WorkflowDisplayCell
          value={formatMoneyCell(row.profit_display)}
          state={row.field_states.profit}
          onAcknowledge={acknowledge(row.field_states.profit)}
          editable={canEditOrderField || canEditTripField}
          onStartEdit={
            canEditOrderField
              ? () =>
                  onStartEdit(
                    orderFieldCell('profit')!,
                    formatMoneyCell(row.profit_display)
                  )
              : canEditTripField
                ? () =>
                    onStartEdit(
                      tripFieldCell('profit')!,
                      formatMoneyCell(row.profit_display)
                    )
                : null
          }
          isEditing={
            matchesEditingCell(orderFieldCell('profit')) ||
            matchesEditingCell(tripFieldCell('profit'))
          }
          editingValue={editingValue}
          onChangeEditingValue={onChangeEditingValue}
          onSubmitEdit={onSubmitEdit}
          onCancelEdit={onCancelEdit}
        />
      </td>
      <td className="px-2 py-1.5">
        <WorkflowDisplayCell
          value={
            [row.trip_display, row.trip_status ? formatStatusLabel(row.trip_status) : '', row.vehicle_display]
              .filter((value) => value && value !== '-')
              .join(' / ') || '-'
          }
          scrollable
          state={row.field_states.trip_vehicle}
          onAcknowledge={acknowledge(row.field_states.trip_vehicle)}
          editable={canEditTripOwnedField}
          onStartEdit={
            canEditTripOwnedField
              ? () =>
                  onStartEdit(
                    tripFieldCell('trip_vehicle')!,
                    [row.trip_display, row.trip_status ? formatStatusLabel(row.trip_status) : '', row.vehicle_display]
                      .filter((value) => value && value !== '-')
                      .join(' / ') || '-'
                  )
              : null
          }
          isEditing={matchesEditingCell(tripFieldCell('trip_vehicle'))}
          editingValue={editingValue}
          onChangeEditingValue={onChangeEditingValue}
          onSubmitEdit={onSubmitEdit}
          onCancelEdit={onCancelEdit}
        />
      </td>
    </tr>
  );
}

function GroupageBlock({
  group,
  headerScope,
  onOpenOrder,
  onOpenTrip,
  onAcknowledgeField,
  allowAcknowledge,
  filters,
  activeHeaderFilter,
  activeHeaderScope,
  setActiveHeaderFilter,
  setActiveHeaderScope,
  updateFilter,
  columnWidths,
  workflowTableMinWidth,
  onStartResize,
  onResetColumnWidth,
  editingCell,
  editingValue,
  onStartEdit,
  onChangeEditingValue,
  onSubmitEdit,
  onCancelEdit,
}: {
  group: WorkflowGroup;
  headerScope: string;
  onOpenOrder: (orderId: string) => void;
  onOpenTrip: (tripId: string) => void;
  onAcknowledgeField: (
    recordType: 'order' | 'trip',
    recordId: string,
    fieldKey: WorkflowEditableFieldKey
  ) => void;
  allowAcknowledge: boolean;
  filters: WorkflowFilters;
  activeHeaderFilter: WorkflowHeaderFilterId | null;
  activeHeaderScope: string | null;
  setActiveHeaderFilter: (value: WorkflowHeaderFilterId | null) => void;
  setActiveHeaderScope: (value: string | null) => void;
  updateFilter: <K extends keyof WorkflowFilters>(key: K, value: WorkflowFilters[K]) => void;
  columnWidths: WorkflowColumnWidths;
  workflowTableMinWidth: number;
  onStartResize: (columnId: WorkflowColumnId, clientX: number) => void;
  onResetColumnWidth: (columnId: WorkflowColumnId) => void;
  editingCell: WorkflowEditingCell | null;
  editingValue: string;
  onStartEdit: (
    cell: WorkflowEditingCell,
    initialValue: string | null | undefined
  ) => void;
  onChangeEditingValue: (value: string) => void;
  onSubmitEdit: () => void;
  onCancelEdit: () => void;
}) {
  const acknowledge = (
    state: WorkflowFieldState | null | undefined
  ) =>
    state && allowAcknowledge
      ? () => onAcknowledgeField(state.record_type, state.record_id, state.field_key)
      : null;

  const canEditTripField =
    allowAcknowledge && !!group.trip_editable_by_current_user;
  const canEditGroupStatus = allowAcknowledge;

  const groupHeaderCell = (fieldKey: WorkflowEditableFieldKey): WorkflowEditingCell => ({
    row_id: group.id,
    record_type: 'trip',
    record_id: group.trip_id,
    field_key: fieldKey,
  });

  const groupFooterCell = (fieldKey: WorkflowEditableFieldKey): WorkflowEditingCell => ({
    row_id: group.footer.id,
    record_type: 'trip',
    record_id: group.trip_id,
    field_key: fieldKey,
  });

  const matchesEditingCell = (cell: WorkflowEditingCell | null) =>
    !!cell &&
    !!editingCell &&
    cell.row_id === editingCell.row_id &&
    cell.record_type === editingCell.record_type &&
    cell.record_id === editingCell.record_id &&
    cell.field_key === editingCell.field_key;

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table
        className="w-full table-fixed text-[11px] leading-tight"
        style={{ minWidth: `${workflowTableMinWidth}px` }}
      >
        <WorkflowColGroup columnWidths={columnWidths} />
        <WorkflowTableHeader
          filters={filters}
          headerScope={headerScope}
          activeHeaderFilter={activeHeaderFilter}
          activeHeaderScope={activeHeaderScope}
          setActiveHeaderFilter={setActiveHeaderFilter}
          setActiveHeaderScope={setActiveHeaderScope}
          updateFilter={updateFilter}
          onStartResize={onStartResize}
          onResetColumnWidth={onResetColumnWidth}
        />
        <tbody>
          <tr className="border-b-2 border-amber-300 bg-amber-100/70">
            <td className="px-2 py-1 whitespace-nowrap">
              <WorkflowDisplayCell
                value={formatStatusLabel(group.trip_status)}
                state={group.field_states.status}
                onAcknowledge={acknowledge(group.field_states.status)}
                editable={canEditGroupStatus}
                onStartEdit={
                  canEditGroupStatus
                    ? () =>
                        onStartEdit(
                          groupHeaderCell('status'),
                          group.trip_status || 'active'
                        )
                    : null
                }
                isEditing={matchesEditingCell(groupHeaderCell('status'))}
                editingValue={editingValue}
                onChangeEditingValue={onChangeEditingValue}
                onSubmitEdit={onSubmitEdit}
                onCancelEdit={onCancelEdit}
                selectOptions={WORKFLOW_STATUS_OPTIONS}
              />
            </td>
            <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>
            <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>
            <td className="px-2 py-1 whitespace-nowrap font-semibold text-slate-900">
              <button
                type="button"
                onClick={() => onOpenTrip(group.trip_id)}
                className="block w-full text-left"
                title={group.trip_number}
              >
                <CompactCell value={group.trip_number} scrollable />
              </button>
            </td>
            <td className="px-2 py-1 whitespace-nowrap font-medium text-amber-900">
              <CompactCell value="Groupage start" />
            </td>
            <td className="px-2 py-1">
              <CompactCell value={removeCompanyCode(group.carrier_display)} scrollable />
            </td>
            <td className="px-2 py-1">
              <WorkflowDisplayCell
                value={group.responsible_display}
                scrollable
                state={group.field_states.contact}
                onAcknowledge={acknowledge(group.field_states.contact)}
                editable={canEditTripField}
                onStartEdit={
                  canEditTripField
                    ? () => onStartEdit(groupHeaderCell('contact'), group.responsible_display)
                    : null
                }
                isEditing={matchesEditingCell(groupHeaderCell('contact'))}
                editingValue={editingValue}
                onChangeEditingValue={onChangeEditingValue}
                onSubmitEdit={onSubmitEdit}
                onCancelEdit={onCancelEdit}
              />
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
              <WorkflowDisplayCell
                value={formatMoneyCell(group.cost_display)}
                state={group.field_states.cost}
                onAcknowledge={acknowledge(group.field_states.cost)}
                editable={canEditTripField}
                onStartEdit={
                  canEditTripField
                    ? () => onStartEdit(groupHeaderCell('cost'), formatMoneyCell(group.cost_display))
                    : null
                }
                isEditing={matchesEditingCell(groupHeaderCell('cost'))}
                editingValue={editingValue}
                onChangeEditingValue={onChangeEditingValue}
                onSubmitEdit={onSubmitEdit}
                onCancelEdit={onCancelEdit}
              />
            </td>
            <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>
            <td className="px-2 py-1">
              <WorkflowDisplayCell
                value={group.vehicle_display}
                scrollable
                state={group.field_states.trip_vehicle}
                onAcknowledge={acknowledge(group.field_states.trip_vehicle)}
                editable={canEditTripField}
                onStartEdit={
                  canEditTripField
                    ? () => onStartEdit(groupHeaderCell('trip_vehicle'), group.vehicle_display)
                    : null
                }
                isEditing={matchesEditingCell(groupHeaderCell('trip_vehicle'))}
                editingValue={editingValue}
                onChangeEditingValue={onChangeEditingValue}
                onSubmitEdit={onSubmitEdit}
                onCancelEdit={onCancelEdit}
              />
            </td>
          </tr>

          {group.rows.map((row) => (
            <WorkflowStandaloneRowView
              key={row.id}
              row={row}
              onOpenOrder={onOpenOrder}
              onOpenTrip={onOpenTrip}
              onAcknowledgeField={onAcknowledgeField}
              allowAcknowledge={allowAcknowledge}
              editingCell={editingCell}
              editingValue={editingValue}
              onStartEdit={onStartEdit}
              onChangeEditingValue={onChangeEditingValue}
              onSubmitEdit={onSubmitEdit}
              onCancelEdit={onCancelEdit}
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
              <WorkflowDisplayCell
                value={formatMoneyCell(group.footer.cost_display)}
                state={group.footer.field_states.cost}
                onAcknowledge={acknowledge(group.footer.field_states.cost)}
                editable={canEditTripField}
                onStartEdit={
                  canEditTripField
                    ? () =>
                        onStartEdit(
                          groupFooterCell('cost'),
                          formatMoneyCell(group.footer.cost_display)
                        )
                    : null
                }
                isEditing={matchesEditingCell(groupFooterCell('cost'))}
                editingValue={editingValue}
                onChangeEditingValue={onChangeEditingValue}
                onSubmitEdit={onSubmitEdit}
                onCancelEdit={onCancelEdit}
              />
            </td>
            <td className="px-2 py-1 whitespace-nowrap">
              <WorkflowDisplayCell
                value={formatMoneyCell(group.footer.profit_display)}
                state={group.footer.field_states.profit}
                onAcknowledge={acknowledge(group.footer.field_states.profit)}
                editable={canEditTripField}
                onStartEdit={
                  canEditTripField
                    ? () =>
                        onStartEdit(
                          groupFooterCell('profit'),
                          formatMoneyCell(group.footer.profit_display)
                        )
                    : null
                }
                isEditing={matchesEditingCell(groupFooterCell('profit'))}
                editingValue={editingValue}
                onChangeEditingValue={onChangeEditingValue}
                onSubmitEdit={onSubmitEdit}
                onCancelEdit={onCancelEdit}
              />
            </td>
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
  const [effectiveManagerUserId, setEffectiveManagerUserId] = useState('');
  const [viewerIsElevated, setViewerIsElevated] = useState(false);
  const [currentOrganizationId, setCurrentOrganizationId] = useState('');
  const [groupageGroups, setGroupageGroups] = useState<WorkflowGroup[]>([]);
  const [standaloneRows, setStandaloneRows] = useState<WorkflowStandaloneRow[]>([]);
  const [filters, setFilters] = useState<WorkflowFilters>(DEFAULT_FILTERS);
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const [columnWidths, setColumnWidths] = useState<WorkflowColumnWidths>(
    DEFAULT_WORKFLOW_COLUMN_WIDTHS
  );
  const [columnWidthsHydrated, setColumnWidthsHydrated] = useState(false);
  const [activeHeaderFilter, setActiveHeaderFilter] =
    useState<WorkflowHeaderFilterId | null>(null);
  const [activeHeaderScope, setActiveHeaderScope] = useState<string | null>(null);
  const [resizingColumn, setResizingColumn] = useState<{
    columnId: WorkflowColumnId;
    startX: number;
    startWidth: number;
  } | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [selectedManagerUserId, setSelectedManagerUserId] = useState('');
  const [loadingOrganizations, setLoadingOrganizations] = useState(false);
  const [loadingManagers, setLoadingManagers] = useState(false);
  const [editingCell, setEditingCell] = useState<WorkflowEditingCell | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [savingField, setSavingField] = useState(false);

  useEffect(() => {
    void fetchWorkflow();
  }, []);

  useEffect(() => {
    if (!viewerUserId) {
      return;
    }

    try {
      const saved = window.localStorage.getItem(
        `synchub.workflow.filters.${viewerUserId}`
      );

      if (!saved) {
        setFiltersHydrated(true);
        return;
      }

      const parsed = JSON.parse(saved) as Partial<WorkflowFilters>;
      setFilters({
        ...DEFAULT_FILTERS,
        ...parsed,
      });
    } catch (error) {
      console.error('Failed to hydrate workflow filters:', error);
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
      `synchub.workflow.filters.${viewerUserId}`,
      JSON.stringify(filters)
    );
  }, [filters, filtersHydrated, viewerUserId]);

  useEffect(() => {
    if (!viewerUserId) {
      return;
    }

    try {
      const saved = window.localStorage.getItem(
        `synchub.workflow.column-widths.${viewerUserId}`
      );

      if (!saved) {
        setColumnWidths(DEFAULT_WORKFLOW_COLUMN_WIDTHS);
        return;
      }

      const parsed = JSON.parse(saved) as Partial<WorkflowColumnWidths>;
      const nextWidths = { ...DEFAULT_WORKFLOW_COLUMN_WIDTHS };

      for (const column of WORKFLOW_COLUMN_CONFIG) {
        const rawWidth = parsed[column.id];
        if (typeof rawWidth === 'number' && Number.isFinite(rawWidth)) {
          nextWidths[column.id] = Math.max(
            WORKFLOW_COLUMN_MIN_WIDTHS[column.id],
            Math.round(rawWidth)
          );
        }
      }

      setColumnWidths(nextWidths);
    } catch (error) {
      console.error('Failed to hydrate workflow column widths:', error);
      setColumnWidths(DEFAULT_WORKFLOW_COLUMN_WIDTHS);
    } finally {
      setColumnWidthsHydrated(true);
    }
  }, [viewerUserId]);

  useEffect(() => {
    if (!viewerUserId || !columnWidthsHydrated) {
      return;
    }

    window.localStorage.setItem(
      `synchub.workflow.column-widths.${viewerUserId}`,
      JSON.stringify(columnWidths)
    );
  }, [columnWidths, columnWidthsHydrated, viewerUserId]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;

      if (!target?.closest('[data-workflow-header-filter-root="true"]')) {
        setActiveHeaderFilter(null);
        setActiveHeaderScope(null);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, []);

  useEffect(() => {
    if (!resizingColumn) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const minWidth = WORKFLOW_COLUMN_MIN_WIDTHS[resizingColumn.columnId];
      const nextWidth = Math.max(
        minWidth,
        Math.round(resizingColumn.startWidth + (event.clientX - resizingColumn.startX))
      );

      setColumnWidths((prev) => ({
        ...prev,
        [resizingColumn.columnId]: nextWidth,
      }));
    };

    const handleMouseUp = () => {
      setResizingColumn(null);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumn]);

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
      setEffectiveManagerUserId(data.effective_manager_user_id || '');
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

  const buildReloadParams = () =>
    viewerIsElevated
      ? {
          organizationId: selectedOrganizationId || undefined,
          managerUserId: selectedManagerUserId || undefined,
        }
      : {
          organizationId: undefined,
          managerUserId: undefined,
        };

  const canAcknowledgeWorkflow =
    !!viewerUserId &&
    !!effectiveManagerUserId &&
    viewerUserId === effectiveManagerUserId;

  const workflowTableMinWidth = useMemo(
    () => Object.values(columnWidths).reduce((sum, width) => sum + width, 0),
    [columnWidths]
  );

  const startColumnResize = (columnId: WorkflowColumnId, clientX: number) => {
    setActiveHeaderFilter(null);
    setActiveHeaderScope(null);
    setResizingColumn({
      columnId,
      startX: clientX,
      startWidth: columnWidths[columnId] ?? DEFAULT_WORKFLOW_COLUMN_WIDTHS[columnId],
    });
  };

  const resetColumnWidth = (columnId: WorkflowColumnId) => {
    setColumnWidths((prev) => ({
      ...prev,
      [columnId]: DEFAULT_WORKFLOW_COLUMN_WIDTHS[columnId],
    }));
  };

  const acknowledgeWorkflowField = async (
    recordType: 'order' | 'trip',
    recordId: string,
    fieldKey: WorkflowEditableFieldKey
  ) => {
    if (!canAcknowledgeWorkflow) {
      return;
    }

    try {
      const res = await fetch('/api/workflow/field/acknowledge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          record_type: recordType,
          record_id: recordId,
          field_key: fieldKey,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to acknowledge field update');
        return;
      }

      await fetchWorkflow(
        buildReloadParams().organizationId,
        buildReloadParams().managerUserId
      );
    } catch (error) {
      toast.error('Failed to acknowledge field update');
    }
  };

  const startEditingCell = (
    cell: WorkflowEditingCell,
    initialValue: string | null | undefined
  ) => {
    if (savingField) {
      return;
    }

    setEditingCell(cell);
    setEditingValue(initialValue && initialValue !== '-' ? initialValue : '');
  };

  const cancelEditingCell = () => {
    if (savingField) {
      return;
    }

    setEditingCell(null);
    setEditingValue('');
  };

  const submitEditingCell = async () => {
    if (!editingCell || savingField) {
      return;
    }

    try {
      setSavingField(true);

      const response = await fetch('/api/workflow/field/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          record_type: editingCell.record_type,
          record_id: editingCell.record_id,
          field_key: editingCell.field_key,
          value_text: editingValue.trim() === '' ? null : editingValue.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || 'Failed to save workflow field');
        return;
      }

      const savedFieldUpdate = data.field_update as WorkflowFieldUpdateResponse | undefined;

      if (savedFieldUpdate) {
        const localFieldState = buildPendingFieldState(savedFieldUpdate);

        setGroupageGroups((prev) =>
          prev.map((group) => applyFieldUpdateToGroup(group, savedFieldUpdate, localFieldState))
        );
        setStandaloneRows((prev) =>
          prev.map((row) =>
            applyFieldUpdateToStandaloneRow(row, savedFieldUpdate, localFieldState)
          )
        );
      }

      setEditingCell(null);
      setEditingValue('');

      void fetchWorkflow(
        buildReloadParams().organizationId,
        buildReloadParams().managerUserId
      );
    } catch (error) {
      toast.error('Failed to save workflow field');
    } finally {
      setSavingField(false);
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
    const rowMatchesFilters = (row: WorkflowStandaloneRow) => {
      const globalSearch = filters.search.trim().toLowerCase();
      const searchableText = buildStandaloneSearchText(row);

      const matchesGlobalSearch =
        !globalSearch || searchableText.includes(globalSearch);

      const matchesStatus =
        filters.status === 'all'
          ? true
          : formatStatusLabel(row.status).toLowerCase() === filters.status.toLowerCase() ||
            (row.status || '').toLowerCase() === filters.status.toLowerCase();

      return (
        matchesGlobalSearch &&
        matchesStatus &&
        matchesDateRange(row.prep_date, filters.prepFrom, filters.prepTo) &&
        matchesDateRange(row.delivery_date, filters.deliveryFrom, filters.deliveryTo) &&
        matchesText(buildRecordNumberDisplay(row), filters.recordNumber) &&
        matchesText(row.kind, filters.kind) &&
        matchesText(removeCompanyCode(row.company_display), filters.company) &&
        matchesText(row.contact_display, filters.contact) &&
        matchesText(row.shipper_name, filters.sender) &&
        matchesText(buildLocationCell(row.loading_display, row.loading_extra), filters.loading) &&
        matchesText(row.loading_customs_display, filters.loadingCustoms) &&
        matchesText(row.consignee_name, filters.receiver) &&
        matchesText(buildLocationCell(row.unloading_display, row.unloading_extra), filters.unloading) &&
        matchesText(row.unloading_customs_display, filters.unloadingCustoms) &&
        matchesText(row.cargo_display, filters.cargo) &&
        matchesText(row.kg_display || formatNumberCell(row.cargo_kg), filters.kg) &&
        matchesText(row.ldm_display || formatNumberCell(row.cargo_ldm), filters.ldm) &&
        matchesText(formatMoneyCell(row.revenue_display), filters.revenue) &&
        matchesText(formatMoneyCell(row.cost_display), filters.cost) &&
        matchesText(formatMoneyCell(row.profit_display), filters.profit) &&
        matchesText(
          [row.trip_display, row.trip_status ? formatStatusLabel(row.trip_status) : '', row.vehicle_display]
            .filter((value) => value && value !== '-')
            .join(' / ') || '-',
          filters.tripVehicle
        )
      );
    };

    const groupMatchesFilters = (group: WorkflowGroup) => {
      const globalSearch = filters.search.trim().toLowerCase();
      const searchableText = buildGroupSearchText(group);

      const matchesGlobalSearch =
        !globalSearch || searchableText.includes(globalSearch);

      const matchesStatus =
        filters.status === 'all'
          ? true
          : formatStatusLabel(group.trip_status).toLowerCase() === filters.status.toLowerCase() ||
            (group.trip_status || '').toLowerCase() === filters.status.toLowerCase();

      return (
        matchesGlobalSearch &&
        matchesStatus &&
        !filters.prepFrom &&
        !filters.prepTo &&
        !filters.deliveryFrom &&
        !filters.deliveryTo &&
        matchesText(group.trip_number, filters.recordNumber) &&
        matchesText('Groupage', filters.kind) &&
        matchesText(removeCompanyCode(group.carrier_display), filters.company) &&
        matchesText(group.responsible_display, filters.contact) &&
        !filters.sender.trim() &&
        !filters.loading.trim() &&
        !filters.loadingCustoms.trim() &&
        !filters.receiver.trim() &&
        !filters.unloading.trim() &&
        !filters.unloadingCustoms.trim() &&
        !filters.cargo.trim() &&
        !filters.kg.trim() &&
        !filters.ldm.trim() &&
        !filters.revenue.trim() &&
        matchesText(formatMoneyCell(group.cost_display), filters.cost) &&
        !filters.profit.trim() &&
        matchesText(group.vehicle_display, filters.tripVehicle)
      );
    };

    const groups = groupageGroups
      .map((group) => {
        const groupMatches = groupMatchesFilters(group);

        if (groupMatches) {
          return group;
        }

        const matchingRows = group.rows.filter(rowMatchesFilters);

        return matchingRows.length > 0
          ? {
              ...group,
              rows: matchingRows,
            }
          : null;
      })
      .filter(Boolean) as WorkflowGroup[];

    const rows = standaloneRows.filter(rowMatchesFilters);

    return { groups, rows };
  }, [filters, groupageGroups, standaloneRows]);

  const updateFilter = <K extends keyof WorkflowFilters>(
    key: K,
    value: WorkflowFilters[K]
  ) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setActiveHeaderFilter(null);
    setActiveHeaderScope(null);

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
        ) : (
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
        )}
      </div>

      <div className="space-y-4">
        {loading && !filtersHydrated ? (
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
                headerScope={`group-${group.id}`}
                onOpenOrder={(orderId) => router.push(`/app/orders/${orderId}`)}
                onOpenTrip={(tripId) => router.push(`/app/trips/${tripId}`)}
                onAcknowledgeField={acknowledgeWorkflowField}
                allowAcknowledge={canAcknowledgeWorkflow}
                filters={filters}
                activeHeaderFilter={activeHeaderFilter}
                activeHeaderScope={activeHeaderScope}
                setActiveHeaderFilter={setActiveHeaderFilter}
                setActiveHeaderScope={setActiveHeaderScope}
                updateFilter={updateFilter}
                columnWidths={columnWidths}
                workflowTableMinWidth={workflowTableMinWidth}
                onStartResize={startColumnResize}
                onResetColumnWidth={resetColumnWidth}
                editingCell={editingCell}
                editingValue={editingValue}
                onStartEdit={startEditingCell}
                onChangeEditingValue={setEditingValue}
                onSubmitEdit={submitEditingCell}
                onCancelEdit={cancelEditingCell}
              />
            ))}

            {filteredData.rows.length > 0 ? (
              <div className="overflow-x-auto rounded-2xl border bg-white">
                <table
                  className="w-full table-fixed text-[11px] leading-tight"
                  style={{ minWidth: `${workflowTableMinWidth}px` }}
                >
                  <WorkflowColGroup columnWidths={columnWidths} />
                  <WorkflowTableHeader
                    filters={filters}
                    headerScope="standalone"
                    activeHeaderFilter={activeHeaderFilter}
                    activeHeaderScope={activeHeaderScope}
                    setActiveHeaderFilter={setActiveHeaderFilter}
                    setActiveHeaderScope={setActiveHeaderScope}
                    updateFilter={updateFilter}
                    onStartResize={startColumnResize}
                    onResetColumnWidth={resetColumnWidth}
                  />
                  <tbody>
                    {filteredData.rows.map((row) => (
                      <WorkflowStandaloneRowView
                        key={row.id}
                        row={row}
                        onOpenOrder={(orderId) => router.push(`/app/orders/${orderId}`)}
                        onOpenTrip={(tripId) => router.push(`/app/trips/${tripId}`)}
                        onAcknowledgeField={acknowledgeWorkflowField}
                        allowAcknowledge={canAcknowledgeWorkflow}
                        editingCell={editingCell}
                        editingValue={editingValue}
                        onStartEdit={startEditingCell}
                        onChangeEditingValue={setEditingValue}
                        onSubmitEdit={submitEditingCell}
                        onCancelEdit={cancelEditingCell}
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
