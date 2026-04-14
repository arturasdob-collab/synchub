import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrderImportStatus } from '@/lib/constants/order-imports';
import { sanitizeOrderDocumentFileName } from '@/lib/server/order-documents';

type OrderImportProfile = {
  organization_id: string | null;
  role: string | null;
  is_super_admin: boolean | null;
  is_creator: boolean | null;
};

export async function loadOrderImportProfile(
  serviceSupabase: SupabaseClient,
  userId: string
) {
  const { data, error } = await serviceSupabase
    .from('user_profiles')
    .select('organization_id, role, is_super_admin, is_creator')
    .eq('id', userId)
    .single();

  if (error || !data?.organization_id) {
    throw new Error('User organization not found');
  }

  return data as OrderImportProfile;
}

export async function createOrderImportRecord(
  serviceSupabase: SupabaseClient,
  params: {
    organizationId: string;
    userId: string;
    sourceDocumentId?: string | null;
    sourceFileName?: string | null;
    sourceMimeType?: string | null;
    sourceStoragePath?: string | null;
    status?: OrderImportStatus;
    rawText?: string | null;
    parsedJson?: unknown;
    matchResultJson?: unknown;
    errorText?: string | null;
  }
) {
  const { data, error } = await serviceSupabase
    .from('order_imports')
    .insert({
      organization_id: params.organizationId,
      source_document_id: params.sourceDocumentId ?? null,
      source_file_name: params.sourceFileName ?? null,
      source_mime_type: params.sourceMimeType ?? null,
      source_storage_path: params.sourceStoragePath ?? null,
      status: params.status ?? 'uploaded',
      raw_text: params.rawText ?? null,
      parsed_json: params.parsedJson ?? null,
      match_result_json: params.matchResultJson ?? null,
      error_text: params.errorText ?? null,
      created_by: params.userId,
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
    throw new Error(error.message);
  }

  return data;
}

export function buildOrderImportStoragePath(params: {
  organizationId: string;
  importId: string;
  fileName: string;
}) {
  return `${params.organizationId}/imports/${params.importId}-${sanitizeOrderDocumentFileName(
    params.fileName
  )}`;
}
