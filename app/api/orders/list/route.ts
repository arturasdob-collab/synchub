import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  isElevatedLinkingUser,
  loadCurrentLinkingProfile,
} from '@/lib/server/order-trip-linking';
import { loadCargoVisibleOrderIds } from '@/lib/server/cargo-legs';

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
    const orderSelect = `
      id,
      organization_id,
      created_by,
      internal_order_number,
      client_order_number,
      status,
      loading_date,
      unloading_date,
      price,
      currency,
      created_at,
      load_type,
      client:client_company_id (
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
        .from('orders')
        .select(orderSelect)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      visibleRows = data || [];
    } else {
      const [ownOrdersResponse, sharedOrdersResponse] = await Promise.all([
        serviceSupabase
          .from('orders')
          .select(orderSelect)
          .eq('organization_id', organizationId)
          .eq('created_by', user.id)
          .order('created_at', { ascending: false }),
        serviceSupabase
          .from('order_manager_shares')
          .select('order_id')
          .eq('shared_organization_id', organizationId)
          .eq('manager_user_id', user.id),
      ]);

      if (ownOrdersResponse.error || sharedOrdersResponse.error) {
        return NextResponse.json(
          {
            error:
              ownOrdersResponse.error?.message ||
              sharedOrdersResponse.error?.message ||
              'Failed to load orders',
          },
          { status: 500 }
        );
      }

      const ownRows = ownOrdersResponse.data || [];
      const ownIdSet = new Set(
        ownRows
          .map((item: any) => item.id as string | null)
          .filter(Boolean) as string[]
      );
      const sharedOrderIds = Array.from(
        new Set(
          (sharedOrdersResponse.data || [])
            .map((row: any) => row.order_id as string | null)
            .filter((value: unknown): value is string => typeof value === 'string' && value !== '')
        )
      ).filter((id) => !ownIdSet.has(id));

      let sharedRows: any[] = [];

      if (sharedOrderIds.length > 0) {
        const { data: crossOrgRows, error: crossOrgError } = await serviceSupabase
          .from('orders')
          .select(orderSelect)
          .in('id', sharedOrderIds)
          .order('created_at', { ascending: false });

        if (crossOrgError) {
          return NextResponse.json({ error: crossOrgError.message }, { status: 500 });
        }

        sharedRows = crossOrgRows || [];
      }

      visibleRows = [...ownRows, ...sharedRows].sort((left: any, right: any) => {
        const leftTime = left?.created_at ? new Date(left.created_at).getTime() : 0;
        const rightTime = right?.created_at ? new Date(right.created_at).getTime() : 0;
        return rightTime - leftTime;
      });
    }

    const existingIdSet = new Set(
      visibleRows
        .map((item: any) => item.id as string | null)
        .filter(Boolean) as string[]
    );
    const cargoVisibleOrderIds = await loadCargoVisibleOrderIds(
      serviceSupabase,
      user.id,
      organizationId
    );
    const routeVisibleOrderIds = cargoVisibleOrderIds.filter(
      (id) => !existingIdSet.has(id)
    );

    if (routeVisibleOrderIds.length > 0) {
      const { data: routeRows, error: routeError } = await serviceSupabase
        .from('orders')
        .select(orderSelect)
        .in('id', routeVisibleOrderIds)
        .order('created_at', { ascending: false });

      if (routeError) {
        return NextResponse.json({ error: routeError.message }, { status: 500 });
      }

      visibleRows = [...visibleRows, ...(routeRows || [])].sort((left: any, right: any) => {
        const leftTime = left?.created_at ? new Date(left.created_at).getTime() : 0;
        const rightTime = right?.created_at ? new Date(right.created_at).getTime() : 0;
        return rightTime - leftTime;
      });
    }

    const orderIds = visibleRows.map((item: any) => item.id).filter(Boolean);
    const sourceOrganizationIds = Array.from(
      new Set(
        visibleRows
          .map((item: any) => item.organization_id as string | null)
          .filter((value: unknown): value is string => typeof value === 'string' && value !== '')
      )
    );

    let sharesByOrderId = new Map<
      string,
      {
        manager_user_id: string | null;
        manager_name: string;
      }
    >();
    let groupageOrderIdSet = new Set<string>();
    let sourceOrganizationMap = new Map<
      string,
      {
        name: string | null;
        company_code: string | null;
      }
    >();

    if (orderIds.length > 0) {
      const [
        { data: shareRows, error: shareError },
        { data: linkRows, error: linkError },
        { data: organizationRows, error: organizationError },
      ] =
        await Promise.all([
          serviceSupabase
            .from('order_manager_shares')
            .select('order_id, manager_user_id')
            .in('order_id', orderIds),
          serviceSupabase
            .from('order_trip_links')
            .select(
              `
                order_id,
                trip:trip_id (
                  is_groupage
                )
              `
            )
            .in('order_id', orderIds),
          sourceOrganizationIds.length > 0
            ? serviceSupabase
                .from('organizations')
                .select('id, name, company_code')
                .in('id', sourceOrganizationIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

      if (shareError) {
        return NextResponse.json({ error: shareError.message }, { status: 500 });
      }

      if (linkError) {
        return NextResponse.json({ error: linkError.message }, { status: 500 });
      }

      if (organizationError) {
        return NextResponse.json({ error: organizationError.message }, { status: 500 });
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

      sharesByOrderId = new Map(
        (shareRows || []).map((share: any) => {
          const manager = managerMap.get(share.manager_user_id);
          const managerName =
            `${manager?.first_name || ''} ${manager?.last_name || ''}`.trim() || '-';

          return [
            share.order_id as string,
            {
              manager_user_id: (share.manager_user_id as string | null) ?? null,
              manager_name: managerName,
            },
          ];
        })
      );

      for (const row of linkRows || []) {
        const trip = Array.isArray((row as any).trip)
          ? (row as any).trip[0] ?? null
          : (row as any).trip;

        if (trip?.is_groupage) {
          groupageOrderIdSet.add((row as any).order_id as string);
        }
      }

      sourceOrganizationMap = new Map(
        (organizationRows || []).map((organization: any) => [
          organization.id as string,
          {
            name: organization.name ?? null,
            company_code: organization.company_code ?? null,
          },
        ])
      );
    }

    const orders = visibleRows.map((item: any) => {
      const client = Array.isArray(item.client) ? (item.client[0] ?? null) : item.client;
      const createdByUser = Array.isArray(item.created_by_user)
        ? (item.created_by_user[0] ?? null)
        : item.created_by_user;
      const share = sharesByOrderId.get(item.id) ?? null;
      const sourceOrganization =
        item.organization_id && item.organization_id !== organizationId
          ? sourceOrganizationMap.get(item.organization_id)
          : null;
      const displayLoadType = groupageOrderIdSet.has(item.id)
        ? 'Groupage'
        : item.load_type ?? null;

      return {
        id: item.id,
        internal_order_number: item.internal_order_number,
        client_order_number:
          item.organization_id !== organizationId
            ? item.internal_order_number
            : item.client_order_number,
        status: item.status,
        loading_date: item.loading_date ?? null,
        unloading_date: item.unloading_date ?? null,
        price: item.price ?? null,
        currency: item.currency,
        created_at: item.created_at,
        load_type: item.load_type ?? null,
        display_load_type: displayLoadType,
        client: sourceOrganization
          ? {
              name: sourceOrganization.name ?? null,
              company_code: sourceOrganization.company_code ?? null,
            }
          : client
            ? {
                name: client.name ?? null,
                company_code: client.company_code ?? null,
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
      orders,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load orders' },
      { status: 500 }
    );
  }
}
