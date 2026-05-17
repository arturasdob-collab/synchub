import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  canAccessOrderViaCargoRoute,
  cargoLegSelect,
  ensureInternationalCargoLeg,
  mapCargoLeg,
} from '@/lib/server/cargo-legs';
import {
  canAccessLinkedRecord,
  loadCurrentLinkingProfile,
  loadOrderLinkContext,
} from '@/lib/server/order-trip-linking';

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

  const orderId = req.nextUrl.searchParams.get('orderId');
  const tripNumberQuery = (req.nextUrl.searchParams.get('q') || '').trim().toUpperCase();
  const selectedTripManagerUserId =
    (req.nextUrl.searchParams.get('managerUserId') || '').trim() || null;
  const hasTypedTripNumber = tripNumberQuery !== '';

  if (!orderId) {
    return NextResponse.json({ error: 'Order id is required' }, { status: 400 });
  }

  try {
    const profile = await loadCurrentLinkingProfile(serviceSupabase, user.id);
    const { order, sharedManagerUserId, sharedOrganizationId } = await loadOrderLinkContext(
      serviceSupabase,
      orderId
    );

    const canAccessSameOrgOrder =
      order.organization_id === profile.organization_id &&
      canAccessLinkedRecord({
        profile,
        currentUserId: user.id,
        createdBy: order.created_by,
        sharedManagerUserId,
      });

    const canAccessSharedCrossOrgOrder =
      order.organization_id !== profile.organization_id &&
      sharedOrganizationId === profile.organization_id &&
      canAccessLinkedRecord({
        profile,
        currentUserId: user.id,
        createdBy: order.created_by,
        sharedManagerUserId,
      });

    const canAccessCargoRouteOrder = await canAccessOrderViaCargoRoute(
      serviceSupabase,
      user.id,
      profile.organization_id!,
      orderId
    );

    const canAccessOrder =
      canAccessSameOrgOrder || canAccessSharedCrossOrgOrder || canAccessCargoRouteOrder;

    if (!canAccessOrder) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sourceOrganizationId = order.organization_id;
    const canManageLinkedTrips = canAccessSameOrgOrder;

    const [linkedRowsResponse, linkedTripIdsResponse] = await Promise.all([
      serviceSupabase
        .from('order_trip_links')
        .select(`
          id,
          trip_id,
          trip:trip_id (
            id,
            organization_id,
            trip_number,
            status,
            is_groupage,
            driver_name,
            truck_plate,
            trailer_plate,
            created_by,
            created_by_user:created_by (
              first_name,
              last_name
            ),
            created_at,
            carrier:carrier_company_id (
              name,
              company_code
            )
          )
        `)
        .eq('order_id', orderId)
        .eq('organization_id', sourceOrganizationId)
        .order('created_at', { ascending: false }),
      serviceSupabase
        .from('order_trip_links')
        .select('trip_id')
        .eq('organization_id', sourceOrganizationId),
    ]);

    if (linkedRowsResponse.error || linkedTripIdsResponse.error) {
      return NextResponse.json(
        {
          error:
            linkedRowsResponse.error?.message ||
            linkedTripIdsResponse.error?.message ||
            'Failed to load trip options',
        },
        { status: 500 }
      );
    }

    const linkedRows = linkedRowsResponse.data || [];

    if (canManageLinkedTrips && linkedRows.length > 0) {
      for (const row of linkedRows) {
        const trip = Array.isArray((row as any).trip)
          ? (row as any).trip[0] ?? null
          : (row as any).trip;

        if (!(row as any).id || !(row as any).trip_id || !trip) {
          continue;
        }

        await ensureInternationalCargoLeg(serviceSupabase, {
          organizationId: sourceOrganizationId,
          orderTripLinkId: (row as any).id,
          linkedTripId: (row as any).trip_id,
          linkedTripOrganizationId: trip.organization_id ?? sourceOrganizationId,
          createdBy: trip.created_by ?? user.id,
        });
      }
    }

    const linkedOrderLinkIds = linkedRows
      .map((row: any) => row.id as string | null)
      .filter(Boolean) as string[];

    let cargoLegRows: any[] = [];

    if (linkedOrderLinkIds.length > 0) {
      const { data: linkedCargoLegs, error: linkedCargoLegsError } =
        await serviceSupabase
          .from('cargo_legs')
          .select(cargoLegSelect)
          .eq('organization_id', sourceOrganizationId)
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

    const executionUserIds = Array.from(
      new Set(
        Array.from(cargoLegsByLinkId.values())
          .flat()
          .flatMap((cargoLeg: any) => [
            cargoLeg.execution_detail?.created_by ?? null,
            cargoLeg.execution_detail?.updated_by ?? null,
          ])
          .filter(
            (value: unknown): value is string =>
              typeof value === 'string' && value.trim() !== ''
          )
      )
    );

    const executionUsersById = new Map<
      string,
      { first_name: string | null; last_name: string | null }
    >();

    if (executionUserIds.length > 0) {
      const { data: executionUsers, error: executionUsersError } = await serviceSupabase
        .from('user_profiles')
        .select('id, first_name, last_name')
        .in('id', executionUserIds);

      if (executionUsersError) {
        return NextResponse.json({ error: executionUsersError.message }, { status: 500 });
      }

      for (const row of executionUsers || []) {
        if (!row?.id) {
          continue;
        }

        executionUsersById.set(row.id, {
          first_name: row.first_name ?? null,
          last_name: row.last_name ?? null,
        });
      }

      for (const [linkId, cargoLegs] of Array.from(cargoLegsByLinkId.entries())) {
        cargoLegsByLinkId.set(
          linkId,
          cargoLegs.map((cargoLeg: any) => ({
            ...cargoLeg,
            execution_detail: cargoLeg.execution_detail
              ? {
                  ...cargoLeg.execution_detail,
                  created_by_user:
                    cargoLeg.execution_detail.created_by &&
                    executionUsersById.has(cargoLeg.execution_detail.created_by)
                      ? executionUsersById.get(cargoLeg.execution_detail.created_by) ?? null
                      : null,
                  updated_by_user:
                    cargoLeg.execution_detail.updated_by &&
                    executionUsersById.has(cargoLeg.execution_detail.updated_by)
                      ? executionUsersById.get(cargoLeg.execution_detail.updated_by) ?? null
                      : null,
                }
              : null,
          }))
        );
      }
    }

    const linkedTrips = linkedRows
      .map((row: any) => {
        const trip = Array.isArray(row.trip) ? row.trip[0] ?? null : row.trip;
        const createdByUser = trip
          ? Array.isArray(trip.created_by_user)
            ? trip.created_by_user[0] ?? null
            : trip.created_by_user
          : null;

        if (!trip) return null;

        return {
          link_id: row.id,
          trip_id: row.trip_id,
          organization_id: trip.organization_id ?? null,
          trip_number: trip.trip_number,
          status: trip.status,
          is_groupage: trip.is_groupage ?? null,
          driver_name: trip.driver_name ?? null,
          truck_plate: trip.truck_plate ?? null,
          trailer_plate: trip.trailer_plate ?? null,
          created_by: trip.created_by ?? null,
          created_by_user: createdByUser
            ? {
                first_name: createdByUser.first_name ?? null,
                last_name: createdByUser.last_name ?? null,
              }
            : null,
          created_at: trip.created_at ?? null,
          carrier: trip.carrier
            ? {
                name: trip.carrier.name ?? null,
                company_code: trip.carrier.company_code ?? null,
              }
            : null,
          cargo_legs: cargoLegsByLinkId.get(row.id) || [],
        };
      })
      .filter(Boolean);

    const linkedTripIdSet = new Set<string>(
      (linkedTripIdsResponse.data || [])
        .map((row: any) => row.trip_id as string | null)
        .filter(Boolean) as string[]
    );

    if (linkedTrips.length > 0 || !canManageLinkedTrips) {
      return NextResponse.json({
        linked_trips: linkedTrips,
        available_trips: [],
        awaiting_trip_number: false,
      });
    }

    const effectiveManagerUserId =
      selectedTripManagerUserId || sharedManagerUserId || user.id;

    const { data: sharedTripIds, error: sharedTripIdsError } = await serviceSupabase
      .from('trip_manager_shares')
      .select('trip_id')
      .eq('organization_id', sourceOrganizationId)
      .eq('manager_user_id', effectiveManagerUserId);

    if (sharedTripIdsError) {
      return NextResponse.json({ error: sharedTripIdsError.message }, { status: 500 });
    }

    const sharedTripIdList = Array.from(
      new Set(
        (sharedTripIds || [])
          .map((row: any) => row.trip_id as string | null)
          .filter(Boolean) as string[]
      )
    );

    let matchedTrips: Array<{
      id: string;
      trip_number: string;
      status: string | null;
      is_groupage: boolean;
      driver_name: string | null;
      truck_plate: string | null;
      trailer_plate: string | null;
      created_at: string | null;
      carrier: {
        name: string | null;
        company_code: string | null;
      } | null;
    }> = [];

    if (sharedTripIdList.length > 0) {
      let tripsQuery = serviceSupabase
        .from('trips')
        .select(`
          id,
          trip_number,
          status,
          is_groupage,
          driver_name,
          truck_plate,
          trailer_plate,
          created_at,
          carrier:carrier_company_id (
            name,
            company_code
          )
        `)
        .eq('organization_id', sourceOrganizationId)
        .in('id', sharedTripIdList)
        .order('created_at', { ascending: false })
        .limit(20);

      if (tripNumberQuery) {
        tripsQuery = tripsQuery.ilike('trip_number', `%${tripNumberQuery}%`);
      }

      const { data: sharedTrips, error: sharedTripsError } = await tripsQuery;

      if (sharedTripsError) {
        return NextResponse.json({ error: sharedTripsError.message }, { status: 500 });
      }

      matchedTrips = (sharedTrips || [])
        .filter(
          (trip: any) =>
            trip.status === 'unconfirmed' ||
            (trip.status === 'active' && trip.is_groupage === true)
        )
        .filter((trip: any) => trip.is_groupage === true || !linkedTripIdSet.has(trip.id))
        .map((trip: any) => ({
          id: trip.id,
          trip_number: trip.trip_number,
          status: trip.status,
          is_groupage: !!trip.is_groupage,
          driver_name: trip.driver_name ?? null,
          truck_plate: trip.truck_plate ?? null,
          trailer_plate: trip.trailer_plate ?? null,
          created_at: trip.created_at ?? null,
          carrier: trip.carrier
            ? {
                name: trip.carrier.name ?? null,
                company_code: trip.carrier.company_code ?? null,
              }
            : null,
        }));
    }

    if (hasTypedTripNumber) {
      const { data: exactTypedTrip, error: exactTypedTripError } = await serviceSupabase
        .from('trips')
        .select(`
          id,
          trip_number,
          status,
          is_groupage,
          driver_name,
          truck_plate,
          trailer_plate,
          created_at,
          carrier:carrier_company_id (
            name,
            company_code
          )
        `)
        .eq('organization_id', sourceOrganizationId)
        .eq('trip_number', tripNumberQuery)
        .maybeSingle();

      if (exactTypedTripError) {
        return NextResponse.json({ error: exactTypedTripError.message }, { status: 500 });
      }

      if (
        exactTypedTrip &&
        (exactTypedTrip.status === 'unconfirmed' ||
          (exactTypedTrip.status === 'active' && exactTypedTrip.is_groupage === true)) &&
        (exactTypedTrip.is_groupage === true || !linkedTripIdSet.has(exactTypedTrip.id)) &&
        !matchedTrips.some((trip: any) => trip.id === exactTypedTrip.id)
      ) {
        const exactTypedTripCarrier = Array.isArray(exactTypedTrip.carrier)
          ? exactTypedTrip.carrier[0] ?? null
          : exactTypedTrip.carrier;

        matchedTrips.unshift({
          id: exactTypedTrip.id,
          trip_number: exactTypedTrip.trip_number,
          status: exactTypedTrip.status,
          is_groupage: !!exactTypedTrip.is_groupage,
          driver_name: exactTypedTrip.driver_name ?? null,
          truck_plate: exactTypedTrip.truck_plate ?? null,
          trailer_plate: exactTypedTrip.trailer_plate ?? null,
          created_at: exactTypedTrip.created_at ?? null,
          carrier: exactTypedTripCarrier
            ? {
                name: exactTypedTripCarrier.name ?? null,
                company_code: exactTypedTripCarrier.company_code ?? null,
              }
            : null,
        });
      }
    }

    return NextResponse.json({
      linked_trips: linkedTrips,
      available_trips: matchedTrips,
      awaiting_trip_number: false,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 }
    );
  }
}
