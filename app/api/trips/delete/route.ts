import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  loadCurrentLinkingProfile,
  syncOrderStatusFromLinks,
} from '@/lib/server/order-trip-linking';
import { canAccessTripViaCargoRoute } from '@/lib/server/cargo-legs';

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
    typeof body.id === 'string'
      ? body.id.trim()
      : typeof body.trip_id === 'string'
        ? body.trip_id.trim()
        : '';

  if (!tripId) {
    return NextResponse.json({ error: 'Trip id is required' }, { status: 400 });
  }

  const profile = await loadCurrentLinkingProfile(serviceSupabase, user.id);
  const viewerOrganizationId = profile.organization_id;

  if (!viewerOrganizationId) {
    return NextResponse.json(
      { error: 'User organization not found' },
      { status: 400 }
    );
  }

  const [tripResponse, linkedOrdersResponse] = await Promise.all([
    serviceSupabase
      .from('trips')
      .select('id, created_by, organization_id')
      .eq('id', tripId)
      .single(),
    serviceSupabase
      .from('order_trip_links')
      .select('order_id, organization_id')
      .eq('trip_id', tripId),
  ]);

  if (tripResponse.error || !tripResponse.data) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
  }

  const trip = tripResponse.data;
  const canAccessViaCargoRoute = await canAccessTripViaCargoRoute(
    serviceSupabase,
    user.id,
    viewerOrganizationId,
    tripId
  );

  const canDelete =
    trip.created_by === user.id ||
    (trip.organization_id === viewerOrganizationId &&
      (profile.is_super_admin === true ||
        profile.is_creator === true ||
        ['OWNER', 'ADMIN'].includes(profile.role || '')));

  if (!canDelete) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (trip.organization_id !== viewerOrganizationId && !canAccessViaCargoRoute && trip.created_by !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const affectedOrderRows = Array.from(
    new Map(
      (linkedOrdersResponse.data || [])
        .map((row: any) => {
          const orderId = row.order_id as string | null;
          const organizationId = row.organization_id as string | null;
          return orderId && organizationId ? [`${organizationId}:${orderId}`, { orderId, organizationId }] : null;
        })
        .filter(Boolean) as Array<[string, { orderId: string; organizationId: string }]>
    ).values()
  );

  const { error: detachCargoLegsError } = await serviceSupabase
    .from('cargo_legs')
    .update({ linked_trip_id: null })
    .eq('linked_trip_id', tripId);

  if (detachCargoLegsError) {
    return NextResponse.json(
      { error: detachCargoLegsError.message },
      { status: 500 }
    );
  }

  const { error: deleteDraftError } = await serviceSupabase
    .from('trip_order_drafts')
    .delete()
    .eq('trip_id', tripId);

  if (deleteDraftError) {
    return NextResponse.json({ error: deleteDraftError.message }, { status: 500 });
  }

  const { error: deleteTripError } = await serviceSupabase
    .from('trips')
    .delete()
    .eq('id', tripId)
    .eq('organization_id', trip.organization_id);

  if (deleteTripError) {
    return NextResponse.json({ error: deleteTripError.message }, { status: 500 });
  }

  for (const affectedOrder of affectedOrderRows) {
    await syncOrderStatusFromLinks(
      serviceSupabase,
      affectedOrder.orderId,
      affectedOrder.organizationId
    );
  }

  return NextResponse.json({ success: true });
}
