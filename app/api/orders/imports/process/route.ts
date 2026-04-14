import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { ORDER_DOCUMENTS_BUCKET } from '@/lib/constants/order-documents';
import { buildOrderImportMatchResult } from '@/lib/server/order-import-matching';
import { extractOrderImportWithOpenAI } from '@/lib/server/order-import-openai';
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

function normalizeBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }

  return false;
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
  const importId =
    normalizeText(body.id) ?? normalizeText(body.order_import_id);
  const forceReprocess = normalizeBoolean(body.force);

  if (!importId) {
    return NextResponse.json(
      { error: 'Order import id is required' },
      { status: 400 }
    );
  }

  try {
    const profile = await loadOrderImportProfile(serviceSupabase, user.id);

    const { data: existingImport, error: existingImportError } =
      await serviceSupabase
        .from('order_imports')
        .select(`
          id,
          organization_id,
          status,
          raw_text,
          parsed_json,
          match_result_json,
          error_text,
          source_document_id,
          source_file_name,
          source_mime_type,
          source_storage_path
        `)
        .eq('id', importId)
        .single();

    if (existingImportError || !existingImport) {
      return NextResponse.json({ error: 'Order import not found' }, { status: 404 });
    }

    if (existingImport.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (
      !forceReprocess &&
      !body.raw_text &&
      body.parsed_json === undefined &&
      !body.error_text &&
      existingImport.status === 'ready_for_review' &&
      existingImport.parsed_json
    ) {
      return NextResponse.json({
        success: true,
        order_import: existingImport,
      });
    }

    let nextRawText =
      normalizeText(body.raw_text) ?? existingImport.raw_text ?? null;
    let nextParsedJson =
      normalizeOptionalJson(body.parsed_json) ?? existingImport.parsed_json ?? null;
    let nextErrorText = normalizeText(body.error_text);

    let nextStatus = existingImport.status;
    let nextMatchResultJson = existingImport.match_result_json ?? null;

    const shouldAutoProcessFromFile =
      !nextErrorText &&
      body.raw_text === undefined &&
      body.parsed_json === undefined &&
      !existingImport.parsed_json;

    if (shouldAutoProcessFromFile) {
      try {
        if (!existingImport.source_storage_path) {
          throw new Error('Source import file was not found');
        }

        const { data: importFile, error: importFileError } =
          await serviceSupabase.storage
            .from(ORDER_DOCUMENTS_BUCKET)
            .download(existingImport.source_storage_path);

        if (importFileError || !importFile) {
          throw new Error(importFileError?.message || 'Failed to download import file');
        }

        const fileBuffer = Buffer.from(await importFile.arrayBuffer());
        const extraction = await extractOrderImportWithOpenAI({
          fileBuffer,
          fileName: existingImport.source_file_name || 'order-document',
          mimeType:
            existingImport.source_mime_type || 'application/octet-stream',
        });

        nextRawText = extraction.rawText ?? nextRawText;
        nextParsedJson = extraction.parsedJson;
      } catch (error) {
        nextErrorText =
          error instanceof Error ? error.message : 'Failed to process import file';
      }
    }

    if (nextErrorText) {
      nextStatus = 'failed';
      nextMatchResultJson = null;
    } else if (nextParsedJson) {
      nextMatchResultJson = await buildOrderImportMatchResult(
        serviceSupabase,
        profile.organization_id!,
        nextParsedJson
      );
      nextStatus = 'ready_for_review';
    } else if (nextRawText) {
      nextStatus = 'ocr_done';
    }

    const { data, error } = await serviceSupabase
      .from('order_imports')
      .update({
        raw_text: nextRawText,
        parsed_json: nextParsedJson,
        match_result_json: nextMatchResultJson,
        error_text: nextErrorText,
        status: nextStatus,
      })
      .eq('id', importId)
      .eq('organization_id', profile.organization_id)
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
      success: nextStatus !== 'failed',
      order_import: data,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 }
    );
  }
}
