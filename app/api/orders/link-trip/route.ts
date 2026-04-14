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
import {
  replaceOrderManagerShare,
  replaceTripManagerShare,
  validateShareableManager,
} from '@/lib/server/manager-shares';

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
  const typedTripNumber = String(body.typed_trip_number || '').trim().toUpperCase();
  const typedOrderNumber = String(body.typed_order_number || '').trim().toUpperCase();

  if (!orderId || !tripId) {
    return NextResponse.json(
      { error: 'order_id and trip_id are required' },
      { status: 400 }
    );
  }

  try {
    const profile = await loadCurrentLinkingProfile(serviceSupabase, user.id);
    const {
      order,
      sharedManagerUserId: orderSharedManagerUserId,
      sharedOrganizationId: orderSharedOrganizationId,
    } =
      await loadOrderLinkContext(serviceSupabase, orderId);
    const {
      trip,
      sharedManagerUserId: tripSharedManagerUserId,
      sharedOrganizationId: tripSharedOrganizationId,
    } =
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
    const canLinkViaManualNumber =
      (!!typedTripNumber && trip.trip_number === typedTripNumber) ||
      (!!typedOrderNumber && order.internal_order_number === typedOrderNumber);

    const canAccessBothSides =
      (canAccessOrder && canAccessTrip) ||
      (canAccessOrder && (canLinkViaSharedManager || canLinkViaManualNumber)) ||
      (canAccessTrip && (canLinkViaSharedManager || canLinkViaManualNumber));

    if (!canAccessBothSides) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const allowedTripStatuses = trip.is_groupage
      ? ['unconfirmed', 'active']
      : ['unconfirmed'];

    if (!allowedTripStatuses.includes(trip.status || '')) {
      return NextResponse.json(
        {
          error: trip.is_groupage
            ? 'Only unconfirmed or active groupage trips can be linked'
            : 'Only unconfirmed trips can be linked',
        },
        { status: 400 }
      );
    }

    const [existingOrderLinksResponse, existingTripLinksResponse] = await Promise.all([
      serviceSupabase
        .from('order_trip_links')
        .select('id')
        .eq('order_id', orderId)
        .eq('organization_id', profile.organization_id),
      serviceSupabase
        .from('order_trip_links')
        .select('id')
        .eq('trip_id', tripId)
        .eq('organization_id', profile.organization_id),
    ]);

    if (existingOrderLinksResponse.error || existingTripLinksResponse.error) {
      return NextResponse.json(
        {
          error:
            existingOrderLinksResponse.error?.message ||
            existingTripLinksResponse.error?.message ||
            'Failed to validate links',
        },
        { status: 500 }
      );
    }

    if ((existingOrderLinksResponse.data || []).length > 0) {
      return NextResponse.json(
        { error: 'Order is already linked to a trip' },
        { status: 400 }
      );
    }

    if (!trip.is_groupage && (existingTripLinksResponse.data || []).length > 0) {
      return NextResponse.json(
        { error: 'Trip is already linked to an order' },
        { status: 400 }
      );
    }

    const { error } = await serviceSupabase.from('order_trip_links').insert({
      organization_id: profile.organization_id,
      order_id: orderId,
      trip_id: tripId,
      created_by: user.id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let fallbackOrderManager:
      | {
          id: string;
          organization_id: string;
        }
      | null = null;
    let fallbackTripManager:
      | {
          id: string;
          organization_id: string;
        }
      | null = null;

    if (!orderSharedManagerUserId && order.created_by) {
      try {
        fallbackOrderManager = await validateShareableManager(
          serviceSupabase,
          order.organization_id,
          order.created_by,
          order.organization_id
        );
      } catch {}
    }

    if (!tripSharedManagerUserId && trip.created_by) {
      try {
        fallbackTripManager = await validateShareableManager(
          serviceSupabase,
          trip.organization_id,
          trip.created_by,
          trip.organization_id
        );
      } catch {}
    }

    if ((orderSharedManagerUserId || fallbackOrderManager?.id) && !tripSharedManagerUserId) {
      await replaceTripManagerShare(serviceSupabase, {
        organizationId: profile.organization_id!,
        tripId,
        managerUserId: orderSharedManagerUserId || fallbackOrderManager?.id || null,
        sharedOrganizationId:
          orderSharedOrganizationId || fallbackOrderManager?.organization_id || null,
        sharedBy: user.id,
      });
    } else if ((tripSharedManagerUserId || fallbackTripManager?.id) && !orderSharedManagerUserId) {
      await replaceOrderManagerShare(serviceSupabase, {
        organizationId: profile.organization_id!,
        orderId,
        managerUserId: tripSharedManagerUserId || fallbackTripManager?.id || null,
        sharedOrganizationId:
          tripSharedOrganizationId || fallbackTripManager?.organization_id || null,
        sharedBy: user.id,
      });
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
