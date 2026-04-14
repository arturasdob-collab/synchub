import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { isOrderImportStatus } from '@/lib/constants/order-imports';
import { loadOrderImportProfile } from '@/lib/server/order-imports';

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return '';

  return value.trim();
}

function normalizeLimit(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 25;
  }

  return Math.min(parsed, 100);
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
  const status = normalizeText(searchParams.get('status'));
  const mine = normalizeText(searchParams.get('mine')) === '1';
  const limit = normalizeLimit(normalizeText(searchParams.get('limit')));
  const ids = normalizeText(searchParams.get('ids'))
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (status && !isOrderImportStatus(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  try {
    const profile = await loadOrderImportProfile(serviceSupabase, user.id);

    let query = serviceSupabase
      .from('order_imports')
      .select(`
        id,
        source_document_id,
        source_file_name,
        source_mime_type,
        source_storage_path,
        status,
        raw_text,
        parsed_json,
        match_result_json,
        error_text,
        created_at,
        updated_at,
        created_by_user:created_by (
          first_name,
          last_name
        )
      `)
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    }

    if (mine) {
      query = query.eq('created_by', user.id);
    }

    if (ids.length > 0) {
      query = query.in('id', ids);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const orderImports = (data || []).map((item: any) => ({
      id: item.id,
      source_document_id: item.source_document_id ?? null,
      source_file_name: item.source_file_name ?? null,
      source_mime_type: item.source_mime_type ?? null,
      source_storage_path: item.source_storage_path ?? null,
      status: item.status,
      raw_text: item.raw_text ?? null,
      parsed_json: item.parsed_json ?? null,
      match_result_json: item.match_result_json ?? null,
      error_text: item.error_text ?? null,
      created_at: item.created_at,
      updated_at: item.updated_at,
      created_by_user: Array.isArray(item.created_by_user)
        ? (item.created_by_user[0] ?? null)
        : item.created_by_user,
    }));

    return NextResponse.json({ order_imports: orderImports });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 }
    );
  }
}
