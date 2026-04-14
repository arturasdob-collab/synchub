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
    linkedTripId: string | null;
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

  if (!params.linkedTripId) {
    return [];
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
  const cargoLegId = normalizeText(body.id);

  if (!cargoLegId) {
    return NextResponse.json({ error: 'Cargo leg id is required' }, { status: 400 });
  }

  try {
    const { data: existingCargoLeg, error: existingCargoLegError } =
      await serviceSupabase
        .from('cargo_legs')
        .select(
          'id, organization_id, order_trip_link_id, linked_trip_id, responsible_organization_id, responsible_warehouse_id, show_to_all_managers'
        )
        .eq('id', cargoLegId)
        .single();

    if (existingCargoLegError || !existingCargoLeg) {
      return NextResponse.json({ error: 'Cargo leg not found' }, { status: 404 });
    }

    const { profile } = await loadManageableOrderTripLinkContext(
      serviceSupabase,
      user.id,
      existingCargoLeg.order_trip_link_id
    );

    if (!profile.organization_id) {
      return NextResponse.json(
        { error: 'User organization not found' },
        { status: 400 }
      );
    }

    const sourceOrganizationId = profile.organization_id;

    if (existingCargoLeg.organization_id !== sourceOrganizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload: Record<string, unknown> = {};
    const hasResponsibleOrganizationInput =
      Object.prototype.hasOwnProperty.call(body, 'responsible_organization_id') ||
      Object.prototype.hasOwnProperty.call(body, 'responsibleOrganizationId');
    const hasShowToAllManagersInput =
      Object.prototype.hasOwnProperty.call(body, 'show_to_all_managers') ||
      Object.prototype.hasOwnProperty.call(body, 'showToAllManagers');
    const hasResponsibleWarehouseInput =
      Object.prototype.hasOwnProperty.call(body, 'responsible_warehouse_id') ||
      Object.prototype.hasOwnProperty.call(body, 'responsibleWarehouseId');
    const hasManagerUserIdsInput =
      Object.prototype.hasOwnProperty.call(body, 'manager_user_ids') ||
      Object.prototype.hasOwnProperty.call(body, 'managerUserIds');
    const requestedResponsibleOrganizationId = hasResponsibleOrganizationInput
      ? normalizeText(
          body.responsible_organization_id ?? body.responsibleOrganizationId
        )
      : null;
    const requestedResponsibleWarehouseId = hasResponsibleWarehouseInput
      ? normalizeText(
          body.responsible_warehouse_id ?? body.responsibleWarehouseId
        )
      : null;
    const nextResponsibleOrganizationId: string =
      requestedResponsibleOrganizationId ||
      existingCargoLeg.responsible_organization_id ||
      sourceOrganizationId;
    const nextShowToAllManagers = hasShowToAllManagersInput
      ? normalizeBoolean(body.show_to_all_managers ?? body.showToAllManagers)
      : !!existingCargoLeg.show_to_all_managers;
    const nextManagerUserIds = hasManagerUserIdsInput
      ? body.manager_user_ids ?? body.managerUserIds
      : hasResponsibleOrganizationInput
        ? []
        : undefined;
    let effectiveLinkedTripId: string | null = existingCargoLeg.linked_trip_id ?? null;

    if (Object.prototype.hasOwnProperty.call(body, 'leg_order')) {
      const legOrder = normalizeLegOrder(body.leg_order);

      if (legOrder === null || Number.isNaN(legOrder)) {
        return NextResponse.json(
          { error: 'Cargo leg order must be a positive whole number' },
          { status: 400 }
        );
      }

      payload.leg_order = legOrder;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'leg_type')) {
      const legType = normalizeLegType(body.leg_type);

      if (!legType) {
        return NextResponse.json(
          { error: 'Invalid cargo leg type' },
          { status: 400 }
        );
      }

      payload.leg_type = legType;
    }

    if (hasResponsibleOrganizationInput) {
      if (!requestedResponsibleOrganizationId) {
        return NextResponse.json(
          { error: 'Responsible organization is required' },
          { status: 400 }
        );
      }

      payload.responsible_organization_id = requestedResponsibleOrganizationId;
    }

    if (hasShowToAllManagersInput) {
      payload.show_to_all_managers = nextShowToAllManagers;
    }

    if (hasResponsibleWarehouseInput || hasResponsibleOrganizationInput) {
      payload.responsible_warehouse_id = await validateResponsibleWarehouse(
        serviceSupabase,
        nextResponsibleOrganizationId,
        hasResponsibleWarehouseInput
          ? requestedResponsibleWarehouseId
          : existingCargoLeg.responsible_warehouse_id ?? null
      );
    }

    if (
      Object.prototype.hasOwnProperty.call(body, 'linked_trip_id') ||
      Object.prototype.hasOwnProperty.call(body, 'linkedTripId')
    ) {
      const linkedTripId = normalizeText(body.linked_trip_id ?? body.linkedTripId);

      if (!linkedTripId) {
        return NextResponse.json(
          { error: 'Linked trip is required' },
          { status: 400 }
        );
      }

      const { data: linkedTrip, error: linkedTripError } = await serviceSupabase
        .from('trips')
        .select('id, organization_id')
        .eq('id', linkedTripId)
        .single();

      if (linkedTripError || !linkedTrip) {
        return NextResponse.json(
          { error: 'Linked trip not found' },
          { status: 404 }
        );
      }

      if (linkedTrip.organization_id !== nextResponsibleOrganizationId) {
        return NextResponse.json(
          { error: 'Linked trip must belong to the responsible organization' },
          { status: 400 }
        );
      }

      payload.linked_trip_id = linkedTripId;
      effectiveLinkedTripId = linkedTripId;
    } else if (
      hasResponsibleOrganizationInput &&
      existingCargoLeg.linked_trip_id
    ) {
      const { data: currentLinkedTrip, error: currentLinkedTripError } =
        await serviceSupabase
          .from('trips')
          .select('id, organization_id')
          .eq('id', existingCargoLeg.linked_trip_id)
          .single();

      if (currentLinkedTripError || !currentLinkedTrip) {
        return NextResponse.json(
          { error: 'Linked trip not found' },
          { status: 404 }
        );
      }

      if (currentLinkedTrip.organization_id !== nextResponsibleOrganizationId) {
        return NextResponse.json(
          {
            error:
              'Current linked trip belongs to another organization. Choose a trip from the responsible organization first.',
          },
          { status: 400 }
        );
      }
    }

    const shouldReplaceManagerShares =
      hasResponsibleOrganizationInput ||
      hasShowToAllManagersInput ||
      hasManagerUserIdsInput;
    const resolvedManagerUserIds = shouldReplaceManagerShares
      ? await resolveCargoLegManagerUserIds(serviceSupabase, {
          linkedTripId: effectiveLinkedTripId,
          responsibleOrganizationId: nextResponsibleOrganizationId,
          managerUserIds: nextManagerUserIds,
          showToAllManagers: nextShowToAllManagers,
        })
      : nextManagerUserIds;

    if (Object.keys(payload).length === 0 && !shouldReplaceManagerShares) {
      return NextResponse.json(
        { error: 'No cargo leg fields provided for update' },
        { status: 400 }
      );
    }

    if (Object.keys(payload).length > 0) {
      const { error: updateError } = await serviceSupabase
        .from('cargo_legs')
        .update(payload)
        .eq('id', cargoLegId)
        .eq('organization_id', sourceOrganizationId);

      if (updateError) {
        if (updateError.code === '23505') {
          return NextResponse.json(
            { error: 'This cargo leg order already exists for the cargo' },
            { status: 400 }
          );
        }

        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    }

    if (shouldReplaceManagerShares) {
      await replaceCargoLegManagerShares(serviceSupabase, {
        organizationId: sourceOrganizationId,
        cargoLegId,
        responsibleOrganizationId: nextResponsibleOrganizationId,
        managerUserIds: resolvedManagerUserIds,
        showToAllManagers: nextShowToAllManagers,
        sharedBy: user.id,
      });
    }

    const { data, error } = await serviceSupabase
      .from('cargo_legs')
      .select(cargoLegSelect)
      .eq('id', cargoLegId)
      .eq('organization_id', sourceOrganizationId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || 'Failed to load cargo route step' },
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
