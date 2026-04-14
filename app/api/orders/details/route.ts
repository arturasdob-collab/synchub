import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  canAccessLinkedRecord,
  loadCurrentLinkingProfile,
  loadOrderLinkContext,
} from '@/lib/server/order-trip-linking';
import { canAccessOrderViaCargoRoute } from '@/lib/server/cargo-legs';

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

  if (!orderId) {
    return NextResponse.json({ error: 'Order id is required' }, { status: 400 });
  }

  try {
    const profile = await loadCurrentLinkingProfile(serviceSupabase, user.id);
    const { order, sharedManagerUserId, sharedOrganizationId } = await loadOrderLinkContext(
      serviceSupabase,
      orderId
    );
    const canAccessViaCargoRoute = await canAccessOrderViaCargoRoute(
      serviceSupabase,
      user.id,
      profile.organization_id as string,
      orderId
    );

    const isSameOrganization = order.organization_id === profile.organization_id;
    const canAccessOrder = isSameOrganization
      ? canAccessLinkedRecord({
          profile,
          currentUserId: user.id,
          createdBy: order.created_by,
          sharedManagerUserId,
        })
      : (sharedOrganizationId === profile.organization_id &&
          sharedManagerUserId === user.id) ||
        canAccessViaCargoRoute;

    if (!canAccessOrder) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await serviceSupabase
      .from('orders')
      .select(
        `
          id,
          internal_order_number,
          client_order_number,
          status,
          loading_date,
          loading_time_from,
          loading_time_to,
          loading_address,
          loading_city,
          loading_postal_code,
          loading_country,
          loading_contact,
          loading_reference,
          loading_customs_info,
          unloading_date,
          unloading_time_from,
          unloading_time_to,
          unloading_address,
          unloading_city,
          unloading_postal_code,
          unloading_country,
          unloading_contact,
          unloading_reference,
          unloading_customs_info,
          shipper_name,
          consignee_name,
          received_from_name,
          received_from_contact,
          cargo_kg,
          cargo_quantity,
          cargo_description,
          cargo_ldm,
          load_type,
          has_ex1,
          has_t1,
          has_adr,
          has_sent,
          price,
          vat_rate,
          currency,
          payment_term_text,
          payment_type,
          notes,
          created_at,
          updated_at,
          client:client_company_id (
            id,
            name,
            company_code
          ),
          assigned_manager:assigned_manager_id (
            first_name,
            last_name
          ),
          created_by_user:created_by (
            first_name,
            last_name,
            phone,
            email
          )
        `
      )
      .eq('id', orderId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const client = Array.isArray((data as any).client)
      ? (data as any).client[0] ?? null
      : (data as any).client;
    const assignedManager = Array.isArray((data as any).assigned_manager)
      ? (data as any).assigned_manager[0] ?? null
      : (data as any).assigned_manager;
    const createdByUser = Array.isArray((data as any).created_by_user)
      ? (data as any).created_by_user[0] ?? null
      : (data as any).created_by_user;
    const sourceOrganization =
      !isSameOrganization && order.organization_id
        ? await serviceSupabase
            .from('organizations')
            .select('id, name, company_code')
            .eq('id', order.organization_id)
            .maybeSingle()
        : { data: null, error: null };

    if (sourceOrganization.error) {
      return NextResponse.json({ error: sourceOrganization.error.message }, { status: 500 });
    }

    const sourceOrganizationData = sourceOrganization.data;
    const createdByName =
      `${createdByUser?.first_name || ''} ${createdByUser?.last_name || ''}`.trim() || null;
    const createdByContact = [createdByUser?.phone, createdByUser?.email]
      .filter(Boolean)
      .map((value) => value!.trim())
      .filter(Boolean)
      .join(' / ');

    return NextResponse.json({
      order: {
        ...(data as any),
        can_view_financials: isSameOrganization,
        client_order_number:
          !isSameOrganization
            ? (data as any).internal_order_number ?? null
            : (data as any).client_order_number ?? null,
        client:
          !isSameOrganization && sourceOrganizationData
            ? {
                id: null,
                name: sourceOrganizationData.name ?? null,
                company_code: (sourceOrganizationData as any).company_code ?? null,
              }
            : client
              ? {
                  id: client.id ?? null,
                  name: client.name ?? null,
                  company_code: client.company_code ?? null,
                }
              : null,
        received_from_name:
          !isSameOrganization ? createdByName ?? (data as any).received_from_name ?? null : (data as any).received_from_name ?? null,
        received_from_contact:
          !isSameOrganization
            ? createdByContact || (data as any).received_from_contact || null
            : (data as any).received_from_contact ?? null,
        assigned_manager: assignedManager
          ? {
              first_name: assignedManager.first_name ?? null,
              last_name: assignedManager.last_name ?? null,
            }
          : null,
        created_by_user: createdByUser
          ? {
              first_name: createdByUser.first_name ?? null,
              last_name: createdByUser.last_name ?? null,
              phone: createdByUser.phone ?? null,
              email: createdByUser.email ?? null,
            }
          : null,
      },
      shared_manager_user_id: sharedManagerUserId ?? '',
      shared_organization_id: sharedOrganizationId ?? order.organization_id ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 }
    );
  }
}
