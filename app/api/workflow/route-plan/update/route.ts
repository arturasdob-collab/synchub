import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { canAccessOrderViaCargoRoute } from '@/lib/server/cargo-legs';
import {
  canAccessLinkedRecord,
  loadCurrentLinkingProfile,
  loadOrderLinkContext,
} from '@/lib/server/order-trip-linking';
import {
  isWorkflowCollectionMode,
  isWorkflowReloadingMode,
  upsertWorkflowRoutePlan,
} from '@/lib/server/workflow-route-plans';

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
    typeof body.order_id === 'string' && body.order_id.trim() !== ''
      ? body.order_id.trim()
      : '';
  const collectionMode = body.collection_mode;
  const reloadingMode = body.reloading_mode;

  if (!orderId) {
    return NextResponse.json({ error: 'Order id is required' }, { status: 400 });
  }

  if (!isWorkflowCollectionMode(collectionMode)) {
    return NextResponse.json({ error: 'Invalid collection mode' }, { status: 400 });
  }

  if (!isWorkflowReloadingMode(reloadingMode)) {
    return NextResponse.json({ error: 'Invalid reloading mode' }, { status: 400 });
  }

  try {
    const profile = await loadCurrentLinkingProfile(serviceSupabase, user.id);
    const { order, sharedManagerUserId } = await loadOrderLinkContext(
      serviceSupabase,
      orderId
    );

    const canEditViaShare = canAccessLinkedRecord({
      profile,
      currentUserId: user.id,
      createdBy: order.created_by,
      sharedManagerUserId,
    });

    const canEditViaCargoRoute = await canAccessOrderViaCargoRoute(
      serviceSupabase,
      user.id,
      profile.organization_id as string,
      orderId
    );

    if (!canEditViaShare && !canEditViaCargoRoute) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const routePlan = await upsertWorkflowRoutePlan(serviceSupabase, {
      organizationId: order.organization_id,
      orderId,
      collectionMode,
      reloadingMode,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      route_plan: routePlan,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to save workflow route plan',
      },
      { status: 500 }
    );
  }
}
