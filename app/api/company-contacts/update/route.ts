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
    id,
    first_name,
    last_name,
    position,
    phone,
    email,
    notes,
  } = body;

  if (!id || !first_name) {
    return NextResponse.json(
      { error: 'id and first_name are required' },
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

  let contactQuery = serviceSupabase
    .from('company_contacts')
    .select('id, organization_id')
    .eq('id', id);

  if (!canManageAllCompanies) {
    contactQuery = contactQuery.eq('organization_id', profile.organization_id);
  }

  const { data: contact } = await contactQuery.single();

  if (!contact) {
    return NextResponse.json(
      { error: 'Contact not found' },
      { status: 404 }
    );
  }

  const { error } = await serviceSupabase
    .from('company_contacts')
    .update({
      first_name,
      last_name,
      position,
      phone,
      email,
      notes,
    })
    .eq('id', id)
    .eq('organization_id', contact.organization_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
