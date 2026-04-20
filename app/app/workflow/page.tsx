'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { WorkflowEditableFieldKey } from '@/lib/constants/workflow-fields';

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

function WorkflowTableHeader() {
  return (
    <thead className="border-b bg-slate-50">
      <tr>
        <th className="w-[82px] px-2 py-2 text-left font-semibold text-slate-700">Status</th>
        <th className="w-[82px] px-2 py-2 text-left font-semibold text-slate-700">Prep</th>
        <th className="w-[82px] px-2 py-2 text-left font-semibold text-slate-700">Delivery</th>
        <th className="w-[170px] px-2 py-2 text-left font-semibold text-slate-700">No. / Trip</th>
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
}) {
  if (isEditing) {
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
  group: WorkflowGroup;
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

  const canEditTripField =
    allowAcknowledge && !!group.trip_editable_by_current_user;

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
  const [search, setSearch] = useState('');
  const [hydrated, setHydrated] = useState(false);
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

      setEditingCell(null);
      setEditingValue('');

      await fetchWorkflow(
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
