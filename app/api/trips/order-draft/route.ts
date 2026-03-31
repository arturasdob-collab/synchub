export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

async function getAuth() {
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

  return { user, serviceSupabase };
}

export async function POST(req: Request) {
  const { user, serviceSupabase } = await getAuth();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const {
    tripId,
    loading_date,
    loading_text,
    unloading_date,
    unloading_text,
    cargo_text,
    additional_conditions,
    carrier_representative,
    status,
  } = body;

  if (!tripId) {
    return NextResponse.json({ error: 'Trip id is required' }, { status: 400 });
  }

  const { data: existingDraft, error: existingDraftError } = await serviceSupabase
    .from('trip_order_drafts')
    .select('id')
    .eq('trip_id', tripId)
    .maybeSingle();

  if (existingDraftError) {
    return NextResponse.json({ error: existingDraftError.message }, { status: 500 });
  }

  const payload = {
    trip_id: tripId,
    loading_date: loading_date ?? null,
    loading_text: loading_text ?? null,
    unloading_date: unloading_date ?? null,
    unloading_text: unloading_text ?? null,
    cargo_text: cargo_text ?? null,
    additional_conditions: additional_conditions ?? null,
    carrier_representative: carrier_representative ?? null,
    status: status ?? 'draft',
    updated_by: user.id,
  };

  if (existingDraft?.id) {
    const { error } = await serviceSupabase
      .from('trip_order_drafts')
      .update(payload)
      .eq('id', existingDraft.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, mode: 'updated' });
  }

  const { error } = await serviceSupabase
    .from('trip_order_drafts')
    .insert(payload);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, mode: 'created' });
}

export async function GET(req: Request) {
  const { user, serviceSupabase } = await getAuth();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get('tripId');

  if (!tripId) {
    return NextResponse.json({ error: 'Trip id is required' }, { status: 400 });
  }

  const { data, error } = await serviceSupabase
    .from('trip_order_drafts')
    .select(`
      id,
      trip_id,
      loading_date,
      loading_text,
      unloading_date,
      unloading_text,
      cargo_text,
      additional_conditions,
      carrier_representative,
      status,
      updated_by,
      created_at,
      updated_at
    `)
    .eq('trip_id', tripId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    draft: data ?? null,
  });
}