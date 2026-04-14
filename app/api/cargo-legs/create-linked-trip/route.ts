import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  cargoLegSelect,
  loadManageableOrderTripLinkContext,
  mapCargoLeg,
  replaceCargoLegManagerShares,
  validateResponsibleWarehouse,
} from '@/lib/server/cargo-legs';
import { replaceTripManagerShare } from '@/lib/server/manager-shares';
import {
  CARGO_LEG_TYPES,
  type CargoLegType,
} from '@/lib/constants/cargo-leg-types';

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeBoolean(value: unknown) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizeLegOrder(value: unknown) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return NaN;
  }

  return parsed;
}

function normalizeLegType(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim() as CargoLegType;
  return CARGO_LEG_TYPES.includes(trimmed) ? trimmed : null;
}

async function cleanupCreatedTrip(
  serviceSupabase: any,
  tripId: string,
  organizationId: string
) {
  await serviceSupabase
    .from('trip_manager_shares')
    .delete()
    .eq('trip_id', tripId)
    .eq('organization_id', organizationId);

  await serviceSupabase
    .from('trips')
    .delete()
    .eq('id', tripId)
    .eq('organization_id', organizationId);
}

export async function POST(req: Request) {
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

  const body = await req.json();
  const orderTripLinkId =
    typeof body.order_trip_link_id === 'string'
      ? body.order_trip_link_id.trim()
      : typeof body.orderTripLinkId === 'string'
        ? body.orderTripLinkId.trim()
        : '';
  const cargoLegId = normalizeText(body.cargo_leg_id ?? body.cargoLegId);
  const requestedResponsibleOrganizationId = normalizeText(
    body.responsible_organization_id ?? body.responsibleOrganizationId
  );
  const requestedResponsibleWarehouseId = normalizeText(
    body.responsible_warehouse_id ?? body.responsibleWarehouseId
  );
  const showToAllManagers = normalizeBoolean(
    body.show_to_all_managers ?? body.showToAllManagers
  );
  const managerUserIds = Array.isArray(body.manager_user_ids ?? body.managerUserIds)
    ? (body.manager_user_ids ?? body.managerUserIds)
    : [];
  const legOrder = normalizeLegOrder(body.leg_order ?? body.legOrder);
  const legType = normalizeLegType(body.leg_type ?? body.legType);

  if (!orderTripLinkId) {
    return NextResponse.json(
      { error: 'Order-trip link id is required' },
      { status: 400 }
    );
  }

  if (legOrder === null || Number.isNaN(legOrder)) {
    return NextResponse.json(
      { error: 'Cargo leg order must be a positive whole number' },
      { status: 400 }
    );
  }

  if (!legType) {
    return NextResponse.json(
      { error: 'Invalid cargo leg type' },
      { status: 400 }
    );
  }

  let createdTripId: string | null = null;
  let sourceOrganizationId: string | null = null;
  let responsibleOrganizationId: string | null = null;

  try {
    const { profile, tripSharedManagerUserId } =
      await loadManageableOrderTripLinkContext(
        serviceSupabase,
        user.id,
        orderTripLinkId
      );

    sourceOrganizationId = profile.organization_id;

    if (!sourceOrganizationId) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 400 }
      );
    }

    if (cargoLegId) {
      const { data: existingCargoLeg, error: existingCargoLegError } =
        await serviceSupabase
          .from('cargo_legs')
          .select(
            'id, organization_id, order_trip_link_id, responsible_organization_id, responsible_warehouse_id, show_to_all_managers'
          )
          .eq('id', cargoLegId)
          .single();

      if (existingCargoLegError || !existingCargoLeg) {
        return NextResponse.json(
          { error: 'Cargo route step not found' },
          { status: 404 }
        );
      }

      if (
        existingCargoLeg.organization_id !== sourceOrganizationId ||
        existingCargoLeg.order_trip_link_id !== orderTripLinkId
      ) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      responsibleOrganizationId =
        requestedResponsibleOrganizationId ||
        existingCargoLeg.responsible_organization_id ||
        sourceOrganizationId;
    } else {
      responsibleOrganizationId =
        requestedResponsibleOrganizationId || sourceOrganizationId;
    }

    if (!responsibleOrganizationId) {
      return NextResponse.json(
        { error: 'Responsible organization is required' },
        { status: 400 }
      );
    }

    const responsibleWarehouseId = await validateResponsibleWarehouse(
      serviceSupabase,
      responsibleOrganizationId,
      requestedResponsibleWarehouseId
    );

    const { data: tripNumberData, error: tripNumberError } =
      await serviceSupabase.rpc('generate_trip_number');

    if (tripNumberError || !tripNumberData) {
      return NextResponse.json(
        { error: 'Failed to generate trip number' },
        { status: 500 }
      );
    }

    const { data: createdTrip, error: createTripError } = await serviceSupabase
      .from('trips')
      .insert({
        organization_id: responsibleOrganizationId,
        trip_number: tripNumberData,
        status: 'unconfirmed',
        carrier_company_id: null,
        assigned_manager_id: null,
        groupage_responsible_manager_id: null,
        truck_plate: null,
        trailer_plate: null,
        driver_name: null,
        price: null,
        payment_term_days: null,
        payment_type: null,
        vat_rate: null,
        notes: null,
        is_groupage: false,
        created_by: user.id,
      })
      .select('id, trip_number')
      .single();

    if (createTripError || !createdTrip) {
      return NextResponse.json(
        { error: createTripError?.message || 'Failed to create trip' },
        { status: 500 }
      );
    }

    createdTripId = createdTrip.id;

    const normalizedManagerUserIds = Array.from(
      new Set(
        managerUserIds
          .map((value: unknown) => (typeof value === 'string' ? value.trim() : ''))
          .filter((value: string) => value !== '')
      )
    );

    const singleRouteManagerUserId =
      !showToAllManagers && normalizedManagerUserIds.length === 1
        ? normalizedManagerUserIds[0]
        : null;

    if (singleRouteManagerUserId || tripSharedManagerUserId) {
      await replaceTripManagerShare(serviceSupabase, {
        organizationId: responsibleOrganizationId,
        tripId: createdTrip.id,
        managerUserId: singleRouteManagerUserId || tripSharedManagerUserId,
        sharedOrganizationId: responsibleOrganizationId,
        sharedBy:
          responsibleOrganizationId === sourceOrganizationId ? user.id : null,
      });
    }

    const cargoLegQuery = cargoLegId
      ? serviceSupabase
          .from('cargo_legs')
          .update({
            leg_order: legOrder,
            leg_type: legType,
            responsible_organization_id: responsibleOrganizationId,
            responsible_warehouse_id: responsibleWarehouseId,
            show_to_all_managers: showToAllManagers,
            linked_trip_id: createdTrip.id,
          })
          .eq('id', cargoLegId)
          .eq('organization_id', sourceOrganizationId)
      : serviceSupabase.from('cargo_legs').insert({
          organization_id: sourceOrganizationId,
          responsible_organization_id: responsibleOrganizationId,
          responsible_warehouse_id: responsibleWarehouseId,
          show_to_all_managers: showToAllManagers,
          order_trip_link_id: orderTripLinkId,
          linked_trip_id: createdTrip.id,
          leg_order: legOrder,
          leg_type: legType,
          created_by: user.id,
        });

    const { data: cargoLeg, error: cargoLegError } = await cargoLegQuery
      .select('id')
      .single();

    if (cargoLegError || !cargoLeg) {
      await cleanupCreatedTrip(
        serviceSupabase,
        createdTrip.id,
        responsibleOrganizationId
      );

      if (cargoLegError?.code === '23505') {
        return NextResponse.json(
          { error: 'This cargo leg order already exists for the cargo' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          error:
            cargoLegError?.message ||
            (cargoLegId
              ? 'Failed to update cargo route step'
              : 'Failed to create cargo route step'),
        },
        { status: 500 }
      );
    }

    await replaceCargoLegManagerShares(serviceSupabase, {
      organizationId: sourceOrganizationId,
      cargoLegId: cargoLeg.id,
      responsibleOrganizationId,
      managerUserIds: normalizedManagerUserIds,
      showToAllManagers,
      sharedBy: user.id,
    });

    const { data: hydratedCargoLeg, error: hydratedCargoLegError } =
      await serviceSupabase
        .from('cargo_legs')
        .select(cargoLegSelect)
        .eq('id', cargoLeg.id)
        .single();

    if (hydratedCargoLegError || !hydratedCargoLeg) {
      return NextResponse.json(
        {
          error:
            hydratedCargoLegError?.message || 'Failed to load cargo route step',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      created_trip: {
        id: createdTrip.id,
        trip_number: createdTrip.trip_number,
      },
      cargo_leg: mapCargoLeg(hydratedCargoLeg),
    });
  } catch (error) {
    if (createdTripId && responsibleOrganizationId) {
      await cleanupCreatedTrip(
        serviceSupabase,
        createdTripId,
        responsibleOrganizationId
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 }
    );
  }
}
