import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { ORDER_DOCUMENTS_BUCKET } from '@/lib/constants/order-documents';
import { normalizeOrderDocumentZone } from '@/lib/constants/order-documents';
import { createOrderImportRecord } from '@/lib/server/order-imports';
import {
  buildOrderDocumentStoragePath,
  loadOrderDocumentOrderContext,
  normalizeOrderDocumentMimeType,
  validateOrderDocumentFile,
} from '@/lib/server/order-documents';

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

  const formData = await req.formData();
  const orderId = normalizeText(formData.get('order_id'));
  const requestedZone = normalizeText(formData.get('document_zone'));
  const importId = normalizeText(formData.get('import_id'));
  const fileEntry = formData.get('file');
  const skipOrderImport = normalizeText(formData.get('skip_order_import')) === '1';

  if (!orderId) {
    return NextResponse.json({ error: 'Order id is required' }, { status: 400 });
  }

  if (!(fileEntry instanceof File) && !importId) {
    return NextResponse.json(
      { error: 'File or import id is required' },
      { status: 400 }
    );
  }

  try {
    const { order, profile, canView, canManageAll, isSameOrganization } =
      await loadOrderDocumentOrderContext(
      serviceSupabase,
      user.id,
      orderId
    );

    if (!canView) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const documentZone = normalizeOrderDocumentZone(
      requestedZone,
      isSameOrganization ? 'order' : 'additional'
    );

    if (documentZone === 'order' && !isSameOrganization) {
      return NextResponse.json(
        { error: 'Only the source organization can upload order documents' },
        { status: 403 }
      );
    }

    let sourceFileName = '';
    let sourceMimeType = '';
    let sourceFileSize = 0;
    let fileBuffer: Buffer;
    let sourceImportId: string | null = null;

    if (fileEntry instanceof File) {
      sourceFileName = fileEntry.name;
      sourceMimeType = fileEntry.type;
      sourceFileSize = fileEntry.size;
      fileBuffer = Buffer.from(await fileEntry.arrayBuffer());
    } else {
      const { data: orderImport, error: orderImportError } = await serviceSupabase
        .from('order_imports')
        .select(
          'id, organization_id, source_file_name, source_mime_type, source_storage_path'
        )
        .eq('id', importId)
        .single();

      if (orderImportError || !orderImport?.source_storage_path) {
        return NextResponse.json({ error: 'Order import not found' }, { status: 404 });
      }

      if (orderImport.organization_id !== profile.organization_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const { data: importFile, error: importFileError } = await serviceSupabase.storage
        .from(ORDER_DOCUMENTS_BUCKET)
        .download(orderImport.source_storage_path);

      if (importFileError || !importFile) {
        return NextResponse.json(
          { error: importFileError?.message || 'Failed to load import file' },
          { status: 500 }
        );
      }

      sourceImportId = orderImport.id;
      sourceFileName = orderImport.source_file_name || 'document';
      sourceMimeType = orderImport.source_mime_type || '';
      sourceFileSize = importFile.size;
      fileBuffer = Buffer.from(await importFile.arrayBuffer());
    }

    const validationError = validateOrderDocumentFile({
      fileName: sourceFileName,
      mimeType: sourceMimeType,
      fileSize: sourceFileSize,
    });

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const documentId = crypto.randomUUID();
    const mimeType = normalizeOrderDocumentMimeType(
      sourceFileName,
      sourceMimeType
    )!;
    const storagePath = buildOrderDocumentStoragePath({
      sourceOrganizationId: order.organization_id,
      uploadedByOrganizationId: profile.organization_id!,
      orderId: order.id,
      documentId,
      fileName: sourceFileName,
    });

    const { error: uploadError } = await serviceSupabase.storage
      .from(ORDER_DOCUMENTS_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data, error } = await serviceSupabase
      .from('order_documents')
      .insert({
        id: documentId,
        organization_id: order.organization_id,
        uploaded_by_organization_id: profile.organization_id,
        order_id: order.id,
        storage_bucket: ORDER_DOCUMENTS_BUCKET,
        storage_path: storagePath,
        original_file_name: sourceFileName,
        mime_type: mimeType,
        file_size: sourceFileSize,
        document_zone: documentZone,
        created_by: user.id,
      })
      .select(
        'id, original_file_name, mime_type, file_size, created_at, document_zone, uploaded_by_organization_id'
      )
      .single();

    if (error) {
      await serviceSupabase.storage.from(ORDER_DOCUMENTS_BUCKET).remove([storagePath]);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    try {
      const orderImport = skipOrderImport
        || documentZone !== 'order'
        || !canManageAll
        || sourceImportId
        ? null
        : await createOrderImportRecord(serviceSupabase, {
            organizationId: order.organization_id,
            userId: user.id,
            sourceDocumentId: data.id,
            sourceFileName,
            sourceMimeType: mimeType,
            sourceStoragePath: storagePath,
            status: 'uploaded',
          });

      return NextResponse.json({
        success: true,
        document: data,
        order_import: orderImport,
      });
    } catch (orderImportError) {
      await serviceSupabase
        .from('order_documents')
        .delete()
        .eq('id', data.id)
        .eq('organization_id', profile.organization_id);

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
