import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  cargoLegSelect,
  loadManageableOrderTripLinkContext,
  mapCargoLeg,
} from '@/lib/server/cargo-legs';

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

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

  const { searchParams } = new URL(req.url);
  const orderTripLinkId = normalizeText(
    searchParams.get('orderTripLinkId') ?? searchParams.get('linkId')
  );

  if (!orderTripLinkId) {
    return NextResponse.json(
      { error: 'Order-trip link id is required' },
      { status: 400 }
    );
  }

  try {
    const { profile } = await loadManageableOrderTripLinkContext(
      serviceSupabase,
      user.id,
      orderTripLinkId
    );

    const { data, error } = await serviceSupabase
      .from('cargo_legs')
      .select(cargoLegSelect)
      .eq('order_trip_link_id', orderTripLinkId)
      .eq('organization_id', profile.organization_id)
      .order('leg_order', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      cargo_legs: (data || []).map(mapCargoLeg),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 }
    );
  }
}
