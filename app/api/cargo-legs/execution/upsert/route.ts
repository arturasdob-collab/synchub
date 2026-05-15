import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { loadEditableCargoLegExecutionContext } from '@/lib/server/cargo-leg-execution';

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
