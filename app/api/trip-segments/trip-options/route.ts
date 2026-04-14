import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  canAccessLinkedRecord,
  loadCurrentLinkingProfile,
  loadTripLinkContext,
} from '@/lib/server/order-trip-linking';

function mapTripOption(trip: any) {
  const carrier = Array.isArray(trip.carrier)
    ? trip.carrier[0] ?? null
    : trip.carrier;

  return {
    id: trip.id,
    trip_number: trip.trip_number,
    status: trip.status ?? null,
    driver_name: trip.driver_name ?? null,
    truck_plate: trip.truck_plate ?? null,
    trailer_plate: trip.trailer_plate ?? null,
    is_groupage: trip.is_groupage ?? null,
    carrier: carrier
      ? {
          name: carrier.name ?? null,
          company_code: carrier.company_code ?? null,
        }
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

  const tripId = (req.nextUrl.searchParams.get('tripId') || '').trim();
  const segmentId = (req.nextUrl.searchParams.get('segmentId') || '').trim();
  const tripNumberQuery = (req.nextUrl.searchParams.get('q') || '').trim().toUpperCase();

  if (!tripId) {
    return NextResponse.json({ error: 'Trip id is required' }, { status: 400 });
  }

  try {
    const profile = await loadCurrentLinkingProfile(serviceSupabase, user.id);
    const { trip, sharedManagerUserId } = await loadTripLinkContext(
      serviceSupabase,
      tripId
    );

    if (trip.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const canAccessTrip = canAccessLinkedRecord({
      profile,
      currentUserId: user.id,
      createdBy: trip.created_by,
      sharedManagerUserId,
    });

    if (!canAccessTrip) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!tripNumberQuery) {
      return NextResponse.json({
        matched_trip: null,
        awaiting_trip_number: true,
      });
    }

    const { data: matchedTrip, error: matchedTripError } = await serviceSupabase
      .from('trips')
      .select(
        `
          id,
          trip_number,
          status,
          driver_name,
          truck_plate,
          trailer_plate,
          is_groupage,
          organization_id,
          carrier:carrier_company_id (
            name,
            company_code
          )
        `
      )
      .eq('organization_id', profile.organization_id)
      .eq('trip_number', tripNumberQuery)
      .maybeSingle();

    if (matchedTripError) {
      return NextResponse.json({ error: matchedTripError.message }, { status: 500 });
    }

    if (!matchedTrip || matchedTrip.id === trip.id) {
      return NextResponse.json({ matched_trip: null });
    }

    const { data: linkedTripUsage, error: linkedTripUsageError } = await serviceSupabase
      .from('trip_segments')
      .select('id')
      .eq('linked_trip_id', matchedTrip.id);

    if (linkedTripUsageError) {
      return NextResponse.json(
        { error: linkedTripUsageError.message },
        { status: 500 }
      );
    }

    const conflictingSegment = (linkedTripUsage || []).find(
      (row: any) => row.id !== segmentId
    );

    if (conflictingSegment) {
      return NextResponse.json({
        matched_trip: null,
        trip_already_used: true,
      });
    }

    return NextResponse.json({
      matched_trip: mapTripOption(matchedTrip),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 }
    );
  }
}
