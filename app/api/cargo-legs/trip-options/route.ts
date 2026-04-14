import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { loadManageableOrderTripLinkContext } from '@/lib/server/cargo-legs';

function mapTripOption(trip: any) {
  const carrier = Array.isArray(trip.carrier)
    ? trip.carrier[0] ?? null
    : trip.carrier;
  const createdByUser = Array.isArray(trip.created_by_user)
    ? trip.created_by_user[0] ?? null
    : trip.created_by_user;

  return {
    id: trip.id,
    trip_number: trip.trip_number,
    status: trip.status ?? null,
    driver_name: trip.driver_name ?? null,
    truck_plate: trip.truck_plate ?? null,
    trailer_plate: trip.trailer_plate ?? null,
    is_groupage: trip.is_groupage ?? null,
    created_by: trip.created_by ?? null,
    created_by_user: createdByUser
      ? {
          first_name: createdByUser.first_name ?? null,
          last_name: createdByUser.last_name ?? null,
        }
      : null,
    carrier: carrier
      ? {
          name: carrier.name ?? null,
          company_code: carrier.company_code ?? null,
        }
      : null,
  };
}

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

  const orderTripLinkId =
    (req.nextUrl.searchParams.get('orderTripLinkId') ||
      req.nextUrl.searchParams.get('linkId') ||
      '').trim();
  const cargoLegId =
    (req.nextUrl.searchParams.get('cargoLegId') || '').trim();
  const requestedResponsibleOrganizationId =
    (req.nextUrl.searchParams.get('responsibleOrganizationId') || '').trim();
  const tripNumberQuery = (req.nextUrl.searchParams.get('q') || '')
    .trim()
    .toUpperCase();

  if (!orderTripLinkId) {
    return NextResponse.json(
      { error: 'Order-trip link id is required' },
      { status: 400 }
    );
  }

  try {
    const { profile } = await loadManageableOrderTripLinkContext(
      serviceSupabase,
      user.id,
      orderTripLinkId
    );

    let effectiveOrganizationId = requestedResponsibleOrganizationId || profile.organization_id;

    if (cargoLegId) {
      const { data: existingCargoLeg, error: existingCargoLegError } =
        await serviceSupabase
          .from('cargo_legs')
          .select('id, organization_id, responsible_organization_id')
          .eq('id', cargoLegId)
          .single();

      if (existingCargoLegError || !existingCargoLeg) {
        return NextResponse.json({ error: 'Cargo route step not found' }, { status: 404 });
      }

      if (existingCargoLeg.organization_id !== profile.organization_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      effectiveOrganizationId =
        requestedResponsibleOrganizationId ||
        existingCargoLeg.responsible_organization_id ||
        effectiveOrganizationId;
    }

    if (!tripNumberQuery) {
      return NextResponse.json({
        matched_trip: null,
        awaiting_trip_number: true,
      });
    }

    const { data: matchedTrip, error: matchedTripError } = await serviceSupabase
      .from('trips')
      .select(
        `
          id,
          trip_number,
          status,
          driver_name,
          truck_plate,
          trailer_plate,
          is_groupage,
          organization_id,
          created_by,
          created_by_user:created_by (
            first_name,
            last_name
          ),
          carrier:carrier_company_id (
            name,
            company_code
          )
        `
      )
      .eq('organization_id', effectiveOrganizationId)
      .eq('trip_number', tripNumberQuery)
      .maybeSingle();

    if (matchedTripError) {
      return NextResponse.json({ error: matchedTripError.message }, { status: 500 });
    }

    return NextResponse.json({
      matched_trip: matchedTrip ? mapTripOption(matchedTrip) : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 }
    );
  }
}
