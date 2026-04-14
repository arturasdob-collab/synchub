import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  canAccessLinkedRecord,
  loadCurrentLinkingProfile,
  loadTripLinkContext,
} from '@/lib/server/order-trip-linking';
import { replaceTripManagerShare } from '@/lib/server/manager-shares';
import {
  TRIP_SEGMENT_TYPES,
  type TripSegmentType,
} from '@/lib/constants/trip-segment-types';

function normalizeSegmentOrder(value: unknown) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return NaN;
  }

  return parsed;
}

function normalizeSegmentType(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim() as TripSegmentType;
  return TRIP_SEGMENT_TYPES.includes(trimmed) ? trimmed : null;
}

function normalizeTripSegment(segment: any) {
  const linkedTrip = Array.isArray(segment.linked_trip)
    ? (segment.linked_trip[0] ?? null)
    : segment.linked_trip;
  const linkedTripCarrier = linkedTrip
    ? Array.isArray(linkedTrip.carrier)
      ? (linkedTrip.carrier[0] ?? null)
      : linkedTrip.carrier
    : null;

  return {
    id: segment.id,
    trip_id: segment.trip_id,
    linked_trip_id: segment.linked_trip_id ?? null,
    segment_order: segment.segment_order,
    segment_type: segment.segment_type,
    created_by: segment.created_by ?? null,
    created_at: segment.created_at ?? null,
    updated_at: segment.updated_at ?? null,
    linked_trip: linkedTrip
      ? {
          id: linkedTrip.id,
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
  };
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
  const tripId =
    typeof body.trip_id === 'string' ? body.trip_id.trim() : '';
  const segmentOrder = normalizeSegmentOrder(
    body.segment_order ?? body.segmentOrder
  );
  const segmentType = normalizeSegmentType(
    body.segment_type ?? body.segmentType
  );

  if (!tripId) {
    return NextResponse.json({ error: 'Trip id is required' }, { status: 400 });
  }

  if (segmentOrder === null || Number.isNaN(segmentOrder)) {
    return NextResponse.json(
      { error: 'Trip leg order must be a positive whole number' },
      { status: 400 }
    );
  }

  if (!segmentType) {
    return NextResponse.json(
      { error: 'Invalid trip leg type' },
      { status: 400 }
    );
  }

  let createdTripId: string | null = null;

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
        organization_id: profile.organization_id,
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
      .select(
        `
          id,
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
        `
      )
      .single();

    if (createTripError || !createdTrip) {
      return NextResponse.json(
        { error: createTripError?.message || 'Failed to create trip' },
        { status: 500 }
      );
    }

    createdTripId = createdTrip.id;

    if (sharedManagerUserId) {
      await replaceTripManagerShare(serviceSupabase, {
        organizationId: profile.organization_id,
        tripId: createdTrip.id,
        managerUserId: sharedManagerUserId,
        sharedBy: user.id,
      });
    }

    const { data: segment, error: createSegmentError } = await serviceSupabase
      .from('trip_segments')
      .insert({
        organization_id: profile.organization_id,
        trip_id: tripId,
        linked_trip_id: createdTrip.id,
        segment_order: segmentOrder,
        segment_type: segmentType,
        created_by: user.id,
      })
      .select(
        `
          id,
          trip_id,
          linked_trip_id,
          segment_order,
          segment_type,
          created_by,
          created_at,
          updated_at,
          linked_trip:linked_trip_id (
            id,
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
          )
        `
      )
      .single();

    if (createSegmentError || !segment) {
      await serviceSupabase
        .from('trip_manager_shares')
        .delete()
        .eq('trip_id', createdTrip.id)
        .eq('organization_id', profile.organization_id);

      await serviceSupabase
        .from('trips')
        .delete()
        .eq('id', createdTrip.id)
        .eq('organization_id', profile.organization_id);

      if (createSegmentError?.code === '23505') {
        return NextResponse.json(
          { error: 'This trip leg order already exists for the trip' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: createSegmentError?.message || 'Failed to create trip leg' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      created_trip: {
        id: createdTrip.id,
        trip_number: createdTrip.trip_number,
      },
      segment: normalizeTripSegment(segment),
    });
  } catch (error) {
    if (createdTripId) {
      await serviceSupabase.from('trip_manager_shares').delete().eq('trip_id', createdTripId);
      await serviceSupabase.from('trips').delete().eq('id', createdTripId);
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 }
    );
  }
}
