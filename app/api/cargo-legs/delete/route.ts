import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { loadManageableOrderTripLinkContext } from '@/lib/server/cargo-legs';

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

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
  const cargoLegId = normalizeText(body.id);

  if (!cargoLegId) {
    return NextResponse.json({ error: 'Cargo leg id is required' }, { status: 400 });
  }

  try {
    const { data: existingCargoLeg, error: existingCargoLegError } =
      await serviceSupabase
        .from('cargo_legs')
        .select('id, organization_id, order_trip_link_id')
        .eq('id', cargoLegId)
        .single();

    if (existingCargoLegError || !existingCargoLeg) {
      return NextResponse.json({ error: 'Cargo leg not found' }, { status: 404 });
    }

    const { profile } = await loadManageableOrderTripLinkContext(
      serviceSupabase,
      user.id,
      existingCargoLeg.order_trip_link_id
    );

    if (existingCargoLeg.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await serviceSupabase
      .from('cargo_legs')
      .delete()
      .eq('id', cargoLegId)
      .eq('organization_id', profile.organization_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 }
    );
  }
}
