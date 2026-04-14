import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { SHAREABLE_MANAGER_ROLES } from '@/lib/server/manager-shares';

export async function GET(req: Request) {
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

  const { data: profile, error: profileError } = await serviceSupabase
    .from('user_profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    return NextResponse.json(
      { error: 'User organization not found' },
      { status: 400 }
    );
  }

  const requestedOrganizationId =
    typeof new URL(req.url).searchParams.get('organizationId') === 'string'
      ? new URL(req.url).searchParams.get('organizationId')!.trim()
      : '';

  const effectiveOrganizationId =
    requestedOrganizationId || profile.organization_id;

  const { data, error } = await serviceSupabase
    .from('user_profiles')
    .select('id, first_name, last_name')
    .eq('organization_id', effectiveOrganizationId)
    .eq('disabled', false)
    .in('role', [...SHAREABLE_MANAGER_ROLES])
    .order('first_name', { ascending: true })
    .order('last_name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    managers: (data || []).map((manager: any) => ({
      id: manager.id,
      first_name: manager.first_name ?? null,
      last_name: manager.last_name ?? null,
    })),
  });
}
