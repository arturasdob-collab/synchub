import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  replaceTripManagerShare,
  validateShareableManager,
} from '@/lib/server/manager-shares';

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
  const tripId = String(body.trip_id || '').trim();

  if (!tripId) {
    return NextResponse.json({ error: 'Trip id is required' }, { status: 400 });
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
    .select('id, created_by, organization_id, is_groupage')
    .eq('id', tripId)
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

  let manager = null;

  try {
    manager = await validateShareableManager(
      serviceSupabase,
      profile.organization_id,
      body.shared_manager_user_id,
      body.shared_organization_id
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid manager selection' },
      { status: 400 }
    );
  }

  if (existingTrip.is_groupage && !manager) {
    return NextResponse.json(
      { error: 'Groupage manager is required for groupage trip' },
      { status: 400 }
    );
  }

  try {
    if (existingTrip.is_groupage) {
      const { error } = await serviceSupabase
        .from('trips')
        .update({ groupage_responsible_manager_id: manager?.id ?? null })
        .eq('id', tripId)
        .eq('organization_id', profile.organization_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    await replaceTripManagerShare(serviceSupabase, {
      organizationId: profile.organization_id,
      tripId,
      managerUserId: manager?.id ?? null,
      sharedOrganizationId: body.shared_organization_id,
      sharedBy: user.id,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save manager' },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
