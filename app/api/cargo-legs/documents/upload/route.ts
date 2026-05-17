import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { CARGO_LEG_DOCUMENTS_BUCKET } from '@/lib/constants/cargo-leg-documents';
import { normalizeCargoLegDocumentZone } from '@/lib/constants/cargo-leg-documents';
import {
  buildCargoLegDocumentStoragePath,
  loadCargoLegDocumentCargoLegContext,
  validateCargoLegDocumentFile,
} from '@/lib/server/cargo-leg-documents';
import { normalizeOrderDocumentMimeType } from '@/lib/server/order-documents';

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
  const cargoLegId = normalizeText(formData.get('cargo_leg_id'));
  const requestedZone = normalizeText(formData.get('document_zone'));
  const fileEntry = formData.get('file');

  if (!cargoLegId) {
    return NextResponse.json(
      { error: 'Cargo route step id is required' },
      { status: 400 }
    );
  }

  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: 'File is required' }, { status: 400 });
  }

  try {
    const { cargoLeg, profile } = await loadCargoLegDocumentCargoLegContext(
      serviceSupabase,
      user.id,
      cargoLegId
    );

    const documentZone = normalizeCargoLegDocumentZone(requestedZone, 'additional');
    const validationError = validateCargoLegDocumentFile({
      fileName: fileEntry.name,
      mimeType: fileEntry.type,
      fileSize: fileEntry.size,
    });

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const documentId = crypto.randomUUID();
    const mimeType = normalizeOrderDocumentMimeType(fileEntry.name, fileEntry.type)!;
    const storagePath = buildCargoLegDocumentStoragePath({
      sourceOrganizationId: cargoLeg.organization_id,
      uploadedByOrganizationId: profile.organization_id!,
      cargoLegId: cargoLeg.id,
      documentId,
      fileName: fileEntry.name,
    });

    const fileBuffer = Buffer.from(await fileEntry.arrayBuffer());

    const { error: uploadError } = await serviceSupabase.storage
      .from(CARGO_LEG_DOCUMENTS_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data, error } = await serviceSupabase
      .from('cargo_leg_documents')
      .insert({
        id: documentId,
        organization_id: cargoLeg.organization_id,
        uploaded_by_organization_id: profile.organization_id,
        cargo_leg_id: cargoLeg.id,
        storage_bucket: CARGO_LEG_DOCUMENTS_BUCKET,
        storage_path: storagePath,
        original_file_name: fileEntry.name,
        mime_type: mimeType,
        file_size: fileEntry.size,
        document_zone: documentZone,
        created_by: user.id,
      })
      .select(
        'id, cargo_leg_id, original_file_name, mime_type, file_size, created_at, document_zone, uploaded_by_organization_id'
      )
      .single();

    if (error) {
      await serviceSupabase.storage
        .from(CARGO_LEG_DOCUMENTS_BUCKET)
        .remove([storagePath]);

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      document: data,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 }
    );
  }
}
