import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

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

  const { id, field, value } = await req.json();

  if (!id || !field || !value) {
    return NextResponse.json({ exists: false });
  }

  if (field !== 'name' && field !== 'company_code') {
    return NextResponse.json({ error: 'Invalid field' }, { status: 400 });
  }

  const { data: profile } = await serviceSupabase
    .from('user_profiles')
    .select('organization_id, is_super_admin, is_creator')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 400 });
  }

  const queryField = field === 'name' ? 'name' : 'company_code';
  const canManageAllCompanies = !!profile.is_super_admin || !!profile.is_creator;

  let targetCompanyQuery = serviceSupabase
    .from('companies')
    .select('organization_id')
    .eq('id', id);

  if (!canManageAllCompanies) {
    targetCompanyQuery = targetCompanyQuery.eq('organization_id', profile.organization_id);
  }

  const { data: targetCompany } = await targetCompanyQuery.single();

  if (!targetCompany?.organization_id) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  const { data, error } = await serviceSupabase
    .from('companies')
    .select('id')
    .eq('organization_id', targetCompany.organization_id)
    .neq('id', id)
    .ilike(queryField, String(value).trim())
    .limit(1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ exists: !!data && data.length > 0 });
}
