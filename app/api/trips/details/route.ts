import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  canAccessLinkedRecord,
  loadCurrentLinkingProfile,
  loadTripLinkContext,
} from '@/lib/server/order-trip-linking';
import { canAccessTripViaCargoRoute } from '@/lib/server/cargo-legs';
import { loadWorkflowFieldUpdates } from '@/lib/server/workflow-field-updates';

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

  const tripId = req.nextUrl.searchParams.get('tripId');

  if (!tripId) {
    return NextResponse.json({ error: 'Trip id is required' }, { status: 400 });
  }

  try {
    const profile = await loadCurrentLinkingProfile(serviceSupabase, user.id);
    const { trip, sharedManagerUserId, sharedOrganizationId } = await loadTripLinkContext(
      serviceSupabase,
      tripId
    );
    const canAccessViaCargoRoute = await canAccessTripViaCargoRoute(
      serviceSupabase,
      user.id,
      profile.organization_id as string,
      tripId
    );

    const isSameOrganization = trip.organization_id === profile.organization_id;
    const canAccessTrip =
      (isSameOrganization &&
        canAccessLinkedRecord({
          profile,
          currentUserId: user.id,
          createdBy: trip.created_by,
          sharedManagerUserId,
        })) ||
      trip.created_by === user.id ||
      (sharedOrganizationId === profile.organization_id &&
        sharedManagerUserId === user.id) ||
      canAccessViaCargoRoute;

    if (!canAccessTrip) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await serviceSupabase
      .from('trips')
      .select(`
        id,
        trip_number,
        status,
        carrier_company_id,
        groupage_responsible_manager_id,
        truck_plate,
        trailer_plate,
        driver_name,
        price,
        payment_term_days,
        payment_type,
        vat_rate,
        notes,
        is_groupage,
        created_at,
        updated_at,
        groupage_manager:groupage_responsible_manager_id (
          first_name,
          last_name
        ),
        carrier:carrier_company_id (
          name,
          company_code
        ),
        created_by_user:created_by (
          first_name,
          last_name
        )
      `)
      .eq('id', tripId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    const carrier = Array.isArray((data as any).carrier)
      ? (data as any).carrier[0] ?? null
      : (data as any).carrier;
    const createdByUser = Array.isArray((data as any).created_by_user)
      ? (data as any).created_by_user[0] ?? null
      : (data as any).created_by_user;
    const groupageManager = Array.isArray((data as any).groupage_manager)
      ? (data as any).groupage_manager[0] ?? null
      : (data as any).groupage_manager;
    const workflowFieldUpdates = await loadWorkflowFieldUpdates(serviceSupabase, {
      recordType: 'trip',
      recordIds: [tripId],
    });
    const getWorkflowValue = (fieldKey: string) =>
      workflowFieldUpdates.get(`trip:${tripId}:${fieldKey}`)?.value_text ?? null;

    const tripPayload: any = {
      id: (data as any).id,
      trip_number: (data as any).trip_number,
      status: (data as any).status,
      can_view_financials: isSameOrganization,
      carrier_company_id: (data as any).carrier_company_id ?? null,
      groupage_responsible_manager_id:
        (data as any).groupage_responsible_manager_id ?? null,
      truck_plate: (data as any).truck_plate ?? null,
      trailer_plate: (data as any).trailer_plate ?? null,
      driver_name: (data as any).driver_name ?? null,
      price: (data as any).price ?? null,
      payment_term_days: (data as any).payment_term_days ?? null,
      payment_type: (data as any).payment_type ?? null,
      vat_rate: (data as any).vat_rate ?? null,
      notes: (data as any).notes ?? null,
      is_groupage: !!(data as any).is_groupage,
      created_at: (data as any).created_at ?? null,
      updated_at: (data as any).updated_at ?? null,
      carrier: carrier
        ? {
            name: carrier.name ?? null,
            company_code: carrier.company_code ?? null,
          }
        : null,
      created_by_user: createdByUser
        ? {
            first_name: createdByUser.first_name ?? null,
            last_name: createdByUser.last_name ?? null,
          }
        : null,
      groupage_manager: groupageManager
        ? {
            first_name: groupageManager.first_name ?? null,
            last_name: groupageManager.last_name ?? null,
          }
        : null,
      workflow_contact_display: getWorkflowValue('contact'),
      workflow_trip_vehicle_display: getWorkflowValue('trip_vehicle'),
    };

    const costOverride = getWorkflowValue('cost');
    if (costOverride !== null) {
      tripPayload.price = parseWorkflowNumericValue(costOverride);
    }

    return NextResponse.json({
      trip: tripPayload,
      shared_manager_user_id: sharedManagerUserId ?? '',
      shared_organization_id: sharedOrganizationId ?? trip.organization_id ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 }
    );
  }
}
