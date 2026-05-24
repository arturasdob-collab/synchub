import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  isElevatedLinkingUser,
  loadCurrentLinkingProfile,
} from '@/lib/server/order-trip-linking';
import {
  loadCargoVisibleOrderIds,
  loadCargoVisibleTripIds,
} from '@/lib/server/cargo-legs';
import { CARGO_LEG_TYPE_LABELS, type CargoLegType } from '@/lib/constants/cargo-leg-types';
import {
  buildWorkflowFieldCompositeKey,
  loadWorkflowFieldReceiptsForUser,
  loadWorkflowFieldUpdates,
} from '@/lib/server/workflow-field-updates';
import type { WorkflowEditableFieldKey, WorkflowRecordType } from '@/lib/constants/workflow-fields';
import {
  buildDerivedWorkflowRoutePlan,
  loadWorkflowRoutePlans,
  mergeWorkflowRoutePlan,
} from '@/lib/server/workflow-route-plans';
import {
  buildWorkflowScheduleValue,
  formatWorkflowScheduleSummary,
  parseWorkflowScheduleValueText,
} from '@/lib/utils/workflow-schedule';

type ServiceSupabase = any;

type WorkflowFieldState = {
  update_id: string;
  record_type: WorkflowRecordType;
  record_id: string;
  field_key: WorkflowEditableFieldKey;
  value_text: string | null;
  revision: number;
  pending_ack: boolean;
  acknowledged: boolean;
  updated_by_current_user: boolean;
  has_override: boolean;
};

type WorkflowVisibilityMode = 'full' | 'route';

const orderSelect = `
  id,
  organization_id,
  created_by,
  internal_order_number,
  client_order_number,
  status,
  loading_date,
  loading_time_from,
  loading_time_to,
  loading_address,
  loading_city,
  loading_postal_code,
  loading_country,
  loading_reference,
  loading_customs_info,
  unloading_date,
  unloading_time_from,
  unloading_time_to,
  unloading_address,
  unloading_city,
  unloading_postal_code,
  unloading_country,
  unloading_reference,
  unloading_customs_info,
  shipper_name,
  consignee_name,
  received_from_name,
  received_from_contact,
  cargo_description,
  cargo_quantity,
  cargo_kg,
  cargo_ldm,
  price,
  currency,
  created_at,
  updated_at,
  client:client_company_id (
    name,
    company_code
  ),
  created_by_user:created_by (
    first_name,
    last_name
  )
`;

const tripSelect = `
  id,
  organization_id,
  created_by,
  trip_number,
  status,
  is_groupage,
  groupage_responsible_manager_id,
  truck_plate,
  trailer_plate,
  driver_name,
  price,
  created_at,
  updated_at,
  carrier:carrier_company_id (
    name,
    company_code
  ),
  created_by_user:created_by (
    first_name,
    last_name
  )
`;

function formatCompanyDisplayName(
  company: { name: string | null; company_code: string | null } | null
) {
  if (!company?.name) return '-';

  return company.company_code ? `${company.name} (${company.company_code})` : company.name;
}

function formatLocationSummary(parts: Array<string | null | undefined>) {
  const normalized = parts
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value !== '');

  return normalized.length > 0 ? normalized.join(', ') : '-';
}

function formatExtraInfo(parts: Array<string | null | undefined>) {
  const normalized = parts
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value !== '');

  return normalized.length > 0 ? normalized.join(' / ') : '-';
}

function formatPerson(
  person:
    | {
        first_name: string | null;
        last_name: string | null;
      }
    | null
    | undefined
) {
  if (!person) return '-';

  const value = `${person.first_name || ''} ${person.last_name || ''}`.trim();
  return value || '-';
}

function buildVehicleSummary(trip: any) {
  const values = [trip?.driver_name, trip?.truck_plate, trip?.trailer_plate]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value !== '');

  return values.length > 0 ? values.join(' / ') : '-';
}

function buildCargoSummary(order: any) {
  const values = [
    typeof order?.cargo_description === 'string' ? order.cargo_description.trim() : '',
    typeof order?.cargo_quantity === 'string' && order.cargo_quantity.trim() !== ''
      ? order.cargo_quantity.trim()
      : '',
  ].filter((value) => value !== '');

  return values.length > 0 ? values.join(' / ') : '-';
}

function formatMoney(value: number | null | undefined, currency = 'EUR') {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }

  return `${value} ${currency}`;
}

function formatNumericValue(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }

  return `${value}`;
}

