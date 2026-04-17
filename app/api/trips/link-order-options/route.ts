import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  canAccessLinkedRecord,
  loadCurrentLinkingProfile,
  loadTripLinkContext,
} from '@/lib/server/order-trip-linking';
import { cargoLegSelect, mapCargoLeg } from '@/lib/server/cargo-legs';

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
  const orderNumberQuery = (req.nextUrl.searchParams.get('q') || '').trim().toUpperCase();
  const hasTypedOrderNumber = orderNumberQuery !== '';

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

    const [linkedRowsResponse, linkedOrderIdsResponse] = await Promise.all([
      serviceSupabase
        .from('order_trip_links')
        .select(`
          id,
          order_id,
          trip_segment_id,
          linked_order:order_id (
            id,
            internal_order_number,
            client_order_number,
            status,
            loading_date,
            loading_city,
            loading_country,
            unloading_date,
            unloading_city,
            unloading_country,
            cargo_description,
            cargo_quantity,
            cargo_kg,
            cargo_ldm,
            price,
            currency,
            created_at,
            client:client_company_id (
              name,
              company_code
            )
          )
        `)
        .eq('trip_id', tripId)
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: false }),
      serviceSupabase
        .from('order_trip_links')
        .select('order_id')
        .eq('organization_id', profile.organization_id),
    ]);

    if (linkedRowsResponse.error || linkedOrderIdsResponse.error) {
      return NextResponse.json(
        {
          error:
            linkedRowsResponse.error?.message ||
            linkedOrderIdsResponse.error?.message ||
            'Failed to load order options',
        },
        { status: 500 }
      );
    }

    const linkedOrderLinkIds = (linkedRowsResponse.data || [])
      .map((row: any) => row.id as string | null)
      .filter(Boolean) as string[];

    let cargoLegRows: any[] = [];

    if (linkedOrderLinkIds.length > 0) {
      const { data: linkedCargoLegs, error: linkedCargoLegsError } =
        await serviceSupabase
          .from('cargo_legs')
          .select(cargoLegSelect)
          .eq('organization_id', profile.organization_id)
          .in('order_trip_link_id', linkedOrderLinkIds)
          .order('leg_order', { ascending: true });

      if (linkedCargoLegsError) {
        return NextResponse.json(
          { error: linkedCargoLegsError.message },
          { status: 500 }
        );
      }

      cargoLegRows = linkedCargoLegs || [];
    }

    const cargoLegsByLinkId = new Map<string, any[]>();

    for (const cargoLeg of cargoLegRows) {
      const linkId = cargoLeg.order_trip_link_id as string;
      const normalizedCargoLeg = mapCargoLeg(cargoLeg);

      const existing = cargoLegsByLinkId.get(linkId) || [];
      existing.push(normalizedCargoLeg);
      cargoLegsByLinkId.set(linkId, existing);
    }

    const linkedOrders = (linkedRowsResponse.data || [])
      .map((row: any) => {
        const order = Array.isArray(row.linked_order)
          ? row.linked_order[0] ?? null
          : row.linked_order;

        if (!order) return null;

        return {
          link_id: row.id,
          order_id: row.order_id,
          trip_segment_id: row.trip_segment_id ?? null,
          internal_order_number: order.internal_order_number,
          client_order_number: order.client_order_number ?? null,
          status: order.status ?? null,
          loading_date: order.loading_date ?? null,
          loading_city: order.loading_city ?? null,
          loading_country: order.loading_country ?? null,
          unloading_date: order.unloading_date ?? null,
          unloading_city: order.unloading_city ?? null,
          unloading_country: order.unloading_country ?? null,
          cargo_description: order.cargo_description ?? null,
          cargo_quantity: order.cargo_quantity ?? null,
          cargo_kg: order.cargo_kg ?? null,
          cargo_ldm: order.cargo_ldm ?? null,
          price: order.price ?? null,
          currency: order.currency ?? null,
          created_at: order.created_at ?? null,
          client: order.client
            ? {
                name: order.client.name ?? null,
                company_code: order.client.company_code ?? null,
              }
            : null,
          cargo_legs: cargoLegsByLinkId.get(row.id) || [],
        };
      })
      .filter(Boolean);

    const linkedOrderIdSet = new Set<string>(
      (linkedOrderIdsResponse.data || [])
        .map((row: any) => row.order_id as string | null)
        .filter(Boolean) as string[]
    );

    if (!sharedManagerUserId && !hasTypedOrderNumber) {
      return NextResponse.json({
        linked_orders: linkedOrders,
        available_orders: [],
        missing_trip_shared_manager: true,
      });
    }

    const { data: sharedOrderIds, error: sharedOrderIdsError } = await serviceSupabase
      .from('order_manager_shares')
      .select('order_id')
      .eq('organization_id', profile.organization_id)
      .eq('manager_user_id', sharedManagerUserId)
      .limit(200);

    if (sharedOrderIdsError) {
      return NextResponse.json({ error: sharedOrderIdsError.message }, { status: 500 });
    }

    const sharedOrderIdList = Array.from(
      new Set(
        (sharedOrderIds || [])
          .map((row: any) => row.order_id as string | null)
          .filter(Boolean) as string[]
      )
    );

    let matchedOrders: Array<{
      id: string;
      internal_order_number: string;
      client_order_number: string | null;
      status: string | null;
      price: number | null;
      currency: string | null;
      created_at: string | null;
      client: {
        name: string | null;
        company_code: string | null;
      } | null;
    }> = [];

    if (sharedOrderIdList.length > 0) {
      let ordersQuery = serviceSupabase
        .from('orders')
        .select(`
          id,
          internal_order_number,
          client_order_number,
          status,
          price,
          currency,
          created_at,
          client:client_company_id (
            name,
            company_code
          )
        `)
        .eq('organization_id', profile.organization_id)
        .in('status', ['unconfirmed', 'confirmed'])
        .in('id', sharedOrderIdList)
        .order('created_at', { ascending: false })
        .limit(20);

      if (orderNumberQuery) {
        ordersQuery = ordersQuery.ilike('internal_order_number', `%${orderNumberQuery}%`);
      }

      const { data: sharedOrders, error: sharedOrdersError } = await ordersQuery;

      if (sharedOrdersError) {
        return NextResponse.json({ error: sharedOrdersError.message }, { status: 500 });
      }

      matchedOrders = (sharedOrders || [])
        .filter((order: any) => !linkedOrderIdSet.has(order.id))
        .map((order: any) => ({
          id: order.id,
          internal_order_number: order.internal_order_number,
          client_order_number: order.client_order_number ?? null,
          status: order.status ?? null,
          price: order.price ?? null,
          currency: order.currency ?? null,
          created_at: order.created_at ?? null,
          client: order.client
            ? {
                name: order.client.name ?? null,
                company_code: order.client.company_code ?? null,
              }
            : null,
        }));
    }

    const sharedOrderIdSet = new Set<string>(
      (sharedOrderIds || [])
        .map((row: any) => row.order_id as string | null)
        .filter(Boolean) as string[]
    );

    if (hasTypedOrderNumber) {
      const { data: exactTypedOrder, error: exactTypedOrderError } = await serviceSupabase
        .from('orders')
        .select(`
          id,
          internal_order_number,
          client_order_number,
          status,
          price,
          currency,
          created_at,
          client:client_company_id (
            name,
            company_code
          )
        `)
        .eq('organization_id', profile.organization_id)
        .in('status', ['unconfirmed', 'confirmed'])
        .eq('internal_order_number', orderNumberQuery)
        .maybeSingle();

      if (exactTypedOrderError) {
        return NextResponse.json({ error: exactTypedOrderError.message }, { status: 500 });
      }

      if (
        exactTypedOrder &&
        !linkedOrderIdSet.has(exactTypedOrder.id) &&
        !matchedOrders.some((order: any) => order.id === exactTypedOrder.id)
      ) {
        const exactTypedOrderClient = Array.isArray(exactTypedOrder.client)
          ? exactTypedOrder.client[0] ?? null
          : exactTypedOrder.client;

        matchedOrders.unshift({
          id: exactTypedOrder.id,
          internal_order_number: exactTypedOrder.internal_order_number,
          client_order_number: exactTypedOrder.client_order_number ?? null,
          status: exactTypedOrder.status ?? null,
          price: exactTypedOrder.price ?? null,
          currency: exactTypedOrder.currency ?? null,
          created_at: exactTypedOrder.created_at ?? null,
          client: exactTypedOrderClient
            ? {
                name: exactTypedOrderClient.name ?? null,
                company_code: exactTypedOrderClient.company_code ?? null,
              }
            : null,
        });
      }
    }

    return NextResponse.json({
      linked_orders: linkedOrders,
      available_orders: matchedOrders,
      awaiting_order_number: false,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 }
    );
  }
}
