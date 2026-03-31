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

  const { company_id, comment, rating } = body;

  if (!company_id || !comment?.trim()) {
    return NextResponse.json(
      { error: 'company_id and comment are required' },
      { status: 400 }
    );
  }

  if (rating !== null && rating !== undefined) {
    if (
      typeof rating !== 'number' ||
      rating < 1 ||
      rating > 5
    ) {
      return NextResponse.json(
        { error: 'rating must be a number from 1 to 5' },
        { status: 400 }
      );
    }
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

  const { error } = await supabase
    .from('company_comments')
    .insert({
      company_id,
      organization_id: profile.organization_id,
      comment: comment.trim(),
      rating: rating || null,
      created_by: user.id,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}