function parseNumericText(value: string | null | undefined) {
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

function isFinishedWorkflowStatus(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().toLowerCase() === 'finished';
}

function buildWorkflowFieldState(params: {
  updates: Map<string, any>;
  receipts: Map<string, any>;
  currentUserId: string;
  recordType: WorkflowRecordType;
  recordId: string | null | undefined;
  fieldKey: WorkflowEditableFieldKey;
}) {
  if (!params.recordId) {
    return null;
  }

  const update = params.updates.get(
    buildWorkflowFieldCompositeKey({
      recordType: params.recordType,
      recordId: params.recordId,
      fieldKey: params.fieldKey,
    })
  );

  if (!update) {
    return null;
  }

  const receipt = params.receipts.get(update.id);
  const updatedByCurrentUser = update.updated_by === params.currentUserId;
  const acknowledged =
    updatedByCurrentUser ||
    ((receipt?.seen_revision as number | undefined) ?? 0) >= update.revision;

  return {
    update_id: update.id,
    record_type: params.recordType,
    record_id: params.recordId,
    field_key: params.fieldKey,
    value_text: update.value_text,
    revision: update.revision,
    pending_ack: !acknowledged,
    acknowledged,
    updated_by_current_user: updatedByCurrentUser,
    has_override: true,
  } satisfies WorkflowFieldState;
}

async function loadVisibleOrderAccessForManager(
  serviceSupabase: ServiceSupabase,
  managerUserId: string,
  organizationId: string
) {
  const [createdOrdersResponse, sharedOrdersResponse] = await Promise.all([
    serviceSupabase.from('orders').select('id').eq('created_by', managerUserId),
    serviceSupabase
      .from('order_manager_shares')
      .select('order_id')
      .eq('shared_organization_id', organizationId)
      .eq('manager_user_id', managerUserId),
  ]);

  if (createdOrdersResponse.error || sharedOrdersResponse.error) {
    throw new Error(
      createdOrdersResponse.error?.message ||
        sharedOrdersResponse.error?.message ||
        'Failed to load workflow orders'
    );
  }

  const accessById = new Map<string, WorkflowVisibilityMode>();

  for (const row of createdOrdersResponse.data || []) {
    if ((row as any).id) {
      accessById.set((row as any).id, 'full');
    }
  }

  for (const row of sharedOrdersResponse.data || []) {
    if ((row as any).order_id) {
      accessById.set((row as any).order_id, 'full');
    }
  }

  const cargoVisibleOrderIds = await loadCargoVisibleOrderIds(
    serviceSupabase,
    managerUserId,
    organizationId
  );

  for (const id of cargoVisibleOrderIds) {
    if (!accessById.has(id)) {
      accessById.set(id, 'route');
    }
  }

  return accessById;
}

async function loadVisibleTripAccessForManager(
  serviceSupabase: ServiceSupabase,
  managerUserId: string,
  organizationId: string
) {
  const [createdTripsResponse, sharedTripsResponse] = await Promise.all([
    serviceSupabase.from('trips').select('id').eq('created_by', managerUserId),
    serviceSupabase
      .from('trip_manager_shares')
      .select('trip_id')
      .eq('shared_organization_id', organizationId)
      .eq('manager_user_id', managerUserId),
  ]);

  if (createdTripsResponse.error || sharedTripsResponse.error) {
    throw new Error(
      createdTripsResponse.error?.message ||
        sharedTripsResponse.error?.message ||
        'Failed to load workflow trips'
    );
  }

  const accessById = new Map<string, WorkflowVisibilityMode>();

  for (const row of createdTripsResponse.data || []) {
    if ((row as any).id) {
      accessById.set((row as any).id, 'full');
    }
  }

  for (const row of sharedTripsResponse.data || []) {
    if ((row as any).trip_id) {
      accessById.set((row as any).trip_id, 'full');
    }
  }

  const cargoVisibleTripIds = await loadCargoVisibleTripIds(
    serviceSupabase,
    managerUserId,
    organizationId
  );

  for (const id of cargoVisibleTripIds) {
    if (!accessById.has(id)) {
      accessById.set(id, 'route');
    }
  }

  return accessById;
}

async function loadOrdersByIds(serviceSupabase: ServiceSupabase, orderIds: string[]) {
  if (orderIds.length === 0) {
    return [];
  }

  const { data, error } = await serviceSupabase
    .from('orders')
    .select(orderSelect)
    .in('id', orderIds);

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

async function loadTripsByIds(serviceSupabase: ServiceSupabase, tripIds: string[]) {
  if (tripIds.length === 0) {
    return [];
  }

  const { data, error } = await serviceSupabase
    .from('trips')
    .select(tripSelect)
    .in('id', tripIds);

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

async function loadOrderTripLinks(
  serviceSupabase: ServiceSupabase,
  orderIds: string[],
  tripIds: string[]
) {
  const linkMap = new Map<string, any>();

  if (orderIds.length > 0) {
    const { data, error } = await serviceSupabase
      .from('order_trip_links')
      .select('id, order_id, trip_id')
      .in('order_id', orderIds);

    if (error) {
      throw new Error(error.message);
    }

    for (const row of data || []) {
      linkMap.set((row as any).id, row);
    }
  }

  if (tripIds.length > 0) {
    const { data, error } = await serviceSupabase
      .from('order_trip_links')
      .select('id, order_id, trip_id')
      .in('trip_id', tripIds);

    if (error) {
      throw new Error(error.message);
    }

    for (const row of data || []) {
      linkMap.set((row as any).id, row);
    }
  }

  return Array.from(linkMap.values());
}

async function loadCargoLegTypesByOrderTripLinkId(
  serviceSupabase: ServiceSupabase,
  orderTripLinkIds: string[]
) {
  const cargoLegsByOrderTripLinkId = new Map<
    string,
    Array<{
      id: string;
      leg_order: number | null;
      leg_type: string;
      responsible_organization_id: string | null;
      responsible_organization_name: string | null;
      responsible_warehouse_name: string | null;
      linked_trip_number: string | null;
      linked_trip_carrier_name: string | null;
      linked_trip_manager_name: string | null;
      linked_trip_vehicle: string | null;
      linked_trip_price: number | null;
      execution_transport_price: number | null;
      execution_transport_price_currency: 'EUR' | 'PLN';
    }>
  >();

  if (orderTripLinkIds.length === 0) {
    return cargoLegsByOrderTripLinkId;
  }

  const { data, error } = await serviceSupabase
    .from('cargo_legs')
    .select(
      `
      id,
      order_trip_link_id,
      leg_order,
      leg_type,
      responsible_organization_id,
      responsible_organization:responsible_organization_id (
        name
      ),
      responsible_warehouse:responsible_warehouse_id (
        name
      ),
      linked_trip:linked_trip_id (
        trip_number,
        price,
        driver_name,
        truck_plate,
        trailer_plate,
        carrier:carrier_company_id (
          name
        ),
        created_by_user:created_by (
          first_name,
          last_name
        )
      ),
      execution_detail:cargo_leg_execution_details (
        transport_price,
        transport_price_currency,
        truck_plate,
        trailer_plate,
        driver_name
      )
    `
    )
    .in('order_trip_link_id', orderTripLinkIds);

  if (error) {
    throw new Error(error.message);
  }

  for (const row of data || []) {
    if (
      !(row as any).id ||
      !(row as any).order_trip_link_id ||
      typeof (row as any).leg_type !== 'string'
    ) {
      continue;
    }

    const key = (row as any).order_trip_link_id as string;
    const current = cargoLegsByOrderTripLinkId.get(key) || [];
    const responsibleOrganization = Array.isArray((row as any).responsible_organization)
      ? (row as any).responsible_organization[0] ?? null
      : (row as any).responsible_organization;
    const responsibleWarehouse = Array.isArray((row as any).responsible_warehouse)
      ? (row as any).responsible_warehouse[0] ?? null
      : (row as any).responsible_warehouse;
    const linkedTrip = Array.isArray((row as any).linked_trip)
      ? (row as any).linked_trip[0] ?? null
      : (row as any).linked_trip;
    const linkedTripCarrier = Array.isArray(linkedTrip?.carrier)
      ? linkedTrip?.carrier?.[0] ?? null
      : linkedTrip?.carrier;
    const linkedTripCreatedByUser = Array.isArray(linkedTrip?.created_by_user)
      ? linkedTrip?.created_by_user?.[0] ?? null
      : linkedTrip?.created_by_user;
    const executionDetail = Array.isArray((row as any).execution_detail)
      ? (row as any).execution_detail[0] ?? null
      : (row as any).execution_detail;
    const executionVehicleSummary =
      [
        executionDetail?.driver_name,
        executionDetail?.truck_plate,
        executionDetail?.trailer_plate,
      ]
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value !== '')
        .join(' / ') || null;
    current.push({
      id: (row as any).id as string,
      leg_order:
        typeof (row as any).leg_order === 'number' && Number.isFinite((row as any).leg_order)
          ? ((row as any).leg_order as number)
          : null,
      leg_type: (row as any).leg_type as string,
      responsible_organization_id:
        typeof (row as any).responsible_organization_id === 'string'
          ? ((row as any).responsible_organization_id as string)
          : null,
      responsible_organization_name:
        typeof responsibleOrganization?.name === 'string' ? responsibleOrganization.name : null,
      responsible_warehouse_name:
        typeof responsibleWarehouse?.name === 'string' ? responsibleWarehouse.name : null,
      linked_trip_number:
        typeof linkedTrip?.trip_number === 'string' ? linkedTrip.trip_number : null,
      linked_trip_carrier_name:
        typeof linkedTripCarrier?.name === 'string' ? linkedTripCarrier.name : null,
      linked_trip_manager_name:
        typeof linkedTripCreatedByUser === 'object' && linkedTripCreatedByUser
          ? `${linkedTripCreatedByUser.first_name || ''} ${linkedTripCreatedByUser.last_name || ''}`.trim() || null
          : null,
      linked_trip_vehicle:
        executionVehicleSummary ||
        [linkedTrip?.driver_name, linkedTrip?.truck_plate, linkedTrip?.trailer_plate]
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .filter((value) => value !== '')
          .join(' / ') || null,
      linked_trip_price:
        typeof linkedTrip?.price === 'number' && Number.isFinite(linkedTrip.price)
          ? linkedTrip.price
          : null,
      execution_transport_price:
        typeof executionDetail?.transport_price === 'number' &&
        Number.isFinite(executionDetail.transport_price)
          ? executionDetail.transport_price
          : null,
      execution_transport_price_currency:
        executionDetail?.transport_price_currency === 'PLN' ? 'PLN' : 'EUR',
    });
    cargoLegsByOrderTripLinkId.set(key, current);
  }

  return cargoLegsByOrderTripLinkId;
}

function buildRouteStepSummary(step: {
  leg_type: string;
  responsible_organization_name: string | null;
  responsible_warehouse_name: string | null;
  linked_trip_number: string | null;
  linked_trip_carrier_name: string | null;
  linked_trip_manager_name: string | null;
  linked_trip_vehicle?: string | null;
}) {
  if (step.leg_type === 'international_trip') {
    return [
      step.linked_trip_carrier_name || step.responsible_organization_name || '-',
      step.linked_trip_manager_name || '-',
      step.linked_trip_number || '-',
    ]
      .filter((value) => !!value && value !== '-')
      .join(' / ') || '-';
  }

  if (step.leg_type === 'collection') {
    const vehicleSummary =
      typeof step.linked_trip_vehicle === 'string' ? step.linked_trip_vehicle.trim() : '';
    const carrierName =
      typeof step.linked_trip_carrier_name === 'string'
        ? step.linked_trip_carrier_name.trim()
        : '';
    const organizationName =
      typeof step.responsible_organization_name === 'string'
        ? step.responsible_organization_name.trim()
        : '';

    return vehicleSummary || carrierName || organizationName || '-';
  }

  const location = step.responsible_warehouse_name || step.responsible_organization_name || '-';
  const trip = step.linked_trip_number || '-';
  return `${location} / ${trip}`;
}

function buildWorkflowRouteStepDisplayMap(
  cargoLegs: Array<{
    id: string;
    leg_order: number | null;
    leg_type: string;
    responsible_organization_id: string | null;
    responsible_organization_name: string | null;
    responsible_warehouse_name: string | null;
    linked_trip_number: string | null;
    linked_trip_carrier_name: string | null;
    linked_trip_manager_name: string | null;
    linked_trip_vehicle: string | null;
    linked_trip_price: number | null;
    execution_transport_price: number | null;
    execution_transport_price_currency: 'EUR' | 'PLN';
  }>
) {
  const sortedLegs = [...cargoLegs].sort(
    (left, right) =>
      (typeof left.leg_order === 'number' ? left.leg_order : Number.MAX_SAFE_INTEGER) -
      (typeof right.leg_order === 'number' ? right.leg_order : Number.MAX_SAFE_INTEGER)
  );
  const internationalIndex = sortedLegs.findIndex(
    (cargoLeg) => cargoLeg.leg_type === 'international_trip'
  );
  const collectionLeg =
    sortedLegs.find((cargoLeg) => cargoLeg.leg_type === 'collection') || null;
  const internationalLeg =
    sortedLegs.find((cargoLeg) => cargoLeg.leg_type === 'international_trip') || null;
  const reloadingBeforeLeg =
    internationalIndex >= 0
      ? sortedLegs.find(
          (cargoLeg, index) => cargoLeg.leg_type === 'reloading' && index < internationalIndex
        ) || null
      : sortedLegs.find((cargoLeg) => cargoLeg.leg_type === 'reloading') || null;
  const reloadingAfterLeg =
    internationalIndex >= 0
      ? sortedLegs.find(
          (cargoLeg, index) => cargoLeg.leg_type === 'reloading' && index > internationalIndex
        ) || null
      : null;
  const distributionLeg =
    internationalIndex >= 0
      ? sortedLegs.find(
          (cargoLeg, index) => cargoLeg.leg_type === 'delivery' && index > internationalIndex
        ) || null
      : sortedLegs.find((cargoLeg) => cargoLeg.leg_type === 'delivery') || null;

  const createDisplay = (
    cargoLeg:
        | {
            id: string;
            responsible_organization_id: string | null;
            responsible_organization_name: string | null;
            responsible_warehouse_name: string | null;
            linked_trip_number: string | null;
            leg_type: string;
            linked_trip_carrier_name: string | null;
            linked_trip_manager_name: string | null;
            linked_trip_vehicle: string | null;
            linked_trip_price: number | null;
            execution_transport_price: number | null;
            execution_transport_price_currency: 'EUR' | 'PLN';
          }
      | null
  ) =>
    cargoLeg
      ? {
          cargo_leg_id: cargoLeg.id,
          responsible_organization_id: cargoLeg.responsible_organization_id,
          organization_name: cargoLeg.responsible_organization_name,
          warehouse_name: cargoLeg.responsible_warehouse_name,
          linked_trip_number: cargoLeg.linked_trip_number,
          linked_trip_vehicle: cargoLeg.linked_trip_vehicle,
          linked_trip_price: cargoLeg.linked_trip_price,
          execution_transport_price: cargoLeg.execution_transport_price,
          execution_transport_price_currency: cargoLeg.execution_transport_price_currency,
          summary: buildRouteStepSummary(cargoLeg),
        }
      : null;

  return {
    collection: createDisplay(collectionLeg),
    reloading_before: createDisplay(reloadingBeforeLeg),
    international: createDisplay(internationalLeg),
    reloading_after: createDisplay(reloadingAfterLeg),
    distribution: createDisplay(distributionLeg),
  };
}

function buildOrderRow(params: {
  order: any;
  effectiveOrganizationId: string;
  sourceOrganizationMap: Map<string, { name: string | null }>;
  linkedTrip: any | null;
  currentUserId: string;
  visibilityMode?: WorkflowVisibilityMode;
  kind?: 'Order' | 'Groupage cargo';
  routePlan?: {
    collection_mode: string;
    reloading_mode: string;
    distribution_mode: string;
    post_international_reloading_mode: string;
    international_trip_id: string | null;
    international_trip_number: string | null;
    setup_status: string;
  } | null;
  routeSteps?: {
    collection: {
      cargo_leg_id: string;
      responsible_organization_id: string | null;
      organization_name: string | null;
      warehouse_name: string | null;
      linked_trip_number: string | null;
      linked_trip_vehicle: string | null;
      linked_trip_price: number | null;
      execution_transport_price: number | null;
      execution_transport_price_currency: 'EUR' | 'PLN';
      summary: string;
    } | null;
    reloading_before: {
      cargo_leg_id: string;
      responsible_organization_id: string | null;
      organization_name: string | null;
      warehouse_name: string | null;
      linked_trip_number: string | null;
      linked_trip_vehicle: string | null;
      linked_trip_price: number | null;
      execution_transport_price: number | null;
      execution_transport_price_currency: 'EUR' | 'PLN';
      summary: string;
    } | null;
    international: {
      cargo_leg_id: string;
      responsible_organization_id: string | null;
      organization_name: string | null;
      warehouse_name: string | null;
      linked_trip_number: string | null;
      linked_trip_vehicle: string | null;
      linked_trip_price: number | null;
      execution_transport_price: number | null;
      execution_transport_price_currency: 'EUR' | 'PLN';
      summary: string;
    } | null;
    reloading_after: {
      cargo_leg_id: string;
      responsible_organization_id: string | null;
      organization_name: string | null;
      warehouse_name: string | null;
      linked_trip_number: string | null;
      linked_trip_vehicle: string | null;
      linked_trip_price: number | null;
      execution_transport_price: number | null;
      execution_transport_price_currency: 'EUR' | 'PLN';
      summary: string;
    } | null;
    distribution: {
      cargo_leg_id: string;
      responsible_organization_id: string | null;
      organization_name: string | null;
      warehouse_name: string | null;
      linked_trip_number: string | null;
      linked_trip_vehicle: string | null;
      linked_trip_price: number | null;
      execution_transport_price: number | null;
      execution_transport_price_currency: 'EUR' | 'PLN';
      summary: string;
    } | null;
  } | null;
}) {
  const {
    order,
    effectiveOrganizationId,
    sourceOrganizationMap,
    linkedTrip,
    currentUserId,
  } = params;
  const client = Array.isArray(order.client) ? order.client[0] ?? null : order.client;
  const createdByUser = Array.isArray(order.created_by_user)
    ? order.created_by_user[0] ?? null
    : order.created_by_user;
  const fullVisibility = params.visibilityMode !== 'route';
  const sameOrganization =
    fullVisibility && order.organization_id === effectiveOrganizationId;
  const sourceOrganization = order.organization_id
    ? sourceOrganizationMap.get(order.organization_id) ?? null
    : null;
  const companyDisplay = sameOrganization
    ? formatCompanyDisplayName(client)
    : fullVisibility
      ? sourceOrganization?.name || '-'
      : sourceOrganization?.name || '-';
  const contactDisplay = sameOrganization
    ? formatExtraInfo([order.received_from_name, order.received_from_contact])
    : fullVisibility
      ? formatPerson(createdByUser)
      : formatPerson(createdByUser);
  const revenueValue = sameOrganization && fullVisibility ? order.price ?? null : null;
  const costValue =
    params.visibilityMode === 'route'
      ? params.routeSteps?.collection?.execution_transport_price ?? null
      : fullVisibility &&
          linkedTrip &&
          !linkedTrip.is_groupage &&
          linkedTrip.organization_id === effectiveOrganizationId
        ? linkedTrip.price ?? null
        : null;
  const costCurrency =
    params.visibilityMode === 'route'
      ? params.routeSteps?.collection?.execution_transport_price_currency ?? 'EUR'
      : 'EUR';
  const profitValue =
    revenueValue !== null && costValue !== null ? revenueValue - costValue : null;

  return {
    row_type: 'order_row' as const,
    id: `order-${order.id}`,
    order_id: order.id,
    trip_id: linkedTrip?.id ?? null,
    status: order.status ?? null,
    prep_date: order.loading_date ?? null,
    prep_time_from: order.loading_time_from ?? null,
    prep_time_to: order.loading_time_to ?? null,
    prep_display: formatWorkflowScheduleSummary(
      buildWorkflowScheduleValue({
        date: order.loading_date,
        time_from: order.loading_time_from,
        time_to: order.loading_time_to,
      })
    ),
    delivery_date: order.unloading_date ?? null,
    delivery_time_from: order.unloading_time_from ?? null,
    delivery_time_to: order.unloading_time_to ?? null,
    delivery_display: formatWorkflowScheduleSummary(
      buildWorkflowScheduleValue({
        date: order.unloading_date,
        time_from: order.unloading_time_from,
        time_to: order.unloading_time_to,
      })
    ),
    record_number: order.internal_order_number ?? '-',
    client_order_number: order.client_order_number ?? null,
    kind: params.kind || 'Order',
    company_display: companyDisplay,
    contact_display: contactDisplay,
    shipper_name: order.shipper_name ?? '-',
    loading_display: formatLocationSummary([
      order.loading_address,
      order.loading_city,
      order.loading_postal_code,
      order.loading_country,
    ]),
    loading_extra: formatExtraInfo([order.loading_reference]),
    loading_customs_display: formatExtraInfo([order.loading_customs_info]),
    consignee_name: order.consignee_name ?? '-',
    unloading_display: formatLocationSummary([
      order.unloading_address,
      order.unloading_city,
      order.unloading_postal_code,
      order.unloading_country,
    ]),
    unloading_extra: formatExtraInfo([order.unloading_reference]),
    unloading_customs_display: formatExtraInfo([order.unloading_customs_info]),
    cargo_display: buildCargoSummary(order),
    cargo_kg: order.cargo_kg ?? null,
    kg_display: formatNumericValue(order.cargo_kg),
    cargo_ldm: order.cargo_ldm ?? null,
    ldm_display: formatNumericValue(order.cargo_ldm),
    revenue_value: revenueValue,
    revenue_display: formatMoney(revenueValue, order.currency ?? 'EUR'),
    cost_value: costValue,
    cost_display: formatMoney(costValue, costCurrency),
    profit_value: profitValue,
    profit_display: formatMoney(profitValue, 'EUR'),
    trip_display: linkedTrip?.trip_number ?? '-',
    trip_status: linkedTrip?.status ?? null,
    vehicle_display:
      params.visibilityMode === 'route'
        ? params.routeSteps?.collection?.linked_trip_vehicle || '-'
        : linkedTrip
          ? buildVehicleSummary(linkedTrip)
          : '-',
    open_order_id: order.id,
    open_trip_id: linkedTrip?.id ?? null,
    field_states: {},
    trip_editable_by_current_user:
      !!linkedTrip?.id && linkedTrip?.created_by === currentUserId,
    route_plan: params.routePlan ?? null,
    route_steps: params.routeSteps ?? null,
    visibility_mode: params.visibilityMode ?? 'full',
  };
}

function buildTripRow(params: {
  trip: any;
  effectiveOrganizationId: string;
  relatedOrder: any | null;
  sourceOrganizationMap: Map<string, { name: string | null }>;
  currentUserId: string;
  routePlan?: {
    collection_mode: string;
    reloading_mode: string;
    distribution_mode: string;
    post_international_reloading_mode: string;
    international_trip_id: string | null;
    international_trip_number: string | null;
    setup_status: string;
  } | null;
}) {
  const {
    trip,
    effectiveOrganizationId,
    relatedOrder,
    sourceOrganizationMap,
    currentUserId,
  } = params;
  const carrier = Array.isArray(trip.carrier) ? trip.carrier[0] ?? null : trip.carrier;
  const createdByUser = Array.isArray(trip.created_by_user)
    ? trip.created_by_user[0] ?? null
    : trip.created_by_user;
  const companyDisplay = formatCompanyDisplayName(carrier);
  const contactDisplay = formatPerson(createdByUser);
  const revenueValue =
    relatedOrder && relatedOrder.organization_id === effectiveOrganizationId
      ? relatedOrder.price ?? null
      : null;
  const costValue =
    trip.organization_id === effectiveOrganizationId ? trip.price ?? null : null;
  const profitValue =
    revenueValue !== null && costValue !== null ? revenueValue - costValue : null;

  return {
    row_type: 'trip_row' as const,
    id: `trip-${trip.id}`,
    order_id: relatedOrder?.id ?? null,
    trip_id: trip.id,
    status: trip.status ?? null,
    prep_date: relatedOrder?.loading_date ?? null,
    prep_time_from: relatedOrder?.loading_time_from ?? null,
    prep_time_to: relatedOrder?.loading_time_to ?? null,
    prep_display: formatWorkflowScheduleSummary(
      buildWorkflowScheduleValue({
        date: relatedOrder?.loading_date ?? null,
        time_from: relatedOrder?.loading_time_from ?? null,
        time_to: relatedOrder?.loading_time_to ?? null,
      })
    ),
    delivery_date: relatedOrder?.unloading_date ?? null,
    delivery_time_from: relatedOrder?.unloading_time_from ?? null,
    delivery_time_to: relatedOrder?.unloading_time_to ?? null,
    delivery_display: formatWorkflowScheduleSummary(
      buildWorkflowScheduleValue({
        date: relatedOrder?.unloading_date ?? null,
        time_from: relatedOrder?.unloading_time_from ?? null,
        time_to: relatedOrder?.unloading_time_to ?? null,
      })
    ),
    record_number: trip.trip_number ?? '-',
    client_order_number: relatedOrder?.client_order_number ?? null,
    kind: trip.is_groupage ? 'Groupage' : 'Trip',
    company_display: companyDisplay,
    contact_display: contactDisplay,
    shipper_name: relatedOrder?.shipper_name ?? '-',
    loading_display: relatedOrder
      ? formatLocationSummary([
          relatedOrder.loading_address,
          relatedOrder.loading_city,
          relatedOrder.loading_postal_code,
          relatedOrder.loading_country,
        ])
      : '-',
    loading_extra: relatedOrder
      ? formatExtraInfo([relatedOrder.loading_reference])
      : '-',
    loading_customs_display: relatedOrder
      ? formatExtraInfo([relatedOrder.loading_customs_info])
      : '-',
    consignee_name: relatedOrder?.consignee_name ?? '-',
    unloading_display: relatedOrder
      ? formatLocationSummary([
          relatedOrder.unloading_address,
          relatedOrder.unloading_city,
          relatedOrder.unloading_postal_code,
          relatedOrder.unloading_country,
        ])
      : '-',
    unloading_extra: relatedOrder
      ? formatExtraInfo([relatedOrder.unloading_reference])
      : '-',
    unloading_customs_display: relatedOrder
      ? formatExtraInfo([relatedOrder.unloading_customs_info])
      : '-',
    cargo_display: relatedOrder ? buildCargoSummary(relatedOrder) : '-',
    cargo_kg: relatedOrder?.cargo_kg ?? null,
    kg_display: formatNumericValue(relatedOrder?.cargo_kg ?? null),
    cargo_ldm: relatedOrder?.cargo_ldm ?? null,
    ldm_display: formatNumericValue(relatedOrder?.cargo_ldm ?? null),
    revenue_value: revenueValue,
    revenue_display: formatMoney(revenueValue, relatedOrder?.currency ?? 'EUR'),
    cost_value: costValue,
    cost_display: formatMoney(costValue, 'EUR'),
    profit_value: profitValue,
    profit_display: formatMoney(profitValue, 'EUR'),
    trip_display: trip.trip_number ?? '-',
    trip_status: trip.status ?? null,
    vehicle_display: buildVehicleSummary(trip),
    open_order_id: relatedOrder?.id ?? null,
    open_trip_id: trip.id,
    field_states: {},
    trip_editable_by_current_user: trip.created_by === currentUserId,
    source_organization_name:
      relatedOrder?.organization_id && relatedOrder.organization_id !== effectiveOrganizationId
        ? sourceOrganizationMap.get(relatedOrder.organization_id)?.name || '-'
        : null,
    route_plan: params.routePlan ?? null,
  };
}

export async function GET(req: NextRequest) {
  const cookieStore = cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const profile = await loadCurrentLinkingProfile(serviceSupabase, user.id);
    const viewerIsElevated = isElevatedLinkingUser(profile);
    const requestedOrganizationId =
      typeof req.nextUrl.searchParams.get('organizationId') === 'string'
        ? req.nextUrl.searchParams.get('organizationId')!.trim()
        : '';
    const requestedManagerUserId =
      typeof req.nextUrl.searchParams.get('managerUserId') === 'string'
        ? req.nextUrl.searchParams.get('managerUserId')!.trim()
        : '';
    const effectiveOrganizationId = viewerIsElevated
      ? requestedOrganizationId || (profile.organization_id as string)
      : (profile.organization_id as string);
    const effectiveManagerUserId = viewerIsElevated ? requestedManagerUserId : user.id;

    if (viewerIsElevated && !effectiveManagerUserId) {
      return NextResponse.json({
        viewer_user_id: user.id,
        viewer_is_elevated: true,
        current_organization_id: profile.organization_id,
        effective_organization_id: effectiveOrganizationId,
        effective_manager_user_id: '',
        manager_name: '',
        groupage_groups: [],
        standalone_rows: [],
      });
    }

    const { data: effectiveManager, error: effectiveManagerError } = await serviceSupabase
      .from('user_profiles')
      .select('id, organization_id, first_name, last_name, disabled')
      .eq('id', effectiveManagerUserId)
      .single();

    if (
      effectiveManagerError ||
      !effectiveManager ||
      effectiveManager.organization_id !== effectiveOrganizationId ||
      effectiveManager.disabled === true
    ) {
      return NextResponse.json(
        { error: 'Selected manager not found in organization' },
        { status: 400 }
      );
    }

    const [visibleOrderAccess, visibleTripAccess] = await Promise.all([
      loadVisibleOrderAccessForManager(
        serviceSupabase,
        effectiveManagerUserId,
        effectiveOrganizationId
      ),
      loadVisibleTripAccessForManager(
        serviceSupabase,
        effectiveManagerUserId,
        effectiveOrganizationId
      ),
    ]);

    const visibleOrderIds = Array.from(visibleOrderAccess.keys());
    const visibleTripIds = Array.from(visibleTripAccess.keys());

    const visibleOrderIdSet = new Set(visibleOrderIds);
    const visibleTripIdSet = new Set(visibleTripIds);

    const [baseOrders, baseTrips, orderTripLinks] = await Promise.all([
      loadOrdersByIds(serviceSupabase, visibleOrderIds),
      loadTripsByIds(serviceSupabase, visibleTripIds),
      loadOrderTripLinks(serviceSupabase, visibleOrderIds, visibleTripIds),
    ]);

    const orderMap = new Map<string, any>();
    for (const order of baseOrders) {
      orderMap.set((order as any).id, order);
    }

    const tripMap = new Map<string, any>();
    for (const trip of baseTrips) {
      tripMap.set((trip as any).id, trip);
    }

    const linkedTripIds = Array.from(
      new Set(
        orderTripLinks
          .map((link: any) => link.trip_id as string | null)
          .filter((value: unknown): value is string => typeof value === 'string' && value !== '')
      )
    ).filter((tripId) => !tripMap.has(tripId));

    const linkedTrips = await loadTripsByIds(serviceSupabase, linkedTripIds);
    for (const trip of linkedTrips) {
      tripMap.set((trip as any).id, trip);
    }

    const linkedOrderIds = Array.from(
      new Set(
        orderTripLinks
          .map((link: any) => link.order_id as string | null)
          .filter((value: unknown): value is string => typeof value === 'string' && value !== '')
      )
    ).filter((orderId) => !orderMap.has(orderId));

    const linkedOrders = await loadOrdersByIds(serviceSupabase, linkedOrderIds);
    for (const order of linkedOrders) {
      orderMap.set((order as any).id, order);
    }

    const workflowRoutePlans = await loadWorkflowRoutePlans(
      serviceSupabase,
      Array.from(orderMap.keys())
    );
    const cargoLegPlansByOrderTripLinkId = await loadCargoLegTypesByOrderTripLinkId(
      serviceSupabase,
      orderTripLinks
        .map((link: any) => (typeof link?.id === 'string' ? link.id : ''))
        .filter((value: string) => value !== '')
    );

    const sourceOrganizationIds = Array.from(
      new Set(
        Array.from(orderMap.values())
          .map((order: any) => order.organization_id as string | null)
          .filter((value: unknown): value is string => typeof value === 'string' && value !== '')
      )
    );

    const sourceOrganizationMap = new Map<string, { name: string | null }>();

    if (sourceOrganizationIds.length > 0) {
      const { data: sourceOrganizations, error: sourceOrganizationsError } =
        await serviceSupabase
          .from('organizations')
          .select('id, name')
          .in('id', sourceOrganizationIds);

      if (sourceOrganizationsError) {
        return NextResponse.json(
          { error: sourceOrganizationsError.message },
          { status: 500 }
        );
      }

      for (const organization of sourceOrganizations || []) {
        sourceOrganizationMap.set((organization as any).id, {
          name: (organization as any).name ?? null,
        });
      }
    }

    let orderFieldUpdates = new Map<string, any>();
    let tripFieldUpdates = new Map<string, any>();
    let workflowReceipts = new Map<string, any>();

    try {
      [orderFieldUpdates, tripFieldUpdates] = await Promise.all([
        loadWorkflowFieldUpdates(serviceSupabase, {
          recordType: 'order',
          recordIds: Array.from(orderMap.keys()),
        }),
        loadWorkflowFieldUpdates(serviceSupabase, {
          recordType: 'trip',
          recordIds: Array.from(tripMap.keys()),
        }),
      ]);

      workflowReceipts = await loadWorkflowFieldReceiptsForUser(serviceSupabase, {
        fieldUpdateIds: [
          ...Array.from(orderFieldUpdates.values()).map((update) => update.id),
          ...Array.from(tripFieldUpdates.values()).map((update) => update.id),
        ],
        userId: user.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';

      if (
        message.includes('workflow_field_updates') ||
        message.includes('workflow_field_update_receipts')
      ) {
        orderFieldUpdates = new Map<string, any>();
        tripFieldUpdates = new Map<string, any>();
        workflowReceipts = new Map<string, any>();
      } else {
        throw error;
      }
    }

    const getWorkflowFieldState = (
      recordType: WorkflowRecordType,
      recordId: string | null | undefined,
      fieldKey: WorkflowEditableFieldKey
    ) =>
      buildWorkflowFieldState({
        updates: recordType === 'order' ? orderFieldUpdates : tripFieldUpdates,
        receipts: workflowReceipts,
        currentUserId: user.id,
        recordType,
        recordId,
        fieldKey,
      });

    const applyOrderWorkflowStatesToRow = (row: any) => {
      const nextRow = { ...row, field_states: { ...(row.field_states || {}) } };
      const orderRecordId = row.order_id as string | null;

      const statusState = getWorkflowFieldState('order', orderRecordId, 'status');
      if (statusState) {
        nextRow.status = statusState.value_text || nextRow.status || 'active';
        nextRow.field_states.status = statusState;
      }

      const prepState = getWorkflowFieldState('order', orderRecordId, 'prep');
      if (prepState) {
        const prepSchedule = parseWorkflowScheduleValueText(prepState.value_text);
        nextRow.prep_date = prepSchedule?.date ?? null;
        nextRow.prep_time_from = prepSchedule?.time_from ?? null;
        nextRow.prep_time_to = prepSchedule?.time_to ?? null;
        nextRow.prep_display = formatWorkflowScheduleSummary(prepSchedule);
        nextRow.field_states.prep = prepState;
      }

      const deliveryState = getWorkflowFieldState('order', orderRecordId, 'delivery');
      if (deliveryState) {
        const deliverySchedule = parseWorkflowScheduleValueText(deliveryState.value_text);
        nextRow.delivery_date = deliverySchedule?.date ?? null;
        nextRow.delivery_time_from = deliverySchedule?.time_from ?? null;
        nextRow.delivery_time_to = deliverySchedule?.time_to ?? null;
        nextRow.delivery_display = formatWorkflowScheduleSummary(deliverySchedule);
        nextRow.field_states.delivery = deliveryState;
      }

      const contactState = getWorkflowFieldState('order', orderRecordId, 'contact');
      if (contactState && row.visibility_mode !== 'route') {
        nextRow.contact_display = contactState.value_text || '-';
        nextRow.field_states.contact = contactState;
      }

      const senderState = getWorkflowFieldState('order', orderRecordId, 'sender');
      if (senderState) {
        nextRow.shipper_name = senderState.value_text || '-';
        nextRow.field_states.sender = senderState;
      }

      const loadingState = getWorkflowFieldState('order', orderRecordId, 'loading');
      if (loadingState) {
        nextRow.loading_display = loadingState.value_text || '-';
        nextRow.loading_extra = '';
        nextRow.field_states.loading = loadingState;
      }

      const loadingCustomsState = getWorkflowFieldState(
        'order',
        orderRecordId,
        'loading_customs'
      );
      if (loadingCustomsState) {
        nextRow.loading_customs_display = loadingCustomsState.value_text || '-';
        nextRow.field_states.loading_customs = loadingCustomsState;
      }

      const receiverState = getWorkflowFieldState('order', orderRecordId, 'receiver');
      if (receiverState) {
        nextRow.consignee_name = receiverState.value_text || '-';
        nextRow.field_states.receiver = receiverState;
      }

      const unloadingState = getWorkflowFieldState('order', orderRecordId, 'unloading');
      if (unloadingState) {
        nextRow.unloading_display = unloadingState.value_text || '-';
        nextRow.unloading_extra = '';
        nextRow.field_states.unloading = unloadingState;
      }

      const unloadingCustomsState = getWorkflowFieldState(
        'order',
        orderRecordId,
        'unloading_customs'
      );
      if (unloadingCustomsState) {
        nextRow.unloading_customs_display = unloadingCustomsState.value_text || '-';
        nextRow.field_states.unloading_customs = unloadingCustomsState;
      }

      const cargoState = getWorkflowFieldState('order', orderRecordId, 'cargo');
      if (cargoState) {
        nextRow.cargo_display = cargoState.value_text || '-';
        nextRow.field_states.cargo = cargoState;
      }

      const kgState = getWorkflowFieldState('order', orderRecordId, 'kg');
      if (kgState) {
        nextRow.kg_display = kgState.value_text || '-';
        nextRow.cargo_kg = parseNumericText(kgState.value_text);
        nextRow.field_states.kg = kgState;
      }

      const ldmState = getWorkflowFieldState('order', orderRecordId, 'ldm');
      if (ldmState) {
        nextRow.ldm_display = ldmState.value_text || '-';
        nextRow.cargo_ldm = parseNumericText(ldmState.value_text);
        nextRow.field_states.ldm = ldmState;
      }

      const revenueState = getWorkflowFieldState('order', orderRecordId, 'revenue');
      if (revenueState) {
        nextRow.revenue_display = revenueState.value_text || '-';
        nextRow.revenue_value = parseNumericText(revenueState.value_text);
        nextRow.field_states.revenue = revenueState;
      }

      const profitState = getWorkflowFieldState('order', orderRecordId, 'profit');
      if (profitState) {
        nextRow.profit_display = profitState.value_text || '-';
        nextRow.profit_value = parseNumericText(profitState.value_text);
        nextRow.field_states.profit = profitState;
      }

      return nextRow;
    };

    const applyTripWorkflowStatesToRow = (
      row: any,
      options?: {
        includeStatus?: boolean;
        includeContact?: boolean;
        includeCost?: boolean;
        includeProfit?: boolean;
        includeTripVehicle?: boolean;
      }
    ) => {
      const nextRow = { ...row, field_states: { ...(row.field_states || {}) } };
      const tripRecordId = row.trip_id as string | null;
      const isRouteVisibility = row.visibility_mode === 'route';

      const statusState =
        options?.includeStatus
          ? getWorkflowFieldState('trip', tripRecordId, 'status')
          : null;
      if (statusState) {
        nextRow.status = statusState.value_text || nextRow.status || 'active';
        nextRow.trip_status =
          statusState.value_text || nextRow.trip_status || nextRow.status || 'active';
        nextRow.field_states.status = statusState;
      }

      const contactState =
        options?.includeContact
          ? getWorkflowFieldState('trip', tripRecordId, 'contact')
          : null;
      if (contactState) {
        nextRow.contact_display = contactState.value_text || '-';
        nextRow.field_states.contact = contactState;
      }

      const prepState = isRouteVisibility
        ? null
        : getWorkflowFieldState('trip', tripRecordId, 'prep');
      if (prepState) {
        const prepSchedule = parseWorkflowScheduleValueText(prepState.value_text);
        nextRow.prep_date = prepSchedule?.date ?? null;
        nextRow.prep_time_from = prepSchedule?.time_from ?? null;
        nextRow.prep_time_to = prepSchedule?.time_to ?? null;
        nextRow.prep_display = formatWorkflowScheduleSummary(prepSchedule);
        nextRow.field_states.prep = prepState;
      }

      const deliveryState = isRouteVisibility
        ? null
        : getWorkflowFieldState('trip', tripRecordId, 'delivery');
      if (deliveryState) {
        const deliverySchedule = parseWorkflowScheduleValueText(deliveryState.value_text);
        nextRow.delivery_date = deliverySchedule?.date ?? null;
        nextRow.delivery_time_from = deliverySchedule?.time_from ?? null;
        nextRow.delivery_time_to = deliverySchedule?.time_to ?? null;
        nextRow.delivery_display = formatWorkflowScheduleSummary(deliverySchedule);
        nextRow.field_states.delivery = deliveryState;
      }

      const costState =
        !isRouteVisibility && options?.includeCost
          ? getWorkflowFieldState('trip', tripRecordId, 'cost')
          : null;
      if (costState) {
        nextRow.cost_display = costState.value_text || '-';
        nextRow.cost_value = parseNumericText(costState.value_text);
        nextRow.field_states.cost = costState;
      }

      const tripVehicleState =
        !isRouteVisibility && options?.includeTripVehicle
          ? getWorkflowFieldState('trip', tripRecordId, 'trip_vehicle')
          : null;
      if (tripVehicleState) {
        nextRow.vehicle_display = tripVehicleState.value_text || '-';
        nextRow.field_states.trip_vehicle = tripVehicleState;
      }

      const profitState =
        options?.includeProfit
          ? getWorkflowFieldState('trip', tripRecordId, 'profit')
          : null;
      if (profitState) {
        nextRow.profit_display = profitState.value_text || '-';
        nextRow.profit_value = parseNumericText(profitState.value_text);
        nextRow.field_states.profit = profitState;
      }

      return nextRow;
    };

    const linksByOrderId = new Map<string, any[]>();
    const linksByTripId = new Map<string, any[]>();

    for (const link of orderTripLinks) {
      if ((link as any).order_id) {
        const current = linksByOrderId.get((link as any).order_id) || [];
        current.push(link);
        linksByOrderId.set((link as any).order_id, current);
      }

      if ((link as any).trip_id) {
        const current = linksByTripId.get((link as any).trip_id) || [];
        current.push(link);
        linksByTripId.set((link as any).trip_id, current);
      }
    }

    const buildRoutePlanForOrder = (params: {
      orderId: string;
      linkedTrip: any | null;
      orderTripLinksForOrder: any[];
    }) => {
      const storedPlan = workflowRoutePlans.get(params.orderId) || null;
      const cargoLegs = params.orderTripLinksForOrder.flatMap((link: any) =>
        cargoLegPlansByOrderTripLinkId.get(link.id as string) || []
      );

      return mergeWorkflowRoutePlan({
        storedPlan,
        derivedPlan: buildDerivedWorkflowRoutePlan({
          linkedTripId: params.linkedTrip?.id ?? null,
          cargoLegs,
        }),
        linkedTripId: params.linkedTrip?.id ?? null,
        linkedTripNumber: params.linkedTrip?.trip_number ?? null,
        linkedTripIsGroupage: params.linkedTrip?.is_groupage ?? null,
      });
    };

    const buildRouteStepsForOrder = (params: {
      orderTripLinksForOrder: any[];
    }) => {
      const cargoLegs = params.orderTripLinksForOrder.flatMap((link: any) =>
        cargoLegPlansByOrderTripLinkId.get(link.id as string) || []
      );

      return buildWorkflowRouteStepDisplayMap(cargoLegs);
    };

    const routeLinkedTripIds = new Set<string>();
    const tripIdByNumber = new Map<string, string>();

    for (const trip of Array.from(tripMap.values())) {
      const tripNumber =
        typeof trip?.trip_number === 'string' ? trip.trip_number.trim() : '';

      if (!tripNumber || trip?.is_groupage || !trip?.id) {
        continue;
      }

      tripIdByNumber.set(tripNumber, trip.id as string);
    }

    for (const cargoLegs of Array.from(cargoLegPlansByOrderTripLinkId.values())) {
      for (const cargoLeg of cargoLegs) {
        const linkedTripNumber =
          typeof cargoLeg.linked_trip_number === 'string'
            ? cargoLeg.linked_trip_number.trim()
            : '';

        if (!linkedTripNumber) {
          continue;
        }

        const linkedTripId = tripIdByNumber.get(linkedTripNumber);

        if (!linkedTripId) {
          continue;
        }

        routeLinkedTripIds.add(linkedTripId);
      }
    }

    const groupageTrips = Array.from(tripMap.values())
      .filter((trip: any) => trip?.is_groupage && linksByTripId.has(trip.id))
      .sort((left: any, right: any) =>
        String(left.trip_number || '').localeCompare(String(right.trip_number || ''))
      );

    const ordersInGroupageSet = new Set<string>();
    const groupageGroups = groupageTrips.map((trip: any) => {
      const groupageOwnerUserId =
        (typeof trip.groupage_responsible_manager_id === 'string' &&
        trip.groupage_responsible_manager_id.trim() !== ''
          ? trip.groupage_responsible_manager_id
          : null) || trip.created_by || null;

      if (groupageOwnerUserId !== effectiveManagerUserId) {
        return null;
      }

      const childLinks = linksByTripId.get(trip.id) || [];
      const childOrders = childLinks
        .map((link: any) => orderMap.get(link.order_id))
        .filter(Boolean)
        .sort((left: any, right: any) =>
          String(left.internal_order_number || '').localeCompare(
            String(right.internal_order_number || '')
          )
        );

      for (const order of childOrders) {
        ordersInGroupageSet.add(order.id as string);
      }

      const rows = childOrders.map((order: any) =>
        applyTripWorkflowStatesToRow(
          applyOrderWorkflowStatesToRow(
            buildOrderRow({
              order,
              effectiveOrganizationId,
              sourceOrganizationMap,
              linkedTrip: trip,
              currentUserId: user.id,
              visibilityMode: 'full',
              kind: 'Groupage cargo',
              routePlan: buildRoutePlanForOrder({
                orderId: order.id as string,
                linkedTrip: trip,
                orderTripLinksForOrder: (linksByOrderId.get(order.id) || []).filter(
                  (link: any) => link.trip_id === trip.id
                ),
              }),
              routeSteps: buildRouteStepsForOrder({
                orderTripLinksForOrder: (linksByOrderId.get(order.id) || []).filter(
                  (link: any) => link.trip_id === trip.id
                ),
              }),
            })
          ),
          {
            includeCost: true,
            includeTripVehicle: true,
          }
        )
      );
      const visibleRows = rows.filter((row: any) => !isFinishedWorkflowStatus(row.status));

      const tripCostValue =
        trip.organization_id === effectiveOrganizationId ? trip.price ?? null : null;
      const createdByUser = Array.isArray(trip.created_by_user)
        ? trip.created_by_user[0] ?? null
        : trip.created_by_user;
      const carrier = Array.isArray(trip.carrier) ? trip.carrier[0] ?? null : trip.carrier;
      const groupContactState = getWorkflowFieldState('trip', trip.id, 'contact');
      const groupStatusState = getWorkflowFieldState('trip', trip.id, 'status');
      const groupPrepState = getWorkflowFieldState('trip', trip.id, 'prep');
      const groupDeliveryState = getWorkflowFieldState('trip', trip.id, 'delivery');
      const groupCostState = getWorkflowFieldState('trip', trip.id, 'cost');
      const groupTripVehicleState = getWorkflowFieldState('trip', trip.id, 'trip_vehicle');
      const groupProfitState = getWorkflowFieldState('trip', trip.id, 'profit');
      const groupPrepSchedule = parseWorkflowScheduleValueText(groupPrepState?.value_text);
      const groupDeliverySchedule = parseWorkflowScheduleValueText(
        groupDeliveryState?.value_text
      );

      const effectiveGroupCostDisplay = groupCostState?.value_text || formatMoney(tripCostValue, 'EUR');
      const effectiveGroupCostValue =
        groupCostState?.value_text !== null && groupCostState?.value_text !== undefined
          ? parseNumericText(groupCostState.value_text)
          : tripCostValue;
      const effectiveRevenueValue = visibleRows.reduce((sum: number | null, row: any) => {
        const value = parseNumericText(row.revenue_display);
        if (value === null) {
          return null;
        }

        return (sum ?? 0) + value;
      }, 0);
      const effectiveKgValue = visibleRows.reduce(
        (sum: number, row: any) => sum + (parseNumericText(row.kg_display) ?? 0),
        0
      );
      const effectiveLdmValue = visibleRows.reduce(
        (sum: number, row: any) => sum + (parseNumericText(row.ldm_display) ?? 0),
        0
      );
      const effectiveProfitDisplay =
        groupProfitState?.value_text ||
        formatMoney(
          effectiveRevenueValue !== null && effectiveGroupCostValue !== null
            ? effectiveRevenueValue - effectiveGroupCostValue
            : null,
          'EUR'
        );

      if (isFinishedWorkflowStatus(groupStatusState?.value_text || (trip.status ?? null))) {
        return null;
      }

      if (visibleRows.length === 0) {
        return null;
      }

      return {
        id: `groupage-${trip.id}`,
        trip_id: trip.id,
        trip_number: trip.trip_number ?? '-',
        trip_status: groupStatusState?.value_text || (trip.status ?? null),
        prep_date: groupPrepSchedule?.date ?? null,
        prep_time_from: groupPrepSchedule?.time_from ?? null,
        prep_time_to: groupPrepSchedule?.time_to ?? null,
        prep_display: formatWorkflowScheduleSummary(groupPrepSchedule),
        delivery_date: groupDeliverySchedule?.date ?? null,
        delivery_time_from: groupDeliverySchedule?.time_from ?? null,
        delivery_time_to: groupDeliverySchedule?.time_to ?? null,
        delivery_display: formatWorkflowScheduleSummary(groupDeliverySchedule),
        carrier_display: formatCompanyDisplayName(carrier),
        responsible_display: groupContactState?.value_text || formatPerson(createdByUser),
        vehicle_display: groupTripVehicleState?.value_text || buildVehicleSummary(trip),
        cost_value: effectiveGroupCostValue,
        cost_display: effectiveGroupCostDisplay,
        field_states: {
          ...(groupStatusState ? { status: groupStatusState } : {}),
          ...(groupPrepState ? { prep: groupPrepState } : {}),
          ...(groupDeliveryState ? { delivery: groupDeliveryState } : {}),
          ...(groupContactState ? { contact: groupContactState } : {}),
          ...(groupCostState ? { cost: groupCostState } : {}),
          ...(groupTripVehicleState ? { trip_vehicle: groupTripVehicleState } : {}),
        },
        trip_editable_by_current_user: trip.created_by === user.id,
        rows: visibleRows,
        footer: {
          id: `groupage-footer-${trip.id}`,
          kg_value: effectiveKgValue,
          kg_display: formatNumericValue(effectiveKgValue),
          ldm_value: effectiveLdmValue,
          ldm_display: formatNumericValue(effectiveLdmValue),
          revenue_value: effectiveRevenueValue,
          revenue_display: formatMoney(effectiveRevenueValue, 'EUR'),
          cost_value: effectiveGroupCostValue,
          cost_display: effectiveGroupCostDisplay,
          profit_value:
            groupProfitState?.value_text !== null && groupProfitState?.value_text !== undefined
              ? parseNumericText(groupProfitState.value_text)
              : effectiveRevenueValue !== null && effectiveGroupCostValue !== null
                ? effectiveRevenueValue - effectiveGroupCostValue
                : null,
          profit_display: effectiveProfitDisplay,
          field_states: {
            ...(groupCostState ? { cost: groupCostState } : {}),
            ...(groupProfitState ? { profit: groupProfitState } : {}),
          },
        },
      };
    }).filter(Boolean);

    const standaloneRows: any[] = [];

    const standaloneOrders = Array.from(visibleOrderIdSet)
      .map((orderId) => orderMap.get(orderId))
      .filter(Boolean)
      .filter((order: any) => {
        const linkedTrip = (linksByOrderId.get(order.id) || [])
          .map((link: any) => tripMap.get(link.trip_id))
          .find(Boolean) || null;

        if (!linkedTrip?.is_groupage) {
          return true;
        }

        const groupageOwnerUserId =
          (typeof linkedTrip.groupage_responsible_manager_id === 'string' &&
          linkedTrip.groupage_responsible_manager_id.trim() !== ''
            ? linkedTrip.groupage_responsible_manager_id
            : null) || linkedTrip.created_by || null;

        if (groupageOwnerUserId === effectiveManagerUserId) {
          return false;
        }

        if (linkedTrip.created_by === effectiveManagerUserId) {
          return false;
        }

        if (order.created_by === effectiveManagerUserId) {
          return true;
        }

        return (visibleOrderAccess.get(order.id as string) || 'full') === 'route';
      })
      .filter((order: any) => !ordersInGroupageSet.has(order.id))
      .sort((left: any, right: any) =>
        String(left.internal_order_number || '').localeCompare(
          String(right.internal_order_number || '')
        )
      );

    const representedTripIds = new Set<string>();

    for (const order of standaloneOrders) {
      const linkedTrip = (linksByOrderId.get(order.id) || [])
        .map((link: any) => tripMap.get(link.trip_id))
        .find(Boolean) || null;

      if (linkedTrip?.id) {
        representedTripIds.add(linkedTrip.id);
      }

      const row = applyTripWorkflowStatesToRow(
        applyOrderWorkflowStatesToRow(
          buildOrderRow({
            order,
            effectiveOrganizationId,
            sourceOrganizationMap,
            linkedTrip,
            currentUserId: user.id,
            visibilityMode: visibleOrderAccess.get(order.id as string) || 'full',
            routePlan: buildRoutePlanForOrder({
              orderId: order.id as string,
              linkedTrip,
              orderTripLinksForOrder: linksByOrderId.get(order.id) || [],
            }),
            routeSteps: buildRouteStepsForOrder({
              orderTripLinksForOrder: linksByOrderId.get(order.id) || [],
            }),
          })
        ),
        {
          includeStatus: false,
          includeCost: true,
          includeTripVehicle: true,
        }
      );

      if (!isFinishedWorkflowStatus(row.status)) {
        standaloneRows.push(row);
      }
    }

    const standaloneTrips = Array.from(visibleTripIdSet)
      .map((tripId) => tripMap.get(tripId))
      .filter(Boolean)
      .filter((trip: any) => {
        if (!trip.is_groupage) {
          return true;
        }

        const groupageOwnerUserId =
          (typeof trip.groupage_responsible_manager_id === 'string' &&
          trip.groupage_responsible_manager_id.trim() !== ''
            ? trip.groupage_responsible_manager_id
            : null) || trip.created_by || null;

        return (
          groupageOwnerUserId !== effectiveManagerUserId &&
          trip.created_by === effectiveManagerUserId
        );
      })
      .filter((trip: any) => {
        if (trip.is_groupage) {
          return true;
        }

        if (routeLinkedTripIds.has(trip.id as string)) {
          return false;
        }

        return !representedTripIds.has(trip.id);
      })
      .sort((left: any, right: any) =>
        String(left.trip_number || '').localeCompare(String(right.trip_number || ''))
      );

    for (const trip of standaloneTrips) {
      const firstLinkedOrder = (linksByTripId.get(trip.id) || [])
        .map((link: any) => orderMap.get(link.order_id))
        .find(Boolean) || null;
      const relatedOrder = trip.is_groupage ? null : firstLinkedOrder;

      const row = applyTripWorkflowStatesToRow(
        applyOrderWorkflowStatesToRow(
          buildTripRow({
            trip,
            effectiveOrganizationId,
            relatedOrder,
            sourceOrganizationMap,
            currentUserId: user.id,
            routePlan:
              relatedOrder
                ? buildRoutePlanForOrder({
                    orderId: relatedOrder.id as string,
                    linkedTrip: trip,
                    orderTripLinksForOrder: (linksByOrderId.get(relatedOrder.id) || []).filter(
                      (link: any) => link.trip_id === trip.id
                    ),
                  })
                : null,
          })
        ),
        {
          includeStatus: true,
          includeContact: true,
          includeCost: true,
          includeProfit: true,
          includeTripVehicle: true,
        }
      );

      if (!isFinishedWorkflowStatus(row.status)) {
        standaloneRows.push(row);
      }
    }

    standaloneRows.sort((left, right) =>
      String(left.record_number || '').localeCompare(String(right.record_number || ''))
    );

    return NextResponse.json({
      viewer_user_id: user.id,
      viewer_is_elevated: viewerIsElevated,
      current_organization_id: profile.organization_id,
      effective_organization_id: effectiveOrganizationId,
      effective_manager_user_id: effectiveManagerUserId,
      manager_name: `${effectiveManager.first_name || ''} ${effectiveManager.last_name || ''}`.trim(),
      groupage_groups: groupageGroups,
      standalone_rows: standaloneRows,
      cargo_leg_type_labels: CARGO_LEG_TYPE_LABELS as Record<CargoLegType, string>,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load workflow' },
      { status: 500 }
    );
  }
}
