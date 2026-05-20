import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { loadEditableCargoLegExecutionContext } from '@/lib/server/cargo-leg-execution';
import {
  buildWorkflowFieldCompositeKey,
  loadWorkflowFieldUpdates,
  upsertWorkflowFieldUpdate,
} from '@/lib/server/workflow-field-updates';

const AUTO_WORKFLOW_ROUTE_STATUS_SEQUENCE = [
  'active',
  'planned',
  'at_loading_place',
  'at_customs',
  'loaded',
  'in_transit',
  'loaded_to_warehouse',
  'at_warehouse',
  'loaded_to_international_truck',
  'unloaded_in_warehouse',
  'delivered',
] as const;

function normalizeAutoWorkflowStatus(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (value === 'finished') {
    return 'delivered';
  }

  return (AUTO_WORKFLOW_ROUTE_STATUS_SEQUENCE as readonly string[]).includes(value)
    ? value
    : null;
}

async function syncOrderWorkflowStatusFromRouteStep(
  serviceSupabase: any,
  params: {
    orderTripLinkId: string;
    organizationId: string;
    updatedBy: string;
  }
) {
  const { data: orderTripLink, error: orderTripLinkError } = await serviceSupabase
    .from('order_trip_links')
    .select(
      `
        order_id,
        order:order_id (
          organization_id,
          status
        )
      `
    )
    .eq('id', params.orderTripLinkId)
    .single();

  if (orderTripLinkError || !orderTripLink?.order_id) {
    throw new Error(orderTripLinkError?.message || 'Order-trip link not found');
  }

  const orderRecord = Array.isArray((orderTripLink as any).order)
    ? (orderTripLink as any).order[0] ?? null
    : (orderTripLink as any).order;
  const orderId = orderTripLink.order_id as string;
  const orderOrganizationId =
    typeof orderRecord?.organization_id === 'string' && orderRecord.organization_id.trim() !== ''
      ? orderRecord.organization_id
      : params.organizationId;
  const baseOrderStatus =
    typeof orderRecord?.status === 'string' ? orderRecord.status.trim().toLowerCase() : null;

  const workflowUpdates = await loadWorkflowFieldUpdates(serviceSupabase, {
    recordType: 'order',
    recordIds: [orderId],
  });
  const currentStatusOverride =
    workflowUpdates.get(
      buildWorkflowFieldCompositeKey({
        recordType: 'order',
        recordId: orderId,
        fieldKey: 'status',
      })
    )?.value_text ?? null;
  const currentEffectiveStatus = (currentStatusOverride ?? baseOrderStatus)?.trim().toLowerCase() || null;

  if (currentEffectiveStatus === 'finished') {
    return;
  }

  const { data: cargoLegExecutions, error: cargoLegExecutionsError } = await serviceSupabase
    .from('cargo_legs')
    .select(
      `
        execution_detail:cargo_leg_execution_details (
          step_status
        )
      `
    )
    .eq('order_trip_link_id', params.orderTripLinkId);

  if (cargoLegExecutionsError) {
    throw new Error(cargoLegExecutionsError.message);
  }

  let derivedStatus: string | null = null;
  let highestIndex = -1;

  for (const cargoLeg of cargoLegExecutions || []) {
    const executionDetail = Array.isArray((cargoLeg as any).execution_detail)
      ? (cargoLeg as any).execution_detail[0] ?? null
      : (cargoLeg as any).execution_detail;
    const normalizedStatus = normalizeAutoWorkflowStatus(
      typeof executionDetail?.step_status === 'string' ? executionDetail.step_status : null
    );

    if (!normalizedStatus) {
      continue;
    }

    const statusIndex = AUTO_WORKFLOW_ROUTE_STATUS_SEQUENCE.indexOf(
      normalizedStatus as (typeof AUTO_WORKFLOW_ROUTE_STATUS_SEQUENCE)[number]
    );

    if (statusIndex > highestIndex) {
      highestIndex = statusIndex;
      derivedStatus = normalizedStatus;
    }
  }

  if (!derivedStatus || derivedStatus === currentEffectiveStatus) {
    return;
  }

  await upsertWorkflowFieldUpdate(serviceSupabase, {
    organizationId: orderOrganizationId,
    recordType: 'order',
    recordId: orderId,
    fieldKey: 'status',
    value: derivedStatus,
    updatedBy: params.updatedBy,
  });
}

