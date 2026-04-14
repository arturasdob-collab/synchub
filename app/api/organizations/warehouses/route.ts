import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

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

  const organizationId =
    typeof new URL(req.url).searchParams.get('organizationId') === 'string'
      ? new URL(req.url).searchParams.get('organizationId')!.trim()
      : '';

  if (!organizationId) {
    return NextResponse.json(
      { error: 'organizationId is required' },
      { status: 400 }
    );
  }

  const { data, error } = await serviceSupabase
    .from('organization_warehouses')
    .select('id, organization_id, name, address, city, postal_code, country')
    .eq('organization_id', organizationId)
    .order('name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    warehouses: (data || []).map((warehouse: any) => ({
      id: warehouse.id,
      organization_id: warehouse.organization_id,
      name: warehouse.name ?? '-',
      address: warehouse.address ?? null,
      city: warehouse.city ?? null,
      postal_code: warehouse.postal_code ?? null,
      country: warehouse.country ?? null,
    })),
  });
}
