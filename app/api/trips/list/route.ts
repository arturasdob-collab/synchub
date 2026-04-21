import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  isElevatedLinkingUser,
  loadCurrentLinkingProfile,
} from '@/lib/server/order-trip-linking';
import { loadCargoVisibleTripIds } from '@/lib/server/cargo-legs';
import { loadWorkflowFieldUpdates } from '@/lib/server/workflow-field-updates';

export async function GET() {
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

  try {
    const profile = await loadCurrentLinkingProfile(serviceSupabase, user.id);
    const organizationId = profile.organization_id as string;
    const tripSelect = `
      id,
      organization_id,
      created_by,
      trip_number,
      status,
      truck_plate,
      trailer_plate,
      driver_name,
      price,
      payment_term_days,
      payment_type,
      vat_rate,
      is_groupage,
      created_at,
      carrier:carrier_company_id (
        name,
        company_code
      ),
      created_by_user:created_by (
        first_name,
        last_name
      )
    `;

    let visibleRows: any[] = [];

    if (isElevatedLinkingUser(profile)) {
      const { data, error } = await serviceSupabase
        .from('trips')
        .select(tripSelect)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      visibleRows = data || [];
    } else {
      const [ownTripsResponse, sharedTripsResponse] = await Promise.all([
        serviceSupabase
          .from('trips')
          .select(tripSelect)
          .eq('created_by', user.id)
          .order('created_at', { ascending: false }),
        serviceSupabase
          .from('trip_manager_shares')
          .select('trip_id')
          .eq('shared_organization_id', organizationId)
          .eq('manager_user_id', user.id),
      ]);

      if (ownTripsResponse.error || sharedTripsResponse.error) {
        return NextResponse.json(
          {
            error:
              ownTripsResponse.error?.message ||
              sharedTripsResponse.error?.message ||
              'Failed to load trips',
          },
          { status: 500 }
        );
      }

      const ownRows = ownTripsResponse.data || [];
      const ownIdSet = new Set(
        ownRows
          .map((item: any) => item.id as string | null)
          .filter(Boolean) as string[]
      );
      const sharedTripIds = Array.from(
        new Set(
          (sharedTripsResponse.data || [])
            .map((row: any) => row.trip_id as string | null)
            .filter((value: unknown): value is string => typeof value === 'string' && value !== '')
        )
      ).filter((id) => !ownIdSet.has(id));

      let sharedRows: any[] = [];

      if (sharedTripIds.length > 0) {
        const { data: crossOrgRows, error: crossOrgError } = await serviceSupabase
          .from('trips')
          .select(tripSelect)
          .in('id', sharedTripIds)
          .order('created_at', { ascending: false });

        if (crossOrgError) {
          return NextResponse.json({ error: crossOrgError.message }, { status: 500 });
        }

        sharedRows = crossOrgRows || [];
      }

      const sharedIdSet = new Set(
        sharedRows
          .map((item: any) => item.id as string | null)
          .filter(Boolean) as string[]
      );
      const cargoVisibleTripIds = await loadCargoVisibleTripIds(
        serviceSupabase,
        user.id,
        organizationId
      );
      const routeTripIds = cargoVisibleTripIds.filter(
        (id) => !ownIdSet.has(id) && !sharedIdSet.has(id)
      );
      let routeRows: any[] = [];

      if (routeTripIds.length > 0) {
        const { data: routeVisibleRows, error: routeVisibleError } =
          await serviceSupabase
            .from('trips')
            .select(tripSelect)
            .in('id', routeTripIds)
            .order('created_at', { ascending: false });

        if (routeVisibleError) {
          return NextResponse.json({ error: routeVisibleError.message }, { status: 500 });
        }

        routeRows = routeVisibleRows || [];
      }

      visibleRows = [...ownRows, ...sharedRows, ...routeRows].sort((left: any, right: any) => {
        const leftTime = left?.created_at ? new Date(left.created_at).getTime() : 0;
        const rightTime = right?.created_at ? new Date(right.created_at).getTime() : 0;
        return rightTime - leftTime;
      });
    }

    const tripIds = visibleRows.map((item: any) => item.id).filter(Boolean);

    let sharesByTripId = new Map<
      string,
      {
        manager_user_id: string | null;
        manager_name: string;
      }
    >();

    if (tripIds.length > 0) {
      const { data: shareRows, error: shareError } = await serviceSupabase
        .from('trip_manager_shares')
        .select('trip_id, manager_user_id')
        .in('trip_id', tripIds);

      if (shareError) {
        return NextResponse.json({ error: shareError.message }, { status: 500 });
      }

      const managerIds = Array.from(
        new Set(
          (shareRows || [])
            .map((item: any) => item.manager_user_id)
            .filter((value: unknown): value is string => typeof value === 'string' && value !== '')
        )
      );

      const managerMap = new Map<
        string,
        {
          first_name: string | null;
          last_name: string | null;
        }
      >();

      if (managerIds.length > 0) {
        const { data: managerRows, error: managerError } = await serviceSupabase
          .from('user_profiles')
          .select('id, first_name, last_name')
          .in('id', managerIds);

        if (managerError) {
          return NextResponse.json({ error: managerError.message }, { status: 500 });
        }

        for (const row of managerRows || []) {
          managerMap.set(row.id as string, {
            first_name: (row as any).first_name ?? null,
            last_name: (row as any).last_name ?? null,
          });
        }
      }

      sharesByTripId = new Map(
        (shareRows || []).map((share: any) => {
          const manager = managerMap.get(share.manager_user_id);
          const managerName =
            `${manager?.first_name || ''} ${manager?.last_name || ''}`.trim() || '-';

          return [
            share.trip_id as string,
            {
              manager_user_id: (share.manager_user_id as string | null) ?? null,
              manager_name: managerName,
            },
          ];
        })
      );
    }

    const workflowStatusUpdates = await loadWorkflowFieldUpdates(serviceSupabase, {
      recordType: 'trip',
      recordIds: tripIds,
    });

    const trips = visibleRows.map((item: any) => {
      const carrier = Array.isArray(item.carrier) ? item.carrier[0] ?? null : item.carrier;
      const createdByUser = Array.isArray(item.created_by_user)
        ? item.created_by_user[0] ?? null
        : item.created_by_user;
      const share = sharesByTripId.get(item.id) ?? null;

      return {
        id: item.id,
        trip_number: item.trip_number,
        status:
          workflowStatusUpdates.get(`trip:${item.id}:status`)?.value_text ??
          item.status,
        truck_plate: item.truck_plate ?? null,
        trailer_plate: item.trailer_plate ?? null,
        driver_name: item.driver_name ?? null,
        price: item.price ?? null,
        payment_term_days: item.payment_term_days ?? null,
        payment_type: item.payment_type ?? null,
        vat_rate: item.vat_rate ?? null,
        is_groupage: !!item.is_groupage,
        display_type: item.is_groupage ? 'Groupage' : 'Regular',
        created_at: item.created_at,
        carrier: carrier
          ? {
              name: carrier.name ?? null,
              company_code: carrier.company_code ?? null,
            }
          : null,
        linked_manager: share
          ? {
              id: share.manager_user_id,
              name: share.manager_name,
            }
          : null,
        can_view_financials: item.organization_id === organizationId,
        created_by_user: createdByUser
          ? {
              first_name: createdByUser.first_name ?? null,
              last_name: createdByUser.last_name ?? null,
            }
          : null,
      };
    });

    return NextResponse.json({
      viewer_user_id: user.id,
      trips,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load trips' },
      { status: 500 }
    );
  }
}
