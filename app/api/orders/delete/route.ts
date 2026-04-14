import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { ORDER_DOCUMENTS_BUCKET } from '@/lib/constants/order-documents';
import {
  loadCurrentLinkingProfile,
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
  const orderId =
    typeof body.id === 'string'
      ? body.id.trim()
      : typeof body.order_id === 'string'
        ? body.order_id.trim()
        : '';

  if (!orderId) {
    return NextResponse.json({ error: 'Order id is required' }, { status: 400 });
  }

  const profile = await loadCurrentLinkingProfile(serviceSupabase, user.id);
  const organizationId = profile.organization_id;

  if (!organizationId) {
    return NextResponse.json(
      { error: 'User organization not found' },
      { status: 400 }
    );
  }

  const [orderResponse, linkedTripsResponse, orderDocumentsResponse] = await Promise.all([
    serviceSupabase
      .from('orders')
      .select('id, created_by, organization_id')
      .eq('id', orderId)
      .single(),
    serviceSupabase
      .from('order_trip_links')
      .select('trip_id')
      .eq('order_id', orderId)
      .eq('organization_id', organizationId),
    serviceSupabase
      .from('order_documents')
      .select('storage_path')
      .eq('order_id', orderId)
      .eq('organization_id', organizationId),
  ]);

  if (orderResponse.error || !orderResponse.data) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const order = orderResponse.data;

  if (order.organization_id !== organizationId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const canDelete =
    order.created_by === user.id ||
    profile.is_super_admin === true ||
    profile.is_creator === true ||
    ['OWNER', 'ADMIN'].includes(profile.role || '');

  if (!canDelete) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const affectedTripIds = Array.from(
    new Set(
      (linkedTripsResponse.data || [])
        .map((row: any) => row.trip_id as string | null)
        .filter(Boolean) as string[]
    )
  );

  const { error: deleteError } = await serviceSupabase
    .from('orders')
    .delete()
    .eq('id', orderId)
    .eq('organization_id', organizationId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const orderDocumentPaths = Array.from(
    new Set(
      (orderDocumentsResponse.data || [])
        .map((row: any) => row.storage_path as string | null)
        .filter(Boolean) as string[]
    )
  );

  if (orderDocumentPaths.length > 0) {
    await serviceSupabase.storage
      .from(ORDER_DOCUMENTS_BUCKET)
      .remove(orderDocumentPaths);
  }

  for (const tripId of affectedTripIds) {
    await syncTripStatusFromLinks(serviceSupabase, tripId, organizationId);
  }

  return NextResponse.json({ success: true });
}
