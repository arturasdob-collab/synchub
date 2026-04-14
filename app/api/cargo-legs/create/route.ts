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
import { validateShareableManager } from '@/lib/server/manager-shares';
import {
  CARGO_LEG_TYPES,
  type CargoLegType,
} from '@/lib/constants/cargo-leg-types';

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
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

function normalizeBoolean(value: unknown) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

async function resolveCargoLegManagerUserIds(
  serviceSupabase: any,
  params: {
    linkedTripId: string;
    responsibleOrganizationId: string;
    managerUserIds: unknown;
    showToAllManagers: boolean;
  }
) {
  const normalizedManagerUserIds = Array.isArray(params.managerUserIds)
    ? Array.from(
        new Set(
          params.managerUserIds
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter((value): value is string => value !== '')
        )
      )
    : [];

  if (params.showToAllManagers || normalizedManagerUserIds.length > 0) {
    return normalizedManagerUserIds;
  }

  const { data: linkedTrip, error: linkedTripError } = await serviceSupabase
    .from('trips')
    .select('id, created_by')
    .eq('id', params.linkedTripId)
    .single();

  if (linkedTripError || !linkedTrip?.created_by) {
    return [];
  }

  const creatorManager = await validateShareableManager(
    serviceSupabase,
    params.responsibleOrganizationId,
    linkedTrip.created_by,
    params.responsibleOrganizationId
  ).catch(() => null);

  return creatorManager ? [creatorManager.id] : [];
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
  const orderTripLinkId = normalizeText(
    body.order_trip_link_id ?? body.orderTripLinkId
  );
  const linkedTripId = normalizeText(body.linked_trip_id ?? body.linkedTripId);
  const requestedResponsibleOrganizationId = normalizeText(
    body.responsible_organization_id ?? body.responsibleOrganizationId
  );
  const requestedResponsibleWarehouseId = normalizeText(
    body.responsible_warehouse_id ?? body.responsibleWarehouseId
  );
  const showToAllManagers = normalizeBoolean(
    body.show_to_all_managers ?? body.showToAllManagers
  );
  const managerUserIds = body.manager_user_ids ?? body.managerUserIds;
  const legOrder = normalizeLegOrder(body.leg_order ?? body.legOrder);
  const legType = normalizeLegType(body.leg_type ?? body.legType);

  if (!orderTripLinkId) {
    return NextResponse.json(
      { error: 'Order-trip link id is required' },
      { status: 400 }
    );
  }

  if (!linkedTripId) {
    return NextResponse.json(
      { error: 'Linked trip is required' },
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

  try {
    const { profile } = await loadManageableOrderTripLinkContext(
      serviceSupabase,
      user.id,
      orderTripLinkId
    );

    if (!profile.organization_id) {
      return NextResponse.json(
        { error: 'User organization not found' },
        { status: 400 }
      );
    }

    const sourceOrganizationId = profile.organization_id;

    const { data: linkedTrip, error: linkedTripError } = await serviceSupabase
      .from('trips')
      .select('id, organization_id')
      .eq('id', linkedTripId)
      .single();

    if (linkedTripError || !linkedTrip) {
      return NextResponse.json({ error: 'Linked trip not found' }, { status: 404 });
    }

    const responsibleOrganizationId: string =
      requestedResponsibleOrganizationId || linkedTrip.organization_id;

    if (linkedTrip.organization_id !== responsibleOrganizationId) {
      return NextResponse.json(
        { error: 'Linked trip must belong to the responsible organization' },
        { status: 400 }
      );
    }

    const nextManagerUserIds = await resolveCargoLegManagerUserIds(
      serviceSupabase,
      {
        linkedTripId,
        responsibleOrganizationId,
        managerUserIds,
        showToAllManagers,
      }
    );

    const responsibleWarehouseId = await validateResponsibleWarehouse(
      serviceSupabase,
      responsibleOrganizationId,
      requestedResponsibleWarehouseId
    );

    const { data: createdCargoLeg, error } = await serviceSupabase
      .from('cargo_legs')
      .insert({
        organization_id: sourceOrganizationId,
        responsible_organization_id: responsibleOrganizationId,
        responsible_warehouse_id: responsibleWarehouseId,
        show_to_all_managers: showToAllManagers,
        order_trip_link_id: orderTripLinkId,
        linked_trip_id: linkedTripId,
        leg_order: legOrder,
        leg_type: legType,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (error || !createdCargoLeg) {
      if (error?.code === '23505') {
        return NextResponse.json(
          { error: 'This cargo leg order already exists for the cargo' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: error?.message || 'Failed to create cargo route step' },
        { status: 500 }
      );
    }

    try {
      await replaceCargoLegManagerShares(serviceSupabase, {
        organizationId: sourceOrganizationId,
        cargoLegId: createdCargoLeg.id,
        responsibleOrganizationId,
        managerUserIds: nextManagerUserIds,
        showToAllManagers,
        sharedBy: user.id,
      });
    } catch (shareError) {
      await serviceSupabase
        .from('cargo_legs')
        .delete()
        .eq('id', createdCargoLeg.id)
        .eq('organization_id', sourceOrganizationId);

      throw shareError;
    }

    const { data, error: fetchError } = await serviceSupabase
      .from('cargo_legs')
      .select(cargoLegSelect)
      .eq('id', createdCargoLeg.id)
      .single();

    if (fetchError || !data) {
      return NextResponse.json(
        { error: fetchError?.message || 'Failed to load cargo route step' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      cargo_leg: mapCargoLeg(data),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 }
    );
  }
}
