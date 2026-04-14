import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  canAccessLinkedRecord,
  loadCurrentLinkingProfile,
  loadTripLinkContext,
} from '@/lib/server/order-trip-linking';
import {
  TRIP_SEGMENT_TYPES,
  type TripSegmentType,
} from '@/lib/constants/trip-segment-types';

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

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

function mapTripSegment(segment: any) {
  const linkedTrip = Array.isArray(segment.linked_trip)
    ? (segment.linked_trip[0] ?? null)
    : segment.linked_trip;
  const linkedTripCarrier = linkedTrip
    ? Array.isArray(linkedTrip.carrier)
      ? (linkedTrip.carrier[0] ?? null)
      : linkedTrip.carrier
    : null;

  const createdByUser = Array.isArray(segment.created_by_user)
    ? (segment.created_by_user[0] ?? null)
    : segment.created_by_user;

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
    created_by_user: createdByUser
      ? {
          first_name: createdByUser.first_name ?? null,
          last_name: createdByUser.last_name ?? null,
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
  const tripId = normalizeText(body.trip_id ?? body.tripId);
  const linkedTripId = normalizeText(body.linked_trip_id ?? body.linkedTripId);
  const segmentOrder = normalizeSegmentOrder(
    body.segment_order ?? body.segmentOrder
  );
  const segmentType = normalizeSegmentType(
    body.segment_type ?? body.segmentType
  );

  if (!tripId) {
    return NextResponse.json({ error: 'Trip id is required' }, { status: 400 });
  }

  if (!linkedTripId) {
    return NextResponse.json(
      { error: 'Linked trip is required' },
      { status: 400 }
    );
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

    if (linkedTripId === trip.id) {
      return NextResponse.json(
        { error: 'Linked trip cannot be the same as parent trip' },
        { status: 400 }
      );
    }

    const [linkedTripResponse, linkedTripUsageResponse] = await Promise.all([
      serviceSupabase
        .from('trips')
        .select(
          `
            id,
            organization_id
          `
        )
        .eq('id', linkedTripId)
        .single(),
      serviceSupabase
        .from('trip_segments')
        .select('id')
        .eq('linked_trip_id', linkedTripId)
        .limit(1),
    ]);

    if (linkedTripResponse.error || !linkedTripResponse.data) {
      return NextResponse.json({ error: 'Linked trip not found' }, { status: 404 });
    }

    if (linkedTripResponse.data.organization_id !== profile.organization_id) {
      return NextResponse.json(
        { error: 'Linked trip must belong to the same organization' },
        { status: 403 }
      );
    }

    if ((linkedTripUsageResponse.data || []).length > 0) {
      return NextResponse.json(
        { error: 'This trip is already used in trip legs' },
        { status: 400 }
      );
    }

    const { data, error } = await serviceSupabase
      .from('trip_segments')
      .insert({
        organization_id: profile.organization_id,
        trip_id: tripId,
        linked_trip_id: linkedTripId,
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
          created_by_user:created_by (
            first_name,
            last_name
          ),
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

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'This trip leg order already exists for the trip' },
          { status: 400 }
        );
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      segment: mapTripSegment(data),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 }
    );
  }
}
