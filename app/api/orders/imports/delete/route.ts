import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { ORDER_DOCUMENTS_BUCKET } from '@/lib/constants/order-documents';
import { loadOrderImportProfile } from '@/lib/server/order-imports';

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return '';

  return value.trim();
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
  const importId = normalizeText(body.id);

  if (!importId) {
    return NextResponse.json({ error: 'Order import id is required' }, { status: 400 });
  }

  try {
    const profile = await loadOrderImportProfile(serviceSupabase, user.id);

    const { data: existingImport, error: existingImportError } =
      await serviceSupabase
        .from('order_imports')
        .select('id, organization_id, source_storage_path, created_by')
        .eq('id', importId)
        .single();

    if (existingImportError || !existingImport) {
      return NextResponse.json({ error: 'Order import not found' }, { status: 404 });
    }

    if (existingImport.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const canDelete =
      existingImport.created_by === user.id ||
      profile.is_super_admin === true ||
      profile.is_creator === true ||
      ['OWNER', 'ADMIN'].includes(profile.role || '');

    if (!canDelete) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (existingImport.source_storage_path) {
      await serviceSupabase.storage
        .from(ORDER_DOCUMENTS_BUCKET)
        .remove([existingImport.source_storage_path]);
    }

    const { error } = await serviceSupabase
      .from('order_imports')
      .delete()
      .eq('id', importId)
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
