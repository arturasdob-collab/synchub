import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
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

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json(
      { error: 'User organization not found' },
      { status: 400 }
    );
  }

  const { data: company } = await supabase
    .from('companies')
    .select('id, organization_id')
    .eq('id', company_id)
    .eq('organization_id', profile.organization_id)
    .single();

  if (!company) {
    return NextResponse.json(
      { error: 'Company not found in your organization' },
      { status: 404 }
    );
  }

  const { error } = await supabase.from('company_contacts').insert({
    company_id,
    organization_id: profile.organization_id,
    first_name,
    last_name,
    position,
    phone,
    email,
    notes,
    created_by: user.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}