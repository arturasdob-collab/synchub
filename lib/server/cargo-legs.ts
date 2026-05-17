import {
  canAccessLinkedRecord,
  loadCurrentLinkingProfile,
  loadOrderLinkContext,
  loadTripLinkContext,
} from '@/lib/server/order-trip-linking';
import { validateShareableManager } from '@/lib/server/manager-shares';

type ServiceSupabase = any;

export const cargoLegSelect = `
  id,
  organization_id,
  responsible_organization_id,
  responsible_warehouse_id,
  show_to_all_managers,
  order_trip_link_id,
  linked_trip_id,
  leg_order,
  leg_type,
  created_by,
  created_at,
  updated_at,
  created_by_user:created_by (
    first_name,
    last_name
  ),
  responsible_organization:responsible_organization_id (
    id,
    name,
    address,
    city,
    postal_code,
    country,
    contact_phone,
    contact_email
  ),
  responsible_warehouse:responsible_warehouse_id (
    id,
    name,
    address,
    city,
    postal_code,
    country
  ),
  linked_trip:linked_trip_id (
    id,
    organization_id,
    trip_number,
    status,
    driver_name,
    truck_plate,
    trailer_plate,
    is_groupage,
    carrier:carrier_company_id (
      name,
      company_code
    )
  ),
  manager_shares:cargo_leg_manager_shares (
    manager_user_id,
    shared_organization_id,
    manager_user:manager_user_id (
      first_name,
      last_name
    )
  ),
  execution_detail:cargo_leg_execution_details (
    id,
    cargo_leg_id,
    step_status,
    planned_date,
    planned_time_from,
    planned_time_to,
    actual_date,
    actual_time_from,
    actual_time_to,
    transport_price,
    truck_plate,
    trailer_plate,
    driver_name,
    driver_phone,
    manager_notes,
    arrival_confirmed,
    dimensions_checked,
    cargo_matches,
    damaged_reported,
    created_by,
    updated_by,
    created_at,
    updated_at
  )
`;

export async function ensureInternationalCargoLeg(
  serviceSupabase: ServiceSupabase,
  params: {
    organizationId: string;
    orderTripLinkId: string;
    linkedTripId: string;
    linkedTripOrganizationId?: string | null;
    createdBy: string;
  }
) {
  const { data, error } = await serviceSupabase
    .from('cargo_legs')
    .select('id, leg_order, leg_type')
    .eq('organization_id', params.organizationId)
    .eq('order_trip_link_id', params.orderTripLinkId)
    .order('leg_order', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const existingRows = ((data || []) as any[]).map((row: any) => ({
    id: row.id as string,
    leg_order: Number(row.leg_order),
    leg_type: row.leg_type as string,
  }));

  if (existingRows.some((row: { leg_type: string }) => row.leg_type === 'international_trip')) {
    return false;
  }

  const firstDeliveryOrder =
    existingRows.find((row: { leg_type: string; leg_order: number }) => row.leg_type === 'delivery')?.leg_order ?? null;
  const insertOrder =
    firstDeliveryOrder ??
    (existingRows.length > 0
      ? Math.max(...existingRows.map((row: { leg_order: number }) => row.leg_order)) + 1
      : 1);

  const rowsToShift = existingRows
    .filter((row: { leg_order: number }) => row.leg_order >= insertOrder)
    .sort(
      (
        left: { leg_order: number },
        right: { leg_order: number }
      ) => right.leg_order - left.leg_order
    );

  for (const row of rowsToShift) {
    const { error: updateError } = await serviceSupabase
      .from('cargo_legs')
      .update({ leg_order: row.leg_order + 1 })
      .eq('id', row.id)
      .eq('organization_id', params.organizationId);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  const { error: insertError } = await serviceSupabase.from('cargo_legs').insert({
    organization_id: params.organizationId,
    responsible_organization_id:
      params.linkedTripOrganizationId ?? params.organizationId,
    responsible_warehouse_id: null,
    show_to_all_managers: true,
    order_trip_link_id: params.orderTripLinkId,
    linked_trip_id: params.linkedTripId,
    leg_order: insertOrder,
    leg_type: 'international_trip',
    created_by: params.createdBy,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  return true;
}

function normalizeManagerUserIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item): item is string => item !== '')
    )
  );
}

