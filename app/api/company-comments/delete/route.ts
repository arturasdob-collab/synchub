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

  const { id } = await req.json();

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('organization_id,is_super_admin,is_creator,role')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
  }

  const { data: existing } = await supabase
    .from('company_comments')
    .select('created_by, organization_id')
    .eq('id', id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
  }

  const canDelete =
    profile.is_super_admin ||
    profile.is_creator ||
    profile.role === 'OWNER' ||
    existing.created_by === user.id;

  if (!canDelete) {
    return NextResponse.json({ error: 'No permission' }, { status: 403 });
  }

  const { error } = await supabase
    .from('company_comments')
    .delete()
    .eq('id', id)
    .eq('organization_id', profile.organization_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}