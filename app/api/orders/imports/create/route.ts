import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  ORDER_IMPORT_STATUSES,
  isOrderImportStatus,
} from '@/lib/constants/order-imports';
import { loadOrderImportProfile } from '@/lib/server/order-imports';

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeOptionalJson(value: unknown) {
  if (value === undefined) {
    return null;
  }

  return value;
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
  const status = normalizeText(body.status) ?? 'uploaded';

  if (!isOrderImportStatus(status)) {
    return NextResponse.json(
      {
        error: `Invalid status. Allowed: ${ORDER_IMPORT_STATUSES.join(', ')}`,
      },
      { status: 400 }
    );
  }

  const sourceDocumentId = normalizeText(body.source_document_id);
  const sourceFileName = normalizeText(body.source_file_name);
  const sourceMimeType = normalizeText(body.source_mime_type);
  const sourceStoragePath = normalizeText(body.source_storage_path);

  if (!sourceDocumentId && !sourceFileName && !sourceStoragePath) {
    return NextResponse.json(
      {
        error:
          'At least source_document_id, source_file_name, or source_storage_path is required',
      },
      { status: 400 }
    );
  }

  try {
    const profile = await loadOrderImportProfile(serviceSupabase, user.id);

    const { data, error } = await serviceSupabase
      .from('order_imports')
      .insert({
        organization_id: profile.organization_id,
        source_document_id: sourceDocumentId,
        source_file_name: sourceFileName,
        source_mime_type: sourceMimeType,
        source_storage_path: sourceStoragePath,
        status,
        raw_text: normalizeText(body.raw_text),
        parsed_json: normalizeOptionalJson(body.parsed_json),
        match_result_json: normalizeOptionalJson(body.match_result_json),
        error_text: normalizeText(body.error_text),
        created_by: user.id,
      })
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
        updated_at
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      order_import: data,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 }
    );
  }
}