export function mapCargoLeg(cargoLeg: any) {
  const linkedTrip = Array.isArray(cargoLeg.linked_trip)
    ? (cargoLeg.linked_trip[0] ?? null)
    : cargoLeg.linked_trip;
  const linkedTripCarrier = linkedTrip
    ? Array.isArray(linkedTrip.carrier)
      ? (linkedTrip.carrier[0] ?? null)
      : linkedTrip.carrier
    : null;
  const createdByUser = Array.isArray(cargoLeg.created_by_user)
    ? (cargoLeg.created_by_user[0] ?? null)
    : cargoLeg.created_by_user;
  const responsibleOrganization = Array.isArray(cargoLeg.responsible_organization)
    ? (cargoLeg.responsible_organization[0] ?? null)
    : cargoLeg.responsible_organization;
  const responsibleWarehouse = Array.isArray(cargoLeg.responsible_warehouse)
    ? (cargoLeg.responsible_warehouse[0] ?? null)
    : cargoLeg.responsible_warehouse;
  const managerShares = Array.isArray(cargoLeg.manager_shares)
    ? cargoLeg.manager_shares
    : cargoLeg.manager_shares
      ? [cargoLeg.manager_shares]
      : [];
  const executionDetail = Array.isArray(cargoLeg.execution_detail)
    ? (cargoLeg.execution_detail[0] ?? null)
    : cargoLeg.execution_detail;
  const executionCreatedByUser = executionDetail
    ? Array.isArray(executionDetail.created_by_user)
      ? (executionDetail.created_by_user[0] ?? null)
      : executionDetail.created_by_user
    : null;
  const executionUpdatedByUser = executionDetail
    ? Array.isArray(executionDetail.updated_by_user)
      ? (executionDetail.updated_by_user[0] ?? null)
      : executionDetail.updated_by_user
    : null;

  return {
    id: cargoLeg.id,
    organization_id: cargoLeg.organization_id ?? null,
    responsible_organization_id: cargoLeg.responsible_organization_id ?? null,
    responsible_warehouse_id: cargoLeg.responsible_warehouse_id ?? null,
    show_to_all_managers: !!cargoLeg.show_to_all_managers,
    order_trip_link_id: cargoLeg.order_trip_link_id,
    linked_trip_id: cargoLeg.linked_trip_id ?? null,
    leg_order: cargoLeg.leg_order,
    leg_type: cargoLeg.leg_type,
    created_by: cargoLeg.created_by ?? null,
    created_at: cargoLeg.created_at ?? null,
    updated_at: cargoLeg.updated_at ?? null,
    responsible_organization: responsibleOrganization
      ? {
          id: responsibleOrganization.id ?? null,
          name: responsibleOrganization.name ?? null,
          address: responsibleOrganization.address ?? null,
          city: responsibleOrganization.city ?? null,
          postal_code: responsibleOrganization.postal_code ?? null,
          country: responsibleOrganization.country ?? null,
          contact_phone: responsibleOrganization.contact_phone ?? null,
          contact_email: responsibleOrganization.contact_email ?? null,
        }
      : null,
    responsible_warehouse: responsibleWarehouse
      ? {
          id: responsibleWarehouse.id ?? null,
          name: responsibleWarehouse.name ?? null,
          address: responsibleWarehouse.address ?? null,
          city: responsibleWarehouse.city ?? null,
          postal_code: responsibleWarehouse.postal_code ?? null,
          country: responsibleWarehouse.country ?? null,
        }
      : null,
    linked_trip: linkedTrip
      ? {
          id: linkedTrip.id,
          organization_id: linkedTrip.organization_id ?? null,
          trip_number: linkedTrip.trip_number,
          status: linkedTrip.status ?? null,
          driver_name: linkedTrip.driver_name ?? null,
          truck_plate: linkedTrip.truck_plate ?? null,
          trailer_plate: linkedTrip.trailer_plate ?? null,
          is_groupage: linkedTrip.is_groupage ?? null,
          carrier: linkedTripCarrier
            ? {
                name: linkedTripCarrier.name ?? null,
                company_code: linkedTripCarrier.company_code ?? null,
              }
            : null,
        }
      : null,
    shared_managers: managerShares
      .map((share: any) => {
        const managerUser = Array.isArray(share.manager_user)
          ? (share.manager_user[0] ?? null)
          : share.manager_user;

        return {
          id: share.manager_user_id ?? null,
          shared_organization_id: share.shared_organization_id ?? null,
          first_name: managerUser?.first_name ?? null,
          last_name: managerUser?.last_name ?? null,
        };
      })
      .filter((manager: any) => !!manager.id),
    execution_detail: executionDetail
        ? {
          id: executionDetail.id,
          cargo_leg_id: executionDetail.cargo_leg_id ?? cargoLeg.id,
          step_status: executionDetail.step_status ?? null,
          planned_date: executionDetail.planned_date ?? null,
          planned_time_from: executionDetail.planned_time_from ?? null,
          planned_time_to: executionDetail.planned_time_to ?? null,
          actual_date: executionDetail.actual_date ?? null,
          actual_time_from: executionDetail.actual_time_from ?? null,
          actual_time_to: executionDetail.actual_time_to ?? null,
          transport_price: executionDetail.transport_price ?? null,
          truck_plate: executionDetail.truck_plate ?? null,
          trailer_plate: executionDetail.trailer_plate ?? null,
          driver_name: executionDetail.driver_name ?? null,
          driver_phone: executionDetail.driver_phone ?? null,
          manager_notes: executionDetail.manager_notes ?? null,
          arrival_confirmed: !!executionDetail.arrival_confirmed,
          dimensions_checked: !!executionDetail.dimensions_checked,
          cargo_matches: !!executionDetail.cargo_matches,
          damaged_reported: !!executionDetail.damaged_reported,
          created_by: executionDetail.created_by ?? null,
          updated_by: executionDetail.updated_by ?? null,
          created_at: executionDetail.created_at ?? null,
          updated_at: executionDetail.updated_at ?? null,
          created_by_user: executionCreatedByUser
            ? {
                first_name: executionCreatedByUser.first_name ?? null,
                last_name: executionCreatedByUser.last_name ?? null,
              }
            : null,
          updated_by_user: executionUpdatedByUser
            ? {
                first_name: executionUpdatedByUser.first_name ?? null,
                last_name: executionUpdatedByUser.last_name ?? null,
              }
            : null,
        }
      : null,
    created_by_user: createdByUser
      ? {
          first_name: createdByUser.first_name ?? null,
          last_name: createdByUser.last_name ?? null,
        }
      : null,
  };
}

