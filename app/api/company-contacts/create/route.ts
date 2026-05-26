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

  const body = await req.json();

  const {
    company_id,
    first_name,
    last_name,
    position,
    phone,
    email,
    notes,
  } = body;

  if (!company_id || !first_name) {
    return NextResponse.json(
      { error: 'company_id and first_name are required' },
      { status: 400 }
    );
  }

  const { data: profile } = await serviceSupabase
    .from('user_profiles')
    .select('organization_id, is_super_admin, is_creator')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json(
      { error: 'Profile not found' },
      { status: 400 }
    );
  }

  const canManageAllCompanies = !!profile.is_super_admin || !!profile.is_creator;

  let companyQuery = serviceSupabase
    .from('companies')
    .select('id, organization_id')
    .eq('id', company_id);

  if (!canManageAllCompanies) {
    companyQuery = companyQuery.eq('organization_id', profile.organization_id);
  }

  const { data: company } = await companyQuery.single();

  if (!company) {
    return NextResponse.json(
      { error: 'Company not found' },
      { status: 404 }
    );
  }

  const { data, error } = await serviceSupabase.from('company_contacts').insert({
    company_id,
    organization_id: company.organization_id,
    first_name,
    last_name,
    position,
    phone,
    email,
    notes,
    created_by: user.id,
  }).select('id, first_name, last_name, phone, email').single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, contact: data });
}
