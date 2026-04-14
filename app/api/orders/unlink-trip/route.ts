import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  canAccessLinkedRecord,
  loadCurrentLinkingProfile,
  loadOrderLinkContext,
  loadTripLinkContext,
  syncOrderStatusFromLinks,
  syncTripStatusFromLinks,
} from '@/lib/server/order-trip-linking';

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
  const orderId = String(body.order_id || '').trim();
  const tripId = String(body.trip_id || '').trim();

  if (!orderId || !tripId) {
    return NextResponse.json(
      { error: 'order_id and trip_id are required' },
      { status: 400 }
    );
  }

  try {
    const profile = await loadCurrentLinkingProfile(serviceSupabase, user.id);
    const { order, sharedManagerUserId: orderSharedManagerUserId } =
      await loadOrderLinkContext(serviceSupabase, orderId);
    const { trip, sharedManagerUserId: tripSharedManagerUserId } =
      await loadTripLinkContext(serviceSupabase, tripId);

    if (
      order.organization_id !== profile.organization_id ||
      trip.organization_id !== profile.organization_id ||
      order.organization_id !== trip.organization_id
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

    const canLinkViaSharedManager =
      !!orderSharedManagerUserId &&
      !!tripSharedManagerUserId &&
      orderSharedManagerUserId === tripSharedManagerUserId;

    if (!canAccessOrder || (!canAccessTrip && !canLinkViaSharedManager)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: existingLink, error: existingLinkError } = await serviceSupabase
      .from('order_trip_links')
      .select('id')
      .eq('order_id', orderId)
      .eq('trip_id', tripId)
      .eq('organization_id', profile.organization_id)
      .maybeSingle();

    if (existingLinkError) {
      return NextResponse.json({ error: existingLinkError.message }, { status: 500 });
    }

    if (!existingLink) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    }

    const { error } = await serviceSupabase
      .from('order_trip_links')
      .delete()
      .eq('id', existingLink.id)
      .eq('organization_id', profile.organization_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { error: clearOrderShareError } = await serviceSupabase
      .from('order_manager_shares')
      .delete()
      .eq('order_id', orderId)
      .eq('organization_id', profile.organization_id);

    if (clearOrderShareError) {
      return NextResponse.json({ error: clearOrderShareError.message }, { status: 500 });
    }

    const { count: remainingTripLinksCount, error: remainingTripLinksError } =
      await serviceSupabase
        .from('order_trip_links')
        .select('id', { count: 'exact', head: true })
        .eq('trip_id', tripId)
        .eq('organization_id', profile.organization_id);

    if (remainingTripLinksError) {
      return NextResponse.json(
        { error: remainingTripLinksError.message },
        { status: 500 }
      );
    }

    if ((remainingTripLinksCount || 0) === 0) {
      const { error: clearTripShareError } = await serviceSupabase
        .from('trip_manager_shares')
        .delete()
        .eq('trip_id', tripId)
        .eq('organization_id', profile.organization_id);

      if (clearTripShareError) {
        return NextResponse.json({ error: clearTripShareError.message }, { status: 500 });
      }
    }

    const [updatedOrderStatus, updatedTripStatus] = await Promise.all([
      syncOrderStatusFromLinks(serviceSupabase, orderId, profile.organization_id),
      syncTripStatusFromLinks(serviceSupabase, tripId, profile.organization_id),
    ]);

    return NextResponse.json({
      success: true,
      order_status: updatedOrderStatus,
      trip_status: updatedTripStatus,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 }
    );
  }
}