export async function replaceCargoLegManagerShares(
  serviceSupabase: ServiceSupabase,
  params: {
    organizationId: string;
    cargoLegId: string;
    responsibleOrganizationId: string;
    managerUserIds?: unknown;
    showToAllManagers?: boolean;
    sharedBy: string;
  }
) {
  const normalizedManagerUserIds = normalizeManagerUserIds(params.managerUserIds);
  const validatedManagers = [];

  if (!params.showToAllManagers) {
    for (const managerUserId of normalizedManagerUserIds) {
      const manager = await validateShareableManager(
        serviceSupabase,
        params.organizationId,
        managerUserId,
        params.responsibleOrganizationId
      );

      if (manager) {
        validatedManagers.push(manager);
      }
    }
  }

  const { error: deleteError } = await serviceSupabase
    .from('cargo_leg_manager_shares')
    .delete()
    .eq('cargo_leg_id', params.cargoLegId)
    .eq('organization_id', params.organizationId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (params.showToAllManagers || validatedManagers.length === 0) {
    return [];
  }

  const { error: insertError } = await serviceSupabase
    .from('cargo_leg_manager_shares')
    .insert(
      validatedManagers.map((manager: any) => ({
        organization_id: params.organizationId,
        cargo_leg_id: params.cargoLegId,
        shared_organization_id: params.responsibleOrganizationId,
        manager_user_id: manager.id,
        shared_by: params.sharedBy,
      }))
    );

  if (insertError) {
    throw new Error(insertError.message);
  }

  return validatedManagers;
}

export async function loadManageableOrderTripLinkContext(
  serviceSupabase: ServiceSupabase,
  userId: string,
  orderTripLinkId: string
) {
  const profile = await loadCurrentLinkingProfile(serviceSupabase, userId);

  const { data: orderTripLink, error: orderTripLinkError } = await serviceSupabase
    .from('order_trip_links')
    .select('id, organization_id, order_id, trip_id')
    .eq('id', orderTripLinkId)
    .single();

  if (orderTripLinkError || !orderTripLink) {
    throw new Error('Order-trip link not found');
  }

  const { order, sharedManagerUserId: orderSharedManagerUserId } =
    await loadOrderLinkContext(serviceSupabase, orderTripLink.order_id);
  const { trip, sharedManagerUserId: tripSharedManagerUserId } =
    await loadTripLinkContext(serviceSupabase, orderTripLink.trip_id);

  if (
    orderTripLink.organization_id !== profile.organization_id ||
    order.organization_id !== profile.organization_id ||
    trip.organization_id !== profile.organization_id
  ) {
    throw new Error('Forbidden');
  }

  const canAccessOrder = canAccessLinkedRecord({
    profile,
    currentUserId: userId,
    createdBy: order.created_by,
    sharedManagerUserId: orderSharedManagerUserId,
  });

  const canAccessTrip = canAccessLinkedRecord({
    profile,
    currentUserId: userId,
    createdBy: trip.created_by,
    sharedManagerUserId: tripSharedManagerUserId,
  });

  const canManageViaSharedManager =
    !!orderSharedManagerUserId &&
    !!tripSharedManagerUserId &&
    orderSharedManagerUserId === tripSharedManagerUserId;

  if (!canAccessOrder || (!canAccessTrip && !canManageViaSharedManager)) {
    throw new Error('Forbidden');
  }

  return {
    profile,
    orderTripLink: orderTripLink as {
      id: string;
      organization_id: string;
      order_id: string;
      trip_id: string;
    },
    order,
    trip,
    orderSharedManagerUserId,
    tripSharedManagerUserId,
  };
}

export async function loadCargoVisibleTripIds(
  serviceSupabase: ServiceSupabase,
  userId: string,
  responsibleOrganizationId: string
): Promise<string[]> {
  const { data, error } = await serviceSupabase
    .from('cargo_legs')
    .select(
      `
        linked_trip_id,
        show_to_all_managers,
        manager_shares:cargo_leg_manager_shares (
          manager_user_id,
          shared_organization_id
        )
      `
    )
    .eq('responsible_organization_id', responsibleOrganizationId)
    .not('linked_trip_id', 'is', null);

  if (error) {
    throw new Error(error.message);
  }

  return Array.from(
    new Set(
      (data || [])
        .filter((row: any) => {
          if (!row?.linked_trip_id) return false;
          if (row.show_to_all_managers) return true;

          const managerShares = Array.isArray(row.manager_shares)
            ? row.manager_shares
            : row.manager_shares
              ? [row.manager_shares]
              : [];

          return managerShares.some(
            (share: any) =>
              share?.shared_organization_id === responsibleOrganizationId &&
              share?.manager_user_id === userId
          );
        })
        .map((row: any) => row.linked_trip_id as string)
        .filter(Boolean)
    )
  );
}

export async function loadCargoVisibleOrderIds(
  serviceSupabase: ServiceSupabase,
  userId: string,
  responsibleOrganizationId: string
): Promise<string[]> {
  const { data, error } = await serviceSupabase
    .from('cargo_legs')
    .select(
      `
        show_to_all_managers,
        order_trip_link:order_trip_link_id (
          order_id
        ),
        manager_shares:cargo_leg_manager_shares (
          manager_user_id,
          shared_organization_id
        )
      `
    )
    .eq('responsible_organization_id', responsibleOrganizationId);

  if (error) {
    throw new Error(error.message);
  }

  return Array.from(
    new Set(
      (data || [])
        .filter((row: any) => {
          const orderTripLink = Array.isArray(row.order_trip_link)
            ? row.order_trip_link[0] ?? null
            : row.order_trip_link;

          if (!orderTripLink?.order_id) return false;
          if (row.show_to_all_managers) return true;

          const managerShares = Array.isArray(row.manager_shares)
            ? row.manager_shares
            : row.manager_shares
              ? [row.manager_shares]
              : [];

          return managerShares.some(
            (share: any) =>
              share?.shared_organization_id === responsibleOrganizationId &&
              share?.manager_user_id === userId
          );
        })
        .map((row: any) => {
          const orderTripLink = Array.isArray(row.order_trip_link)
            ? row.order_trip_link[0] ?? null
            : row.order_trip_link;

          return orderTripLink?.order_id as string | null;
        })
        .filter((value: unknown): value is string => typeof value === 'string' && value !== '')
    )
  );
}

export async function validateResponsibleWarehouse(
  serviceSupabase: ServiceSupabase,
  responsibleOrganizationId: string,
  requestedWarehouseId: string | null
) {
  const { data: warehouses, error } = await serviceSupabase
    .from('organization_warehouses')
    .select('id')
    .eq('organization_id', responsibleOrganizationId)
    .order('name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const availableWarehouseIds = new Set(
    (warehouses || [])
      .map((warehouse: any) => warehouse.id)
      .filter((value: unknown): value is string => typeof value === 'string' && value !== '')
  );

  if (!requestedWarehouseId) {
    if (availableWarehouseIds.size > 0) {
      throw new Error('Choose warehouse');
    }

    return null;
  }

  if (!availableWarehouseIds.has(requestedWarehouseId)) {
    throw new Error('Warehouse not found for responsible organization');
  }

  return requestedWarehouseId;
}

export async function canAccessTripViaCargoRoute(
  serviceSupabase: ServiceSupabase,
  userId: string,
  responsibleOrganizationId: string,
  tripId: string
) {
  const { data, error } = await serviceSupabase
    .from('cargo_legs')
    .select(
      `
        show_to_all_managers,
        manager_shares:cargo_leg_manager_shares (
          manager_user_id,
          shared_organization_id
        )
      `
    )
    .eq('responsible_organization_id', responsibleOrganizationId)
    .eq('linked_trip_id', tripId);

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).some((row: any) => {
    if (row.show_to_all_managers) {
      return true;
    }

    const managerShares = Array.isArray(row.manager_shares)
      ? row.manager_shares
      : row.manager_shares
        ? [row.manager_shares]
        : [];

    return managerShares.some(
      (share: any) =>
        share?.shared_organization_id === responsibleOrganizationId &&
        share?.manager_user_id === userId
    );
  });
}

export async function canAccessOrderViaCargoRoute(
  serviceSupabase: ServiceSupabase,
  userId: string,
  responsibleOrganizationId: string,
  orderId: string
) {
  const { data, error } = await serviceSupabase
    .from('cargo_legs')
    .select(
      `
        show_to_all_managers,
        order_trip_link:order_trip_link_id (
          order_id
        ),
        manager_shares:cargo_leg_manager_shares (
          manager_user_id,
          shared_organization_id
        )
      `
    )
    .eq('responsible_organization_id', responsibleOrganizationId);

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).some((row: any) => {
    const orderTripLink = Array.isArray(row.order_trip_link)
      ? row.order_trip_link[0] ?? null
      : row.order_trip_link;

    if (orderTripLink?.order_id !== orderId) {
      return false;
    }

    if (row.show_to_all_managers) {
      return true;
    }

    const managerShares = Array.isArray(row.manager_shares)
      ? row.manager_shares
      : row.manager_shares
        ? [row.manager_shares]
        : [];

    return managerShares.some(
      (share: any) =>
        share?.shared_organization_id === responsibleOrganizationId &&
        share?.manager_user_id === userId
    );
  });
}
