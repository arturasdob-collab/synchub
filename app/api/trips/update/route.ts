import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  replaceTripManagerShare,
  validateShareableManager,
} from '@/lib/server/manager-shares';
import { validateCompanyTypeForOrganization } from '@/lib/server/company-type-validation';

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

  const {
    id,
    status,
    carrier_company_id,
    assigned_manager_id,
    groupage_responsible_manager_id,
    truck_plate,
    trailer_plate,
    driver_name,
    price,
    payment_term_days,
    payment_type,
    vat_rate,
    notes,
    is_groupage,
  } = body;

  if (!id) {
    return NextResponse.json({ error: 'Trip id is required' }, { status: 400 });
  }

  const allowedStatuses = ['unconfirmed', 'confirmed', 'active', 'completed'];

  if (!status || !allowedStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const { data: profile, error: profileError } = await serviceSupabase
    .from('user_profiles')
    .select('organization_id, role, is_super_admin, is_creator')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    return NextResponse.json(
      { error: 'User organization not found' },
      { status: 400 }
    );
  }

  const { data: existingTrip, error: existingTripError } = await serviceSupabase
    .from('trips')
    .select('id, created_by, organization_id')
    .eq('id', id)
    .single();

  if (existingTripError || !existingTrip) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
  }

  if (existingTrip.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const canEdit =
    existingTrip.created_by === user.id ||
    profile.is_super_admin === true ||
    profile.is_creator === true ||
    ['OWNER', 'ADMIN'].includes(profile.role);

  if (!canEdit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let sharedManager = null;
  let groupageManager = null;

  try {
    sharedManager = await validateShareableManager(
      serviceSupabase,
      profile.organization_id,
      body.shared_manager_user_id,
      body.shared_organization_id
    );

    groupageManager = await validateShareableManager(
      serviceSupabase,
      profile.organization_id,
      groupage_responsible_manager_id,
      body.groupage_shared_organization_id ?? body.shared_organization_id
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid manager selection' },
      { status: 400 }
    );
  }

  if (is_groupage && !groupageManager) {
    return NextResponse.json(
      { error: 'Groupage manager is required for groupage trip' },
      { status: 400 }
    );
  }

  try {
    await validateCompanyTypeForOrganization(
      serviceSupabase,
      profile.organization_id,
      carrier_company_id || null,
      'carrier'
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid carrier company' },
      { status: 400 }
    );
  }

  const effectiveSharedManagerUserId = is_groupage
    ? groupageManager?.id ?? null
    : sharedManager?.id ?? null;

  const payload = {
    status,
    carrier_company_id: carrier_company_id || null,
    assigned_manager_id: assigned_manager_id || null,
    groupage_responsible_manager_id: is_groupage ? groupageManager?.id ?? null : null,
    truck_plate: truck_plate?.trim() || null,
    trailer_plate: trailer_plate?.trim() || null,
    driver_name: driver_name?.trim() || null,
    price: price === '' || price === null || price === undefined ? null : Number(price),
    payment_term_days:
      payment_term_days === '' || payment_term_days === null || payment_term_days === undefined
        ? null
        : Number(payment_term_days),
    payment_type: payment_type?.trim() || null,
    vat_rate: vat_rate?.trim() || null,
    notes: notes?.trim() || null,
    is_groupage: !!is_groupage,
  };

  const { error } = await serviceSupabase
    .from('trips')
    .update(payload)
    .eq('id', id)
    .eq('organization_id', profile.organization_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    await replaceTripManagerShare(serviceSupabase, {
      organizationId: profile.organization_id,
      tripId: id,
      managerUserId: effectiveSharedManagerUserId,
      sharedOrganizationId: is_groupage
        ? body.groupage_shared_organization_id ?? body.shared_organization_id
        : body.shared_organization_id,
      sharedBy: user.id,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save shared manager' },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
