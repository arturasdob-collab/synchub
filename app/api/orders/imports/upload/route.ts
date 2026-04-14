import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { ORDER_DOCUMENTS_BUCKET } from '@/lib/constants/order-documents';
import { buildOrderImportMatchResult } from '@/lib/server/order-import-matching';
import { extractOrderImportWithOpenAI } from '@/lib/server/order-import-openai';
import {
  buildOrderImportStoragePath,
  createOrderImportRecord,
  loadOrderImportProfile,
} from '@/lib/server/order-imports';
import {
  normalizeOrderDocumentMimeType,
  validateOrderDocumentFile,
} from '@/lib/server/order-documents';

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

  const formData = await req.formData();
  const fileEntry = formData.get('file');

  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: 'File is required' }, { status: 400 });
  }

  try {
    const profile = await loadOrderImportProfile(serviceSupabase, user.id);

    const validationError = validateOrderDocumentFile({
      fileName: fileEntry.name,
      mimeType: fileEntry.type,
      fileSize: fileEntry.size,
    });

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const importId = crypto.randomUUID();
    const mimeType = normalizeOrderDocumentMimeType(
      fileEntry.name,
      fileEntry.type
    )!;
    const storagePath = buildOrderImportStoragePath({
      organizationId: profile.organization_id!,
      importId,
      fileName: fileEntry.name,
    });

    const fileBuffer = Buffer.from(await fileEntry.arrayBuffer());

    const { error: uploadError } = await serviceSupabase.storage
      .from(ORDER_DOCUMENTS_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    try {
      const orderImport = await createOrderImportRecord(serviceSupabase, {
        organizationId: profile.organization_id!,
        userId: user.id,
        sourceDocumentId: null,
        sourceFileName: fileEntry.name,
        sourceMimeType: mimeType,
        sourceStoragePath: storagePath,
        status: 'uploaded',
      });

      let nextStatus = orderImport.status;
      let rawText = orderImport.raw_text ?? null;
      let parsedJson = orderImport.parsed_json ?? null;
      let matchResultJson = orderImport.match_result_json ?? null;
      let errorText = orderImport.error_text ?? null;

      try {
        const extraction = await extractOrderImportWithOpenAI({
          fileBuffer,
          fileName: fileEntry.name,
          mimeType,
        });

        rawText = extraction.rawText ?? null;
        parsedJson = extraction.parsedJson;
        matchResultJson = await buildOrderImportMatchResult(
          serviceSupabase,
          profile.organization_id!,
          parsedJson
        );
        nextStatus = 'ready_for_review';
        errorText = null;
      } catch (processingError) {
        nextStatus = 'failed';
        errorText =
          processingError instanceof Error
            ? processingError.message
            : 'Failed to process import file';
        matchResultJson = null;
      }

      const { data: processedOrderImport, error: updateError } =
        await serviceSupabase
          .from('order_imports')
          .update({
            status: nextStatus,
            raw_text: rawText,
            parsed_json: parsedJson,
            match_result_json: matchResultJson,
            error_text: errorText,
          })
          .eq('id', orderImport.id)
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

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        order_import: processedOrderImport,
      });
    } catch (orderImportError) {
      await serviceSupabase.storage.from(ORDER_DOCUMENTS_BUCKET).remove([storagePath]);

      return NextResponse.json(
        {
          error:
            orderImportError instanceof Error
              ? orderImportError.message
              : 'Failed to create import record',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 }
    );
  }
}
