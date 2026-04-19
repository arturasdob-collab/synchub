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

type ServiceSupabase = any;

const orderSelect = `
  id,
  organization_id,
  created_by,
  internal_order_number,
  client_order_number,
  status,
  loading_date,
  loading_address,
  loading_city,
  loading_postal_code,
  loading_country,
  loading_reference,
  loading_customs_info,
  unloading_date,
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

async function loadVisibleOrderIdsForManager(
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

  const ids = new Set<string>();

  for (const row of createdOrdersResponse.data || []) {
    if ((row as any).id) {
      ids.add((row as any).id);
    }
  }

  for (const row of sharedOrdersResponse.data || []) {
    if ((row as any).order_id) {
      ids.add((row as any).order_id);
    }
  }

  const cargoVisibleOrderIds = await loadCargoVisibleOrderIds(
    serviceSupabase,
    managerUserId,
    organizationId
  );

  for (const id of cargoVisibleOrderIds) {
    ids.add(id);
  }

  return Array.from(ids);
}

async function loadVisibleTripIdsForManager(
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

  const ids = new Set<string>();

  for (const row of createdTripsResponse.data || []) {
    if ((row as any).id) {
      ids.add((row as any).id);
    }
  }

  for (const row of sharedTripsResponse.data || []) {
    if ((row as any).trip_id) {
      ids.add((row as any).trip_id);
    }
  }

  const cargoVisibleTripIds = await loadCargoVisibleTripIds(
    serviceSupabase,
    managerUserId,
    organizationId
  );

  for (const id of cargoVisibleTripIds) {
    ids.add(id);
  }

  return Array.from(ids);
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

function buildOrderRow(params: {
  order: any;
  effectiveOrganizationId: string;
  sourceOrganizationMap: Map<string, { name: string | null }>;
  linkedTrip: any | null;
  kind?: 'Order' | 'Groupage cargo';
}) {
  const { order, effectiveOrganizationId, sourceOrganizationMap, linkedTrip } = params;
  const client = Array.isArray(order.client) ? order.client[0] ?? null : order.client;
  const createdByUser = Array.isArray(order.created_by_user)
    ? order.created_by_user[0] ?? null
    : order.created_by_user;
  const sameOrganization = order.organization_id === effectiveOrganizationId;
  const sourceOrganization = order.organization_id
    ? sourceOrganizationMap.get(order.organization_id) ?? null
    : null;
  const companyDisplay = sameOrganization
    ? formatCompanyDisplayName(client)
    : sourceOrganization?.name || '-';
  const contactDisplay = sameOrganization
    ? formatExtraInfo([order.received_from_name, order.received_from_contact])
    : formatPerson(createdByUser);
  const revenueValue = sameOrganization ? order.price ?? null : null;
  const costValue =
    linkedTrip &&
    !linkedTrip.is_groupage &&
    linkedTrip.organization_id === effectiveOrganizationId
      ? linkedTrip.price ?? null
      : null;
  const profitValue =
    revenueValue !== null && costValue !== null ? revenueValue - costValue : null;

  return {
    row_type: 'order_row' as const,
    id: `order-${order.id}`,
    order_id: order.id,
    trip_id: linkedTrip?.id ?? null,
    status: order.status ?? null,
    prep_date: order.loading_date ?? null,
    delivery_date: order.unloading_date ?? null,
    record_number: order.internal_order_number ?? '-',
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
    cargo_ldm: order.cargo_ldm ?? null,
    revenue_value: revenueValue,
    revenue_display: formatMoney(revenueValue, order.currency ?? 'EUR'),
    cost_value: costValue,
    cost_display: formatMoney(costValue, 'EUR'),
    profit_value: profitValue,
    profit_display: formatMoney(profitValue, 'EUR'),
    trip_display: linkedTrip?.trip_number ?? '-',
    trip_status: linkedTrip?.status ?? null,
    vehicle_display: linkedTrip ? buildVehicleSummary(linkedTrip) : '-',
    open_order_id: order.id,
    open_trip_id: linkedTrip?.id ?? null,
  };
}

function buildTripRow(params: {
  trip: any;
  effectiveOrganizationId: string;
  relatedOrder: any | null;
  sourceOrganizationMap: Map<string, { name: string | null }>;
}) {
  const { trip, effectiveOrganizationId, relatedOrder, sourceOrganizationMap } = params;
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
    delivery_date: relatedOrder?.unloading_date ?? null,
    record_number: trip.trip_number ?? '-',
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
    cargo_ldm: relatedOrder?.cargo_ldm ?? null,
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
    source_organization_name:
      relatedOrder?.organization_id && relatedOrder.organization_id !== effectiveOrganizationId
        ? sourceOrganizationMap.get(relatedOrder.organization_id)?.name || '-'
        : null,
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

    const [visibleOrderIds, visibleTripIds] = await Promise.all([
      loadVisibleOrderIdsForManager(
        serviceSupabase,
        effectiveManagerUserId,
        effectiveOrganizationId
      ),
      loadVisibleTripIdsForManager(
        serviceSupabase,
        effectiveManagerUserId,
        effectiveOrganizationId
      ),
    ]);

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

    const groupageTrips = Array.from(tripMap.values())
      .filter((trip: any) => trip?.is_groupage && linksByTripId.has(trip.id))
      .sort((left: any, right: any) =>
        String(left.trip_number || '').localeCompare(String(right.trip_number || ''))
      );

    const ordersInGroupageSet = new Set<string>();
    const groupageGroups = groupageTrips.map((trip: any) => {
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
        buildOrderRow({
          order,
          effectiveOrganizationId,
          sourceOrganizationMap,
          linkedTrip: trip,
          kind: 'Groupage cargo',
        })
      );

      const allRevenueVisible = childOrders.every(
        (order: any) => order.organization_id === effectiveOrganizationId
      );
      const totalRevenueValue = allRevenueVisible
        ? childOrders.reduce(
            (sum: number, order: any) => sum + (Number(order.price) || 0),
            0
          )
        : null;
      const totalKgValue = childOrders.reduce(
        (sum: number, order: any) => sum + (Number(order.cargo_kg) || 0),
        0
      );
      const totalLdmValue = childOrders.reduce(
        (sum: number, order: any) => sum + (Number(order.cargo_ldm) || 0),
        0
      );
      const tripCostValue =
        trip.organization_id === effectiveOrganizationId ? trip.price ?? null : null;
      const profitValue =
        totalRevenueValue !== null && tripCostValue !== null
          ? totalRevenueValue - tripCostValue
          : null;
      const createdByUser = Array.isArray(trip.created_by_user)
        ? trip.created_by_user[0] ?? null
        : trip.created_by_user;
      const carrier = Array.isArray(trip.carrier) ? trip.carrier[0] ?? null : trip.carrier;

      return {
        id: `groupage-${trip.id}`,
        trip_id: trip.id,
        trip_number: trip.trip_number ?? '-',
        trip_status: trip.status ?? null,
        carrier_display: formatCompanyDisplayName(carrier),
        responsible_display: formatPerson(createdByUser),
        vehicle_display: buildVehicleSummary(trip),
        cost_value: tripCostValue,
        cost_display: formatMoney(tripCostValue, 'EUR'),
        rows,
        footer: {
          id: `groupage-footer-${trip.id}`,
          kg_value: totalKgValue || 0,
          ldm_value: totalLdmValue || 0,
          revenue_value: totalRevenueValue,
          revenue_display: formatMoney(totalRevenueValue, 'EUR'),
          cost_value: tripCostValue,
          cost_display: formatMoney(tripCostValue, 'EUR'),
          profit_value: profitValue,
          profit_display: formatMoney(profitValue, 'EUR'),
        },
      };
    });

    const standaloneRows: any[] = [];

    const standaloneOrders = Array.from(visibleOrderIdSet)
      .map((orderId) => orderMap.get(orderId))
      .filter(Boolean)
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

      standaloneRows.push(
        buildOrderRow({
          order,
          effectiveOrganizationId,
          sourceOrganizationMap,
          linkedTrip,
        })
      );
    }

    const standaloneTrips = Array.from(visibleTripIdSet)
      .map((tripId) => tripMap.get(tripId))
      .filter(Boolean)
      .filter((trip: any) => !trip.is_groupage)
      .filter((trip: any) => !representedTripIds.has(trip.id))
      .sort((left: any, right: any) =>
        String(left.trip_number || '').localeCompare(String(right.trip_number || ''))
      );

    for (const trip of standaloneTrips) {
      const firstLinkedOrder = (linksByTripId.get(trip.id) || [])
        .map((link: any) => orderMap.get(link.order_id))
        .find(Boolean) || null;

      standaloneRows.push(
        buildTripRow({
          trip,
          effectiveOrganizationId,
          relatedOrder: firstLinkedOrder,
          sourceOrganizationMap,
        })
      );
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