function normalizeText(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeDate(value: unknown) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function normalizeTime(value: unknown) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function normalizeMoney(value: unknown) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBoolean(value: unknown) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizeStepStatus(value: unknown) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  return [
    'active',
    'planned',
    'at_loading_place',
    'at_customs',
    'loaded',
    'in_transit',
    'loaded_to_warehouse',
    'at_warehouse',
    'loaded_to_international_truck',
    'unloaded_in_warehouse',
    'delivered',
    'finished',
  ].includes(normalized)
    ? normalized
    : null;
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
  const cargoLegId =
    typeof body.cargo_leg_id === 'string'
      ? body.cargo_leg_id.trim()
      : typeof body.cargoLegId === 'string'
        ? body.cargoLegId.trim()
        : '';

  if (!cargoLegId) {
    return NextResponse.json(
      { error: 'Cargo route step id is required' },
      { status: 400 }
    );
  }

  try {
    const { cargoLeg, effectiveOrganizationId } =
      await loadEditableCargoLegExecutionContext(serviceSupabase, user.id, cargoLegId);

    const payload = {
      organization_id: effectiveOrganizationId,
      cargo_leg_id: cargoLeg.id,
      step_status: normalizeStepStatus(body.step_status ?? body.stepStatus),
      planned_date: normalizeDate(body.planned_date ?? body.plannedDate),
      planned_time_from: normalizeTime(body.planned_time_from ?? body.plannedTimeFrom),
      planned_time_to: normalizeTime(body.planned_time_to ?? body.plannedTimeTo),
      actual_date: normalizeDate(body.actual_date ?? body.actualDate),
      actual_time_from: normalizeTime(body.actual_time_from ?? body.actualTimeFrom),
      actual_time_to: normalizeTime(body.actual_time_to ?? body.actualTimeTo),
      transport_price: normalizeMoney(body.transport_price ?? body.transportPrice),
      truck_plate: normalizeText(body.truck_plate ?? body.truckPlate),
      trailer_plate: normalizeText(body.trailer_plate ?? body.trailerPlate),
      driver_name: normalizeText(body.driver_name ?? body.driverName),
      driver_phone: normalizeText(body.driver_phone ?? body.driverPhone),
      manager_notes: normalizeText(body.manager_notes ?? body.managerNotes),
      arrival_confirmed: normalizeBoolean(
        body.arrival_confirmed ?? body.arrivalConfirmed
      ),
      dimensions_checked: normalizeBoolean(
        body.dimensions_checked ?? body.dimensionsChecked
      ),
      cargo_matches: normalizeBoolean(body.cargo_matches ?? body.cargoMatches),
      damaged_reported: normalizeBoolean(
        body.damaged_reported ?? body.damagedReported
      ),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await serviceSupabase
      .from('cargo_leg_execution_details')
      .upsert(
        {
          ...payload,
          created_by: user.id,
        },
        {
          onConflict: 'cargo_leg_id',
        }
      )
      .select(
        `
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
          created_at,
          updated_at
        `
      )
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || 'Failed to save route execution details' },
        { status: 500 }
      );
    }

    await syncOrderWorkflowStatusFromRouteStep(serviceSupabase, {
      orderTripLinkId: cargoLeg.order_trip_link_id as string,
      organizationId: cargoLeg.organization_id as string,
      updatedBy: user.id,
    });

    return NextResponse.json({
      success: true,
      execution_detail: data,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 }
    );
  }
}
