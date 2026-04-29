'use client';

import { Fragment, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
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
  route_plan?: WorkflowRoutePlan | null;
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

type WorkflowRoutePlan = {
  collection_mode: 'not_set' | 'direct' | 'collection_trip';
  reloading_mode: 'not_set' | 'no_reloading' | 'reloading';
  international_trip_id: string | null;
  international_trip_number: string | null;
  setup_status: 'setup_needed' | 'ready';
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

type WorkflowCustomColumn = {
  id: string;
  owner_organization_id: string;
  created_by: string;
  name: string;
  slug: string;
  visibility_scope: 'self' | 'selected_organizations';
  visible_organization_ids: string[];
  created_at: string;
  updated_at: string;
};

type WorkflowCustomColumnsResponse = {
  viewer_user_id: string;
  current_organization_id: string | null;
  custom_columns: WorkflowCustomColumn[];
};

type WorkflowFieldUpdateResponse = {
  id: string;
  record_type: 'order' | 'trip';
  record_id: string;
  field_key: WorkflowEditableFieldKey;
  value_text: string | null;
  revision: number;
};

type WorkflowRoutePlanUpdateResponse = {
  collection_mode: WorkflowRoutePlan['collection_mode'];
  reloading_mode: WorkflowRoutePlan['reloading_mode'];
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
} & (
  | {
      edit_kind: 'workflow_field';
      record_type: 'order' | 'trip';
      record_id: string;
      field_key: WorkflowEditableFieldKey;
    }
  | {
      edit_kind: 'route_plan';
      order_id: string;
      plan_key: 'collection_mode' | 'reloading_mode';
    }
);

type WorkflowFilters = {
  search: string;
  status: string;
  prepFrom: string;
  prepTo: string;
  deliveryFrom: string;
  deliveryTo: string;
  recordNumber: string;
  kind: string;
  collectionPlan: string;
  reloadingPlan: string;
  internationalPlan: string;
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
  | 'collection_plan'
  | 'reloading_plan'
  | 'international_plan'
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

type WorkflowColumnId = string;

type WorkflowColumnWidths = Record<string, number>;
type WorkflowColumnOrder = string[];
type WorkflowRowHeights = Record<string, number>;

const DEFAULT_FILTERS: WorkflowFilters = {
  search: '',
  status: 'all',
  prepFrom: '',
  prepTo: '',
  deliveryFrom: '',
  deliveryTo: '',
  recordNumber: '',
  kind: '',
  collectionPlan: '',
  reloadingPlan: '',
  internationalPlan: '',
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

const WORKFLOW_COLLECTION_MODE_OPTIONS = [
  { value: 'not_set', label: 'Not set' },
  { value: 'direct', label: 'Direct' },
  { value: 'collection_trip', label: 'Collection trip' },
] as const;

const WORKFLOW_RELOADING_MODE_OPTIONS = [
  { value: 'not_set', label: 'Not set' },
  { value: 'no_reloading', label: 'No reloading' },
  { value: 'reloading', label: 'Reloading' },
] as const;

const WORKFLOW_COLUMN_CONFIG = [
  { id: 'status', defaultWidth: 84, minWidth: 52 },
  { id: 'prep', defaultWidth: 88, minWidth: 64 },
  { id: 'delivery', defaultWidth: 92, minWidth: 64 },
  { id: 'record_number', defaultWidth: 170, minWidth: 96 },
  { id: 'kind', defaultWidth: 96, minWidth: 64 },
  { id: 'collection_plan', defaultWidth: 120, minWidth: 76 },
  { id: 'reloading_plan', defaultWidth: 120, minWidth: 76 },
  { id: 'international_plan', defaultWidth: 160, minWidth: 90 },
  { id: 'company', defaultWidth: 170, minWidth: 96 },
  { id: 'contact', defaultWidth: 170, minWidth: 96 },
  { id: 'sender', defaultWidth: 150, minWidth: 96 },
  { id: 'loading', defaultWidth: 220, minWidth: 110 },
  { id: 'loading_customs', defaultWidth: 140, minWidth: 88 },
  { id: 'receiver', defaultWidth: 150, minWidth: 96 },
  { id: 'unloading', defaultWidth: 220, minWidth: 110 },
  { id: 'unloading_customs', defaultWidth: 140, minWidth: 88 },
  { id: 'cargo', defaultWidth: 170, minWidth: 96 },
  { id: 'kg', defaultWidth: 82, minWidth: 52 },
  { id: 'ldm', defaultWidth: 82, minWidth: 52 },
  { id: 'revenue', defaultWidth: 94, minWidth: 64 },
  { id: 'cost', defaultWidth: 94, minWidth: 64 },
  { id: 'profit', defaultWidth: 94, minWidth: 64 },
  { id: 'trip_vehicle', defaultWidth: 230, minWidth: 110 },
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

const DEFAULT_WORKFLOW_COLUMN_ORDER = WORKFLOW_COLUMN_CONFIG.map(
  (column) => column.id
) as WorkflowColumnOrder;

const DEFAULT_WORKFLOW_ROW_HEIGHT = 24;
const MIN_WORKFLOW_ROW_HEIGHT = 18;
const MAX_WORKFLOW_ROW_HEIGHT = 180;
const CUSTOM_WORKFLOW_COLUMN_PREFIX = 'custom:';
const DEFAULT_CUSTOM_WORKFLOW_COLUMN_WIDTH = 160;
const DEFAULT_CUSTOM_WORKFLOW_COLUMN_MIN_WIDTH = 72;

function buildCustomWorkflowColumnId(columnId: string) {
  return `${CUSTOM_WORKFLOW_COLUMN_PREFIX}${columnId}`;
}

function parseCustomWorkflowColumnId(columnId: string) {
  if (!columnId.startsWith(CUSTOM_WORKFLOW_COLUMN_PREFIX)) {
    return null;
  }

  const value = columnId.slice(CUSTOM_WORKFLOW_COLUMN_PREFIX.length).trim();
  return value || null;
}

function getDefaultWorkflowColumnWidth(columnId: string) {
  const fixedColumn = WORKFLOW_COLUMN_CONFIG.find((column) => column.id === columnId);
  return fixedColumn?.defaultWidth ?? DEFAULT_CUSTOM_WORKFLOW_COLUMN_WIDTH;
}

function getMinWorkflowColumnWidth(columnId: string) {
  const fixedColumn = WORKFLOW_COLUMN_CONFIG.find((column) => column.id === columnId);
  return fixedColumn?.minWidth ?? DEFAULT_CUSTOM_WORKFLOW_COLUMN_MIN_WIDTH;
}

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

function formatWorkflowCollectionMode(
  value: WorkflowRoutePlan['collection_mode'] | null | undefined
) {
  return (
    WORKFLOW_COLLECTION_MODE_OPTIONS.find((option) => option.value === value)?.label || '-'
  );
}

function formatWorkflowReloadingMode(
  value: WorkflowRoutePlan['reloading_mode'] | null | undefined
) {
  return (
    WORKFLOW_RELOADING_MODE_OPTIONS.find((option) => option.value === value)?.label || '-'
  );
}

function formatWorkflowInternationalPlan(routePlan: WorkflowRoutePlan | null | undefined) {
  if (!routePlan) {
    return '-';
  }

  const values = [
    routePlan.international_trip_number || '-',
    routePlan.setup_status === 'setup_needed' ? 'Setup needed' : '',
  ].filter((value) => value && value !== '-');

  return values.length > 0 ? values.join(' / ') : '-';
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
          className={`workflow-scrollbar workflow-compact-cell workflow-wrap-cell overflow-auto rounded-md px-2 py-1 leading-tight ${cellClasses} ${canAcknowledge ? 'pr-6' : ''}`}
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
            className="workflow-ack-button absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-emerald-500 text-white shadow-sm hover:bg-emerald-600"
            aria-label="Acknowledge field update"
            title="Acknowledge field update"
          >
            <Check className="workflow-ack-icon" />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        className={`workflow-compact-cell flex items-center truncate rounded-md px-2 leading-none ${pendingAck ? 'bg-slate-800 text-white' : 'text-slate-900'} ${canAcknowledge ? 'pr-6' : ''}`}
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
          className="workflow-ack-button absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-emerald-500 text-white shadow-sm hover:bg-emerald-600"
          aria-label="Acknowledge field update"
          title="Acknowledge field update"
        >
          <Check className="workflow-ack-icon" />
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
    formatWorkflowCollectionMode(row.route_plan?.collection_mode),
    formatWorkflowReloadingMode(row.route_plan?.reloading_mode),
    formatWorkflowInternationalPlan(row.route_plan),
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

function buildRoutePlanEditingCell(
  rowId: string,
  orderId: string | null | undefined,
  planKey: 'collection_mode' | 'reloading_mode'
): WorkflowEditingCell | null {
  if (!orderId) {
    return null;
  }

  return {
    row_id: rowId,
    edit_kind: 'route_plan',
    order_id: orderId,
    plan_key: planKey,
  };
}

function isSameEditingCell(
  left: WorkflowEditingCell | null,
  right: WorkflowEditingCell | null
) {
  if (!left || !right) {
    return false;
  }

  if (left.row_id !== right.row_id || left.edit_kind !== right.edit_kind) {
    return false;
  }

  if (left.edit_kind === 'workflow_field' && right.edit_kind === 'workflow_field') {
    return (
      left.record_type === right.record_type &&
      left.record_id === right.record_id &&
      left.field_key === right.field_key
    );
  }

  if (left.edit_kind === 'route_plan' && right.edit_kind === 'route_plan') {
    return left.order_id === right.order_id && left.plan_key === right.plan_key;
  }

  return false;
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

function applyRoutePlanToStandaloneRow(
  row: WorkflowStandaloneRow,
  routePlan: WorkflowRoutePlan
) {
  if (!row.order_id) {
    return row;
  }

  return {
    ...row,
    route_plan: routePlan,
  };
}

function mergeWorkflowRoutePlanForClient(
  current: WorkflowRoutePlan | null | undefined,
  update: WorkflowRoutePlanUpdateResponse
): WorkflowRoutePlan {
  const internationalTripId = current?.international_trip_id ?? null;
  const internationalTripNumber = current?.international_trip_number ?? null;
  const collectionMode = update.collection_mode;
  const reloadingMode = update.reloading_mode;

  return {
    collection_mode: collectionMode,
    reloading_mode: reloadingMode,
    international_trip_id: internationalTripId,
    international_trip_number: internationalTripNumber,
    setup_status:
      internationalTripId &&
      (collectionMode === 'not_set' || reloadingMode === 'not_set')
        ? 'setup_needed'
        : 'ready',
  };
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
  columnOrder,
}: {
  columnWidths: WorkflowColumnWidths;
  columnOrder: WorkflowColumnOrder;
}) {
  return (
    <colgroup>
      {columnOrder.map((columnId) => {
        return (
        <col
          key={columnId}
          style={{ width: `${columnWidths[columnId] ?? getDefaultWorkflowColumnWidth(columnId)}px` }}
        />
        );
      })}
    </colgroup>
  );
}

function WorkflowHeaderCell({
  columnId,
  children,
  onStartResize,
  onResetColumnWidth,
  onDragStartColumn,
  onDragOverColumn,
  onDropColumn,
  onDragEndColumn,
  isDragTarget = false,
}: {
  columnId: WorkflowColumnId;
  children: ReactNode;
  onStartResize: (columnId: WorkflowColumnId, clientX: number) => void;
  onResetColumnWidth: (columnId: WorkflowColumnId) => void;
  onDragStartColumn: (columnId: WorkflowColumnId) => void;
  onDragOverColumn: (columnId: WorkflowColumnId) => void;
  onDropColumn: (columnId: WorkflowColumnId) => void;
  onDragEndColumn: () => void;
  isDragTarget?: boolean;
}) {
  return (
    <th
      draggable
      onDragStart={() => onDragStartColumn(columnId)}
      onDragEnd={onDragEndColumn}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOverColumn(columnId);
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDropColumn(columnId);
      }}
      className={`relative px-1 py-1.5 text-left align-top ${isDragTarget ? 'bg-sky-50 ring-1 ring-inset ring-sky-200' : ''}`}
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

function WorkflowRowResizeHandle({
  onStartResize,
  onResetHeight,
}: {
  onStartResize: (clientY: number) => void;
  onResetHeight: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onStartResize(event.clientY);
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onResetHeight();
      }}
      className="absolute -bottom-1 left-0 z-10 h-3 w-full cursor-row-resize touch-none bg-transparent"
      aria-label="Resize workflow row height"
      title="Drag to resize row, double click to reset"
    >
      <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-200 bg-white/95 px-1 text-[10px] leading-none text-sky-600 opacity-0 shadow-sm transition group-hover/row-resize:opacity-100">
        ↕
      </span>
    </button>
  );
}

function WorkflowTableHeader({
  filters,
  columnOrder,
  customColumns,
  headerScope,
  activeHeaderFilter,
  activeHeaderScope,
  setActiveHeaderFilter,
  setActiveHeaderScope,
  updateFilter,
  onStartResize,
  onResetColumnWidth,
  onDragStartColumn,
  onDragOverColumn,
  onDropColumn,
  onDragEndColumn,
  dragOverColumnId,
}: {
  filters: WorkflowFilters;
  columnOrder: WorkflowColumnOrder;
  customColumns: WorkflowCustomColumn[];
  headerScope: string;
  activeHeaderFilter: WorkflowHeaderFilterId | null;
  activeHeaderScope: string | null;
  setActiveHeaderFilter: (value: WorkflowHeaderFilterId | null) => void;
  setActiveHeaderScope: (value: string | null) => void;
  updateFilter: <K extends keyof WorkflowFilters>(key: K, value: WorkflowFilters[K]) => void;
  onStartResize: (columnId: WorkflowColumnId, clientX: number) => void;
  onResetColumnWidth: (columnId: WorkflowColumnId) => void;
  onDragStartColumn: (columnId: WorkflowColumnId) => void;
  onDragOverColumn: (columnId: WorkflowColumnId) => void;
  onDropColumn: (columnId: WorkflowColumnId) => void;
  onDragEndColumn: () => void;
  dragOverColumnId: WorkflowColumnId | null;
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
      onDragStartColumn={onDragStartColumn}
      onDragOverColumn={onDragOverColumn}
      onDropColumn={onDropColumn}
      onDragEndColumn={onDragEndColumn}
      isDragTarget={dragOverColumnId === filterId}
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

  const renderCustomHeaderCell = (columnId: string) => {
    const customColumnId = parseCustomWorkflowColumnId(columnId);
    const customColumn = customColumns.find((column) => column.id === customColumnId);

    return (
      <WorkflowHeaderCell
        key={columnId}
        columnId={columnId}
        onStartResize={onStartResize}
        onResetColumnWidth={onResetColumnWidth}
        onDragStartColumn={onDragStartColumn}
        onDragOverColumn={onDragOverColumn}
        onDropColumn={onDropColumn}
        onDragEndColumn={onDragEndColumn}
        isDragTarget={dragOverColumnId === columnId}
      >
        <div className="pr-2 text-[10px] font-semibold text-slate-700">
          {customColumn?.name || 'Custom'}
        </div>
      </WorkflowHeaderCell>
    );
  };

  const headerCells: Record<WorkflowColumnId, ReactNode> = {
    status: (
      <WorkflowHeaderCell
          columnId="status"
          onStartResize={onStartResize}
          onResetColumnWidth={onResetColumnWidth}
          onDragStartColumn={onDragStartColumn}
          onDragOverColumn={onDragOverColumn}
          onDropColumn={onDropColumn}
          onDragEndColumn={onDragEndColumn}
          isDragTarget={dragOverColumnId === 'status'}
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
    ),
    prep: (
      <WorkflowHeaderCell
          columnId="prep"
          onStartResize={onStartResize}
          onResetColumnWidth={onResetColumnWidth}
          onDragStartColumn={onDragStartColumn}
          onDragOverColumn={onDragOverColumn}
          onDropColumn={onDropColumn}
          onDragEndColumn={onDragEndColumn}
          isDragTarget={dragOverColumnId === 'prep'}
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
    ),
    delivery: (
      <WorkflowHeaderCell
          columnId="delivery"
          onStartResize={onStartResize}
          onResetColumnWidth={onResetColumnWidth}
          onDragStartColumn={onDragStartColumn}
          onDragOverColumn={onDragOverColumn}
          onDropColumn={onDropColumn}
          onDragEndColumn={onDragEndColumn}
          isDragTarget={dragOverColumnId === 'delivery'}
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
    ),
    record_number: renderTextFilter('record_number', 'No. / Trip', 'recordNumber', 'w-44', 'Order, client or trip no.'),
    kind: renderTextFilter('kind', 'Kind', 'kind', 'w-32', 'Kind'),
    collection_plan: renderTextFilter('collection_plan', 'Collection', 'collectionPlan', 'w-36', 'Collection'),
    reloading_plan: renderTextFilter('reloading_plan', 'Reloading', 'reloadingPlan', 'w-36', 'Reloading'),
    international_plan: renderTextFilter('international_plan', 'Intl trip', 'internationalPlan', 'w-40', 'Trip / setup'),
    company: renderTextFilter('company', 'Company', 'company', 'w-40', 'Company'),
    contact: renderTextFilter('contact', 'Contact', 'contact', 'w-40', 'Contact'),
    sender: renderTextFilter('sender', 'Sender', 'sender', 'w-36', 'Sender'),
    loading: renderTextFilter('loading', 'Loading', 'loading', 'w-44', 'Loading'),
    loading_customs: renderTextFilter('loading_customs', 'Loading customs', 'loadingCustoms', 'w-44', 'Loading customs'),
    receiver: renderTextFilter('receiver', 'Receiver', 'receiver', 'w-36', 'Receiver'),
    unloading: renderTextFilter('unloading', 'Unloading', 'unloading', 'w-44', 'Unloading'),
    unloading_customs: renderTextFilter('unloading_customs', 'Unloading customs', 'unloadingCustoms', 'w-44', 'Unloading customs'),
    cargo: renderTextFilter('cargo', 'Cargo', 'cargo', 'w-44', 'Cargo'),
    kg: renderTextFilter('kg', 'KG', 'kg', 'w-32', 'KG'),
    ldm: renderTextFilter('ldm', 'LDM', 'ldm', 'w-32', 'LDM'),
    revenue: renderTextFilter('revenue', 'Revenue', 'revenue', 'w-36', 'Revenue'),
    cost: renderTextFilter('cost', 'Cost', 'cost', 'w-36', 'Cost'),
    profit: renderTextFilter('profit', 'Profit', 'profit', 'w-36', 'Profit'),
    trip_vehicle: renderTextFilter('trip_vehicle', 'Trip / Vehicle', 'tripVehicle', 'w-44', 'Trip / Vehicle'),
  };

  return (
    <thead className="border-b bg-slate-50">
      <tr>
        {columnOrder.map((columnId) =>
          headerCells[columnId as WorkflowHeaderFilterId] ? (
            <Fragment key={columnId}>
              {headerCells[columnId as WorkflowHeaderFilterId]}
            </Fragment>
          ) : (
            renderCustomHeaderCell(columnId)
          )
        )}
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
          className="workflow-edit-input w-full rounded-md border border-sky-400 bg-white px-1 leading-none outline-none ring-1 ring-sky-200"
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
        className="workflow-edit-input w-full rounded-md border border-sky-400 bg-white px-2 leading-none outline-none ring-1 ring-sky-200"
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
  columnOrder,
  customColumns,
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
  rowStyle,
  onStartResizeRow,
  onResetRowHeight,
}: {
  row: WorkflowStandaloneRow;
  columnOrder: WorkflowColumnOrder;
  customColumns: WorkflowCustomColumn[];
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
  rowStyle?: CSSProperties;
  onStartResizeRow: (rowId: string, clientY: number) => void;
  onResetRowHeight: (rowId: string) => void;
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
          edit_kind: 'workflow_field' as const,
          record_type: 'order' as const,
          record_id: row.order_id,
          field_key: fieldKey,
        }
      : null;

  const tripFieldCell = (fieldKey: WorkflowEditableFieldKey) =>
    row.trip_id
      ? {
          row_id: row.id,
          edit_kind: 'workflow_field' as const,
          record_type: 'trip' as const,
          record_id: row.trip_id,
          field_key: fieldKey,
        }
      : null;

  const matchesEditingCell = (cell: WorkflowEditingCell | null) =>
    isSameEditingCell(cell, editingCell);

  const canEditTripOwnedField =
    allowAcknowledge && !!row.trip_editable_by_current_user && !!row.trip_id;
  const canEditOrderField = allowAcknowledge && !!row.order_id;
  const canEditTripField = allowAcknowledge && row.row_type === 'trip_row' && !!row.trip_id;
  const collectionPlanCell = buildRoutePlanEditingCell(
    row.id,
    row.order_id,
    'collection_mode'
  );
  const reloadingPlanCell = buildRoutePlanEditingCell(
    row.id,
    row.order_id,
    'reloading_mode'
  );
  const statusCell =
    row.row_type === 'trip_row' ? tripFieldCell('status') : orderFieldCell('status');
  const canEditStatus = allowAcknowledge && !!statusCell;

  const cells: Record<WorkflowColumnId, ReactNode> = {
    status: (
      <td className="group/row-resize relative px-2 py-1.5 whitespace-nowrap">
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
        <WorkflowRowResizeHandle
          onStartResize={(clientY) => onStartResizeRow(row.id, clientY)}
          onResetHeight={() => onResetRowHeight(row.id)}
        />
      </td>
    ),
    prep: (
      <td className="px-2 py-1.5 whitespace-nowrap">
        <CompactCell value={row.prep_date || '-'} />
      </td>
    ),
    delivery: (
      <td className="px-2 py-1.5 whitespace-nowrap">
        <CompactCell value={row.delivery_date || '-'} />
      </td>
    ),
    record_number: (
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
    ),
    kind: (
      <td className="px-2 py-1.5 whitespace-nowrap">
        <CompactCell value={row.kind} />
      </td>
    ),
    collection_plan: (
      <td className="px-2 py-1.5 whitespace-nowrap">
        <WorkflowDisplayCell
          value={formatWorkflowCollectionMode(row.route_plan?.collection_mode)}
          editable={canEditOrderField && !!collectionPlanCell}
          onStartEdit={
            canEditOrderField && collectionPlanCell
              ? () =>
                  onStartEdit(
                    collectionPlanCell,
                    row.route_plan?.collection_mode || 'not_set'
                  )
              : null
          }
          isEditing={matchesEditingCell(collectionPlanCell)}
          editingValue={editingValue}
          onChangeEditingValue={onChangeEditingValue}
          onSubmitEdit={onSubmitEdit}
          onCancelEdit={onCancelEdit}
          selectOptions={WORKFLOW_COLLECTION_MODE_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />
      </td>
    ),
    reloading_plan: (
      <td className="px-2 py-1.5 whitespace-nowrap">
        <WorkflowDisplayCell
          value={formatWorkflowReloadingMode(row.route_plan?.reloading_mode)}
          editable={canEditOrderField && !!reloadingPlanCell}
          onStartEdit={
            canEditOrderField && reloadingPlanCell
              ? () =>
                  onStartEdit(
                    reloadingPlanCell,
                    row.route_plan?.reloading_mode || 'not_set'
                  )
              : null
          }
          isEditing={matchesEditingCell(reloadingPlanCell)}
          editingValue={editingValue}
          onChangeEditingValue={onChangeEditingValue}
          onSubmitEdit={onSubmitEdit}
          onCancelEdit={onCancelEdit}
          selectOptions={WORKFLOW_RELOADING_MODE_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />
      </td>
    ),
    international_plan: (
      <td className="px-2 py-1.5 whitespace-nowrap">
        {row.route_plan?.international_trip_id ? (
          <button
            type="button"
            onClick={() => onOpenTrip(row.route_plan!.international_trip_id!)}
            className="block w-full text-left"
            title={formatWorkflowInternationalPlan(row.route_plan)}
          >
            <CompactCell value={formatWorkflowInternationalPlan(row.route_plan)} scrollable />
          </button>
        ) : (
          <CompactCell value={formatWorkflowInternationalPlan(row.route_plan)} scrollable />
        )}
      </td>
    ),
    company: (
      <td className="px-2 py-1.5">
        <WorkflowDisplayCell
          value={removeCompanyCode(row.company_display)}
          scrollable
        />
      </td>
    ),
    contact: (
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
    ),
    sender: (
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
    ),
    loading: (
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
    ),
    loading_customs: (
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
    ),
    receiver: (
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
    ),
    unloading: (
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
    ),
    unloading_customs: (
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
    ),
    cargo: (
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
    ),
    kg: (
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
    ),
    ldm: (
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
    ),
    revenue: (
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
    ),
    cost: (
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
    ),
    profit: (
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
    ),
    trip_vehicle: (
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
    ),
  };

  const renderCustomCell = (columnId: string) => {
    const customColumnId = parseCustomWorkflowColumnId(columnId);
    const customColumn = customColumns.find((column) => column.id === customColumnId);

    return (
      <td className="px-2 py-1.5" title={customColumn?.name || 'Custom column'}>
        <CompactCell value="-" scrollable />
      </td>
    );
  };

  return (
    <tr className="border-b hover:bg-slate-50" style={rowStyle}>
      {columnOrder.map((columnId) => (
        <Fragment key={`${row.id}-${columnId}`}>
          {cells[columnId] ?? renderCustomCell(columnId)}
        </Fragment>
      ))}
    </tr>
  );
}

function GroupageBlock({
  group,
  columnOrder,
  customColumns,
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
  onDragStartColumn,
  onDragOverColumn,
  onDropColumn,
  onDragEndColumn,
  dragOverColumnId,
  getRowStyle,
  onStartResizeRow,
  onResetRowHeight,
  editingCell,
  editingValue,
  onStartEdit,
  onChangeEditingValue,
  onSubmitEdit,
  onCancelEdit,
}: {
  group: WorkflowGroup;
  columnOrder: WorkflowColumnOrder;
  customColumns: WorkflowCustomColumn[];
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
  onDragStartColumn: (columnId: WorkflowColumnId) => void;
  onDragOverColumn: (columnId: WorkflowColumnId) => void;
  onDropColumn: (columnId: WorkflowColumnId) => void;
  onDragEndColumn: () => void;
  dragOverColumnId: WorkflowColumnId | null;
  getRowStyle: (rowId: string) => CSSProperties | undefined;
  onStartResizeRow: (rowId: string, clientY: number) => void;
  onResetRowHeight: (rowId: string) => void;
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
    edit_kind: 'workflow_field',
    record_type: 'trip',
    record_id: group.trip_id,
    field_key: fieldKey,
  });

  const groupFooterCell = (fieldKey: WorkflowEditableFieldKey): WorkflowEditingCell => ({
    row_id: group.footer.id,
    edit_kind: 'workflow_field',
    record_type: 'trip',
    record_id: group.trip_id,
    field_key: fieldKey,
  });

  const matchesEditingCell = (cell: WorkflowEditingCell | null) =>
    isSameEditingCell(cell, editingCell);

  const headerCells: Record<WorkflowColumnId, ReactNode> = {
    status: (
      <td className="group/row-resize relative px-2 py-1 whitespace-nowrap">
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
        <WorkflowRowResizeHandle
          onStartResize={(clientY) => onStartResizeRow(group.id, clientY)}
          onResetHeight={() => onResetRowHeight(group.id)}
        />
      </td>
    ),
    prep: <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>,
    delivery: <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>,
    record_number: (
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
    ),
    kind: (
      <td className="px-2 py-1 whitespace-nowrap font-medium text-amber-900">
        <CompactCell value="Groupage start" />
      </td>
    ),
    collection_plan: <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>,
    reloading_plan: <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>,
    international_plan: (
      <td className="px-2 py-1 whitespace-nowrap">
        <button
          type="button"
          onClick={() => onOpenTrip(group.trip_id)}
          className="block w-full text-left"
          title={group.trip_number}
        >
          <CompactCell value={group.trip_number} scrollable />
        </button>
      </td>
    ),
    company: (
      <td className="px-2 py-1">
        <CompactCell value={removeCompanyCode(group.carrier_display)} scrollable />
      </td>
    ),
    contact: (
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
    ),
    sender: <td className="px-2 py-1"><CompactCell value="-" /></td>,
    loading: <td className="px-2 py-1"><CompactCell value="-" /></td>,
    loading_customs: <td className="px-2 py-1"><CompactCell value="-" /></td>,
    receiver: <td className="px-2 py-1"><CompactCell value="-" /></td>,
    unloading: <td className="px-2 py-1"><CompactCell value="-" /></td>,
    unloading_customs: <td className="px-2 py-1"><CompactCell value="-" /></td>,
    cargo: (
      <td className="px-2 py-1 whitespace-nowrap">
        <CompactCell value={`${group.rows.length} orders`} />
      </td>
    ),
    kg: <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>,
    ldm: <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>,
    revenue: <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>,
    cost: (
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
    ),
    profit: <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>,
    trip_vehicle: (
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
    ),
  };

  const renderCustomBodyCell = (columnId: string) => {
    const customColumnId = parseCustomWorkflowColumnId(columnId);
    const customColumn = customColumns.find((column) => column.id === customColumnId);

    return (
      <td className="px-2 py-1" title={customColumn?.name || 'Custom column'}>
        <CompactCell value="-" scrollable />
      </td>
    );
  };

  const footerCells: Record<WorkflowColumnId, ReactNode> = {
    status: (
      <td className="group/row-resize relative px-2 py-1 whitespace-nowrap">
        <CompactCell value="-" />
        <WorkflowRowResizeHandle
          onStartResize={(clientY) => onStartResizeRow(group.footer.id, clientY)}
          onResetHeight={() => onResetRowHeight(group.footer.id)}
        />
      </td>
    ),
    prep: <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>,
    delivery: <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>,
    record_number: <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="Summary" /></td>,
    kind: <td className="px-2 py-1 whitespace-nowrap text-amber-900"><CompactCell value="Groupage end" /></td>,
    collection_plan: <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>,
    reloading_plan: <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>,
    international_plan: <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>,
    company: <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>,
    contact: <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>,
    sender: <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>,
    loading: <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>,
    loading_customs: <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>,
    receiver: <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>,
    unloading: <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>,
    unloading_customs: <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>,
    cargo: <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>,
    kg: <td className="px-2 py-1 whitespace-nowrap"><CompactCell value={formatNumberCell(group.footer.kg_value)} /></td>,
    ldm: <td className="px-2 py-1 whitespace-nowrap"><CompactCell value={formatNumberCell(group.footer.ldm_value)} /></td>,
    revenue: <td className="px-2 py-1 whitespace-nowrap"><CompactCell value={formatMoneyCell(group.footer.revenue_display)} /></td>,
    cost: (
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
    ),
    profit: (
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
    ),
    trip_vehicle: <td className="px-2 py-1 whitespace-nowrap"><CompactCell value="-" /></td>,
  };

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table
        className="w-full table-fixed text-[11px] leading-tight"
        style={{ minWidth: `${workflowTableMinWidth}px` }}
      >
        <WorkflowColGroup columnWidths={columnWidths} columnOrder={columnOrder} />
        <WorkflowTableHeader
          filters={filters}
          columnOrder={columnOrder}
          customColumns={customColumns}
          headerScope={headerScope}
          activeHeaderFilter={activeHeaderFilter}
          activeHeaderScope={activeHeaderScope}
          setActiveHeaderFilter={setActiveHeaderFilter}
          setActiveHeaderScope={setActiveHeaderScope}
          updateFilter={updateFilter}
          onStartResize={onStartResize}
          onResetColumnWidth={onResetColumnWidth}
          onDragStartColumn={onDragStartColumn}
          onDragOverColumn={onDragOverColumn}
          onDropColumn={onDropColumn}
          onDragEndColumn={onDragEndColumn}
          dragOverColumnId={dragOverColumnId}
        />
        <tbody>
          <tr
            className="border-b-2 border-amber-300 bg-amber-100/70"
            style={getRowStyle(group.id)}
          >
            {columnOrder.map((columnId) => (
              <Fragment key={`${group.id}-${columnId}`}>
                {headerCells[columnId] ?? renderCustomBodyCell(columnId)}
              </Fragment>
            ))}
          </tr>

          {group.rows.map((row) => (
            <WorkflowStandaloneRowView
              key={row.id}
              row={row}
              columnOrder={columnOrder}
              customColumns={customColumns}
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
              rowStyle={getRowStyle(row.id)}
              onStartResizeRow={onStartResizeRow}
              onResetRowHeight={onResetRowHeight}
            />
          ))}

          <tr
            className="border-t-2 border-amber-300 bg-amber-100/70 font-medium"
            style={getRowStyle(group.footer.id)}
          >
            {columnOrder.map((columnId) => (
              <Fragment key={`${group.footer.id}-${columnId}`}>
                {footerCells[columnId] ?? renderCustomBodyCell(columnId)}
              </Fragment>
            ))}
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
  const [customColumns, setCustomColumns] = useState<WorkflowCustomColumn[]>([]);
  const [filters, setFilters] = useState<WorkflowFilters>(DEFAULT_FILTERS);
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const [columnWidths, setColumnWidths] = useState<WorkflowColumnWidths>(
    DEFAULT_WORKFLOW_COLUMN_WIDTHS
  );
  const [columnWidthsHydrated, setColumnWidthsHydrated] = useState(false);
  const [columnOrder, setColumnOrder] = useState<WorkflowColumnOrder>(
    DEFAULT_WORKFLOW_COLUMN_ORDER
  );
  const [columnOrderHydrated, setColumnOrderHydrated] = useState(false);
  const [rowHeights, setRowHeights] = useState<WorkflowRowHeights>({});
  const [rowHeightHydrated, setRowHeightHydrated] = useState(false);
  const [activeHeaderFilter, setActiveHeaderFilter] =
    useState<WorkflowHeaderFilterId | null>(null);
  const [activeHeaderScope, setActiveHeaderScope] = useState<string | null>(null);
  const [resizingColumn, setResizingColumn] = useState<{
    columnId: WorkflowColumnId;
    startX: number;
    startWidth: number;
  } | null>(null);
  const [draggingColumnId, setDraggingColumnId] = useState<WorkflowColumnId | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<WorkflowColumnId | null>(null);
  const [resizingRowHeight, setResizingRowHeight] = useState<{
    rowId: string;
    startY: number;
    startHeight: number;
  } | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [selectedManagerUserId, setSelectedManagerUserId] = useState('');
  const [loadingOrganizations, setLoadingOrganizations] = useState(false);
  const [loadingManagers, setLoadingManagers] = useState(false);
  const [showCustomColumnForm, setShowCustomColumnForm] = useState(false);
  const [customColumnName, setCustomColumnName] = useState('');
  const [customColumnVisibilityScope, setCustomColumnVisibilityScope] =
    useState<'self' | 'selected_organizations'>('self');
  const [customColumnOrganizationIds, setCustomColumnOrganizationIds] = useState<string[]>([]);
  const [creatingCustomColumn, setCreatingCustomColumn] = useState(false);
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

      const parsed = JSON.parse(saved) as Record<string, unknown>;
      const nextWidths = { ...DEFAULT_WORKFLOW_COLUMN_WIDTHS } as WorkflowColumnWidths;

      for (const [columnId, rawWidth] of Object.entries(parsed)) {
        if (typeof rawWidth === 'number' && Number.isFinite(rawWidth)) {
          nextWidths[columnId] = Math.max(
            getMinWorkflowColumnWidth(columnId),
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
    if (!viewerUserId) {
      return;
    }

    try {
      const saved = window.localStorage.getItem(
        `synchub.workflow.column-order.${viewerUserId}`
      );

      if (!saved) {
        setColumnOrder(DEFAULT_WORKFLOW_COLUMN_ORDER);
      } else {
        const parsed = JSON.parse(saved) as unknown;
        if (Array.isArray(parsed)) {
          const normalized = parsed.filter(
            (value): value is WorkflowColumnId =>
              typeof value === 'string' && value.trim() !== ''
          );
          setColumnOrder(
            normalized.length > 0 ? normalized : DEFAULT_WORKFLOW_COLUMN_ORDER
          );
        } else {
          setColumnOrder(DEFAULT_WORKFLOW_COLUMN_ORDER);
        }
      }
    } catch (error) {
      console.error('Failed to hydrate workflow column order:', error);
      setColumnOrder(DEFAULT_WORKFLOW_COLUMN_ORDER);
    } finally {
      setColumnOrderHydrated(true);
    }
  }, [viewerUserId]);

  useEffect(() => {
    const availableColumnIds = [
      ...DEFAULT_WORKFLOW_COLUMN_ORDER,
      ...customColumns.map((column) => buildCustomWorkflowColumnId(column.id)),
    ];

    setColumnWidths((prev) => {
      let changed = false;
      const next: WorkflowColumnWidths = {};

      for (const columnId of availableColumnIds) {
        const existingWidth = prev[columnId];
        if (typeof existingWidth === 'number' && Number.isFinite(existingWidth)) {
          next[columnId] = Math.max(
            getMinWorkflowColumnWidth(columnId),
            Math.round(existingWidth)
          );
        } else {
          next[columnId] = getDefaultWorkflowColumnWidth(columnId);
          changed = true;
        }
      }

      if (Object.keys(prev).length !== Object.keys(next).length) {
        changed = true;
      }

      return changed ? next : prev;
    });

    setColumnOrder((prev) => {
      const normalized = prev.filter((columnId) => availableColumnIds.includes(columnId));
      const missing = availableColumnIds.filter((columnId) => !normalized.includes(columnId));
      const next = [...normalized, ...missing];

      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });
  }, [customColumns]);

  useEffect(() => {
    if (!viewerUserId || !columnOrderHydrated) {
      return;
    }

    window.localStorage.setItem(
      `synchub.workflow.column-order.${viewerUserId}`,
      JSON.stringify(columnOrder)
    );
  }, [columnOrder, columnOrderHydrated, viewerUserId]);

  useEffect(() => {
    if (!viewerUserId) {
      return;
    }

    try {
      const saved = window.localStorage.getItem(
        `synchub.workflow.row-heights.${viewerUserId}`
      );

      if (!saved) {
        setRowHeights({});
      } else {
        const parsed = JSON.parse(saved) as Record<string, unknown>;
        const nextHeights: WorkflowRowHeights = {};

        for (const [rowId, rawHeight] of Object.entries(parsed)) {
          if (typeof rawHeight === 'number' && Number.isFinite(rawHeight)) {
            nextHeights[rowId] = Math.max(
              MIN_WORKFLOW_ROW_HEIGHT,
              Math.min(MAX_WORKFLOW_ROW_HEIGHT, Math.round(rawHeight))
            );
          }
        }

        setRowHeights(nextHeights);
      }
    } catch (error) {
      console.error('Failed to hydrate workflow row heights:', error);
      setRowHeights({});
    } finally {
      setRowHeightHydrated(true);
    }
  }, [viewerUserId]);

  useEffect(() => {
    if (!viewerUserId || !rowHeightHydrated) {
      return;
    }

    window.localStorage.setItem(
      `synchub.workflow.row-heights.${viewerUserId}`,
      JSON.stringify(rowHeights)
    );
  }, [rowHeightHydrated, rowHeights, viewerUserId]);

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
      const minWidth = getMinWorkflowColumnWidth(resizingColumn.columnId);
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
    if (!resizingRowHeight) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const nextHeight = Math.max(
        MIN_WORKFLOW_ROW_HEIGHT,
        Math.min(
          MAX_WORKFLOW_ROW_HEIGHT,
          Math.round(resizingRowHeight.startHeight + (event.clientY - resizingRowHeight.startY))
        )
      );

      setRowHeights((prev) => ({
        ...prev,
        [resizingRowHeight.rowId]: nextHeight,
      }));
    };

    const handleMouseUp = () => {
      setResizingRowHeight(null);
    };

    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingRowHeight]);

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
      void fetchCustomColumns();

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

  const fetchCustomColumns = async () => {
    try {
      const res = await fetch('/api/workflow/custom-columns/list', {
        method: 'GET',
      });

      const data = (await res.json()) as WorkflowCustomColumnsResponse & {
        error?: string;
      };

      if (!res.ok) {
        toast.error(data.error || 'Failed to load custom columns');
        setCustomColumns([]);
        return;
      }

      setCustomColumns(data.custom_columns || []);
    } catch (error) {
      toast.error('Failed to load custom columns');
      setCustomColumns([]);
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

  const findCurrentRoutePlan = (orderId: string) => {
    for (const row of standaloneRows) {
      if (row.order_id === orderId) {
        return row.route_plan ?? null;
      }
    }

    for (const group of groupageGroups) {
      for (const row of group.rows) {
        if (row.order_id === orderId) {
          return row.route_plan ?? null;
        }
      }
    }

    return null;
  };

  const canAcknowledgeWorkflow =
    !!viewerUserId &&
    !!effectiveManagerUserId &&
    viewerUserId === effectiveManagerUserId;

  const workflowTableMinWidth = useMemo(
    () =>
      columnOrder.reduce(
        (sum, columnId) => sum + (columnWidths[columnId] ?? getDefaultWorkflowColumnWidth(columnId)),
        0
      ),
    [columnOrder, columnWidths]
  );

  const startColumnResize = (columnId: WorkflowColumnId, clientX: number) => {
    setActiveHeaderFilter(null);
    setActiveHeaderScope(null);
    setResizingColumn({
      columnId,
      startX: clientX,
      startWidth: columnWidths[columnId] ?? getDefaultWorkflowColumnWidth(columnId),
    });
  };

  const resetColumnWidth = (columnId: WorkflowColumnId) => {
    setColumnWidths((prev) => ({
      ...prev,
      [columnId]: getDefaultWorkflowColumnWidth(columnId),
    }));
  };

  const startColumnDrag = (columnId: WorkflowColumnId) => {
    setActiveHeaderFilter(null);
    setActiveHeaderScope(null);
    setDraggingColumnId(columnId);
    setDragOverColumnId(columnId);
  };

  const dragOverColumn = (columnId: WorkflowColumnId) => {
    if (!draggingColumnId || draggingColumnId === columnId) {
      return;
    }

    setDragOverColumnId(columnId);
  };

  const dropColumn = (targetColumnId: WorkflowColumnId) => {
    if (!draggingColumnId) {
      return;
    }

    setColumnOrder((prev) => {
      const next = [...prev];
      const fromIndex = next.indexOf(draggingColumnId);
      const toIndex = next.indexOf(targetColumnId);

      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
        return prev;
      }

      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, draggingColumnId);
      return next;
    });

    setDraggingColumnId(null);
    setDragOverColumnId(null);
  };

  const endColumnDrag = () => {
    setDraggingColumnId(null);
    setDragOverColumnId(null);
  };

  const getRowStyle = (rowId: string): CSSProperties | undefined => {
    const rowHeight = rowHeights[rowId];

    if (!rowHeight) {
      return undefined;
    }

    return {
      '--workflow-cell-height': `${rowHeight}px`,
      '--workflow-cell-font-size': rowHeight <= 22 ? '10px' : '11px',
      '--workflow-ack-icon-size': rowHeight <= 22 ? '9px' : rowHeight >= 30 ? '11px' : '10px',
      '--workflow-ack-padding': rowHeight <= 22 ? '1px' : '2px',
    } as CSSProperties;
  };

  const startRowHeightResize = (rowId: string, clientY: number) => {
    setResizingRowHeight({
      rowId,
      startY: clientY,
      startHeight: rowHeights[rowId] ?? DEFAULT_WORKFLOW_ROW_HEIGHT,
    });
  };

  const resetRowHeight = (rowId: string) => {
    setRowHeights((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
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

      const response =
        editingCell.edit_kind === 'workflow_field'
          ? await fetch('/api/workflow/field/update', {
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
            })
          : await (() => {
              const currentRoutePlan = findCurrentRoutePlan(editingCell.order_id);
              const nextCollectionMode =
                editingCell.plan_key === 'collection_mode'
                  ? editingValue
                  : currentRoutePlan?.collection_mode || 'not_set';
              const nextReloadingMode =
                editingCell.plan_key === 'reloading_mode'
                  ? editingValue
                  : currentRoutePlan?.reloading_mode || 'not_set';

              return fetch('/api/workflow/route-plan/update', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  order_id: editingCell.order_id,
                  collection_mode: nextCollectionMode,
                  reloading_mode: nextReloadingMode,
                }),
              });
            })();

      const data = await response.json();

      if (!response.ok) {
        toast.error(
          data.error ||
            (editingCell.edit_kind === 'workflow_field'
              ? 'Failed to save workflow field'
              : 'Failed to save workflow route plan')
        );
        return;
      }

      if (editingCell.edit_kind === 'workflow_field') {
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
      } else {
        const routePlanUpdate = data.route_plan as WorkflowRoutePlanUpdateResponse | undefined;

        if (routePlanUpdate) {
          setGroupageGroups((prev) =>
            prev.map((group) => ({
              ...group,
              rows: group.rows.map((row) =>
                row.order_id === editingCell.order_id
                  ? applyRoutePlanToStandaloneRow(
                      row,
                      mergeWorkflowRoutePlanForClient(row.route_plan, routePlanUpdate)
                    )
                  : row
              ),
            }))
          );
          setStandaloneRows((prev) =>
            prev.map((row) =>
              row.order_id === editingCell.order_id
                ? applyRoutePlanToStandaloneRow(
                    row,
                    mergeWorkflowRoutePlanForClient(row.route_plan, routePlanUpdate)
                  )
                : row
            )
          );
        }
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

  const toggleCustomColumnOrganization = (organizationId: string) => {
    setCustomColumnOrganizationIds((prev) =>
      prev.includes(organizationId)
        ? prev.filter((value) => value !== organizationId)
        : [...prev, organizationId]
    );
  };

  const openCreateCustomColumnForm = async () => {
    if (organizations.length === 0) {
      await fetchOrganizations();
    }

    setCustomColumnName('');
    setCustomColumnVisibilityScope('self');
    setCustomColumnOrganizationIds([]);
    setShowCustomColumnForm(true);
  };

  const createCustomColumn = async () => {
    if (!customColumnName.trim()) {
      toast.error('Column name is required');
      return;
    }

    if (
      customColumnVisibilityScope === 'selected_organizations' &&
      customColumnOrganizationIds.length === 0
    ) {
      toast.error('Select at least one organization');
      return;
    }

    try {
      setCreatingCustomColumn(true);

      const res = await fetch('/api/workflow/custom-columns/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: customColumnName,
          visibility_scope: customColumnVisibilityScope,
          organization_ids:
            customColumnVisibilityScope === 'selected_organizations'
              ? customColumnOrganizationIds
              : [],
        }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        custom_column?: WorkflowCustomColumn;
      };

      if (!res.ok || !data.custom_column) {
        toast.error(data.error || 'Failed to create custom column');
        return;
      }

      setCustomColumns((prev) => [...prev, data.custom_column!]);
      setShowCustomColumnForm(false);
      setCustomColumnName('');
      setCustomColumnVisibilityScope('self');
      setCustomColumnOrganizationIds([]);
      toast.success('Custom column created');
    } catch (error) {
      toast.error('Failed to create custom column');
    } finally {
      setCreatingCustomColumn(false);
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
        matchesText(
          formatWorkflowCollectionMode(row.route_plan?.collection_mode),
          filters.collectionPlan
        ) &&
        matchesText(
          formatWorkflowReloadingMode(row.route_plan?.reloading_mode),
          filters.reloadingPlan
        ) &&
        matchesText(
          formatWorkflowInternationalPlan(row.route_plan),
          filters.internationalPlan
        ) &&
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
        !filters.collectionPlan.trim() &&
        !filters.reloadingPlan.trim() &&
        matchesText(group.trip_number, filters.internationalPlan) &&
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
    <div className="workflow-density p-6 max-w-7xl mx-auto space-y-6">
      <style jsx global>{`
        .workflow-density {
          --workflow-cell-height: ${DEFAULT_WORKFLOW_ROW_HEIGHT}px;
          --workflow-cell-font-size: 11px;
          --workflow-ack-icon-size: 10px;
          --workflow-ack-padding: 2px;
        }

        .workflow-compact-cell {
          height: var(--workflow-cell-height);
          font-size: var(--workflow-cell-font-size);
        }

        .workflow-wrap-cell {
          white-space: pre-wrap;
          word-break: break-word;
          align-items: flex-start;
        }

        .workflow-edit-input {
          height: var(--workflow-cell-height);
          font-size: var(--workflow-cell-font-size);
        }

        .workflow-ack-button {
          padding: var(--workflow-ack-padding);
        }

        .workflow-ack-icon {
          width: var(--workflow-ack-icon-size);
          height: var(--workflow-ack-icon-size);
        }

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

            <button
              type="button"
              onClick={() => {
                void openCreateCustomColumnForm();
              }}
              className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
            >
              Add column
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

            <button
              type="button"
              onClick={() => {
                void openCreateCustomColumnForm();
              }}
              className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
            >
              Add column
            </button>
          </div>
        )}

        {showCustomColumnForm ? (
          <div className="rounded-xl border bg-slate-50 p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,220px)_180px_minmax(0,1fr)_auto] lg:items-start">
              <input
                value={customColumnName}
                onChange={(event) => setCustomColumnName(event.target.value)}
                placeholder="Column name"
                className="w-full rounded-md border bg-white px-3 py-2 text-sm"
              />

              <select
                value={customColumnVisibilityScope}
                onChange={(event) =>
                  setCustomColumnVisibilityScope(
                    event.target.value as 'self' | 'selected_organizations'
                  )
                }
                className="w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                <option value="self">Only me</option>
                <option value="selected_organizations">Selected organizations</option>
              </select>

              {customColumnVisibilityScope === 'selected_organizations' ? (
                <div className="rounded-md border bg-white p-2">
                  <div className="mb-2 text-xs font-medium text-slate-600">
                    Visible for organizations
                  </div>
                  <div className="max-h-32 space-y-2 overflow-y-auto pr-1">
                    {organizations.map((organization) => (
                      <label
                        key={organization.id}
                        className="flex items-center gap-2 text-sm text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={customColumnOrganizationIds.includes(organization.id)}
                          onChange={() =>
                            toggleCustomColumnOrganization(organization.id)
                          }
                        />
                        <span>{organization.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center rounded-md border bg-white px-3 py-2 text-sm text-slate-500">
                  Column will be visible only in your workflow.
                </div>
              )}

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void createCustomColumn();
                  }}
                  disabled={creatingCustomColumn}
                  className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {creatingCustomColumn ? 'Creating...' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCustomColumnForm(false)}
                  className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm hover:bg-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}
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
                columnOrder={columnOrder}
                customColumns={customColumns}
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
                onDragStartColumn={startColumnDrag}
                onDragOverColumn={dragOverColumn}
                onDropColumn={dropColumn}
                onDragEndColumn={endColumnDrag}
                dragOverColumnId={dragOverColumnId}
                getRowStyle={getRowStyle}
                onStartResizeRow={startRowHeightResize}
                onResetRowHeight={resetRowHeight}
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
                  <WorkflowColGroup columnWidths={columnWidths} columnOrder={columnOrder} />
                  <WorkflowTableHeader
                    filters={filters}
                    columnOrder={columnOrder}
                    customColumns={customColumns}
                    headerScope="standalone"
                    activeHeaderFilter={activeHeaderFilter}
                    activeHeaderScope={activeHeaderScope}
                    setActiveHeaderFilter={setActiveHeaderFilter}
                    setActiveHeaderScope={setActiveHeaderScope}
                    updateFilter={updateFilter}
                    onStartResize={startColumnResize}
                    onResetColumnWidth={resetColumnWidth}
                    onDragStartColumn={startColumnDrag}
                    onDragOverColumn={dragOverColumn}
                    onDropColumn={dropColumn}
                    onDragEndColumn={endColumnDrag}
                    dragOverColumnId={dragOverColumnId}
                  />
                  <tbody>
                    {filteredData.rows.map((row) => (
                      <WorkflowStandaloneRowView
                        key={row.id}
                        row={row}
                        columnOrder={columnOrder}
                        customColumns={customColumns}
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
                        rowStyle={getRowStyle(row.id)}
                        onStartResizeRow={startRowHeightResize}
                        onResetRowHeight={resetRowHeight}
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
