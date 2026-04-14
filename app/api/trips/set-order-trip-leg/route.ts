import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  canAccessLinkedRecord,
  loadCurrentLinkingProfile,
  loadOrderLinkContext,
  loadTripLinkContext,
} from '@/lib/server/order-trip-linking';

function normalizeText(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
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
  const linkId = normalizeText(body.link_id ?? body.linkId);
  const tripSegmentId = normalizeText(body.trip_segment_id ?? body.tripSegmentId);

  if (!linkId) {
    return NextResponse.json({ error: 'Link id is required' }, { status: 400 });
  }

  try {
    const profile = await loadCurrentLinkingProfile(serviceSupabase, user.id);

    const { data: existingLink, error: existingLinkError } = await serviceSupabase
      .from('order_trip_links')
      .select('id, organization_id, order_id, trip_id')
      .eq('id', linkId)
      .single();

    if (existingLinkError || !existingLink) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    }

    const { order, sharedManagerUserId: orderSharedManagerUserId } =
      await loadOrderLinkContext(serviceSupabase, existingLink.order_id);
    const { trip, sharedManagerUserId: tripSharedManagerUserId } =
      await loadTripLinkContext(serviceSupabase, existingLink.trip_id);

    if (
      existingLink.organization_id !== profile.organization_id ||
      order.organization_id !== profile.organization_id ||
      trip.organization_id !== profile.organization_id
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const canAccessOrder = canAccessLinkedRecord({
      profile,
      currentUserId: user.id,
      createdBy: order.created_by,
      sharedManagerUserId: orderSharedManagerUserId,
    });

    const canAccessTrip = canAccessLinkedRecord({
      profile,
      currentUserId: user.id,
      createdBy: trip.created_by,
      sharedManagerUserId: tripSharedManagerUserId,
    });

    const canUpdateViaSharedManager =
      !!orderSharedManagerUserId &&
      !!tripSharedManagerUserId &&
      orderSharedManagerUserId === tripSharedManagerUserId;

    if (!canAccessOrder || (!canAccessTrip && !canUpdateViaSharedManager)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (tripSegmentId) {
      const { data: tripSegment, error: tripSegmentError } = await serviceSupabase
        .from('trip_segments')
        .select('id, organization_id, trip_id')
        .eq('id', tripSegmentId)
        .single();

      if (tripSegmentError || !tripSegment) {
        return NextResponse.json({ error: 'Trip leg not found' }, { status: 404 });
      }

      if (tripSegment.organization_id !== profile.organization_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      if (tripSegment.trip_id !== existingLink.trip_id) {
        return NextResponse.json(
          { error: 'Trip leg must belong to the same trip' },
          { status: 400 }
        );
      }
    }

    const { error } = await serviceSupabase
      .from('order_trip_links')
      .update({ trip_segment_id: tripSegmentId ?? null })
      .eq('id', linkId)
      .eq('organization_id', profile.organization_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 }
    );
  }
}
