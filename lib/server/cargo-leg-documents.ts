import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CARGO_LEG_DOCUMENT_ALLOWED_EXTENSIONS,
  CARGO_LEG_DOCUMENT_ALLOWED_MIME_TYPES,
  CARGO_LEG_DOCUMENT_MAX_SIZE_BYTES,
  normalizeCargoLegDocumentZone,
  type CargoLegDocumentZone,
} from '@/lib/constants/cargo-leg-documents';
import {
  normalizeOrderDocumentMimeType,
  sanitizeOrderDocumentFileName,
} from '@/lib/server/order-documents';
import { loadEditableCargoLegExecutionContext } from '@/lib/server/cargo-leg-execution';

type CargoLegDocumentProfile = {
  organization_id: string | null;
  is_super_admin: boolean | null;
  is_creator: boolean | null;
  role: string | null;
};

type CargoLegDocumentCargoLeg = {
  id: string;
  organization_id: string;
  responsible_organization_id: string | null;
};

type CargoLegDocumentRow = {
  id: string;
  organization_id: string;
  uploaded_by_organization_id: string;
  cargo_leg_id: string;
  storage_bucket: string;
  storage_path: string;
  original_file_name: string;
  mime_type: string;
  file_size: number;
  document_zone: CargoLegDocumentZone;
  created_by: string | null;
};

export function validateCargoLegDocumentFile(params: {
  fileName: string;
  mimeType: string | null | undefined;
  fileSize: number | null | undefined;
}) {
  const normalizedName = params.fileName.trim();

  if (!normalizedName) {
    return 'File name is required';
  }

  if (!params.fileSize || params.fileSize <= 0) {
    return 'File is empty';
  }

  if (params.fileSize > CARGO_LEG_DOCUMENT_MAX_SIZE_BYTES) {
    return 'File is too large';
  }

  const normalizedMimeType = normalizeOrderDocumentMimeType(
    normalizedName,
    params.mimeType
  );

  if (
    !normalizedMimeType ||
    !CARGO_LEG_DOCUMENT_ALLOWED_MIME_TYPES.includes(
      normalizedMimeType as (typeof CARGO_LEG_DOCUMENT_ALLOWED_MIME_TYPES)[number]
    )
  ) {
    return `Only ${CARGO_LEG_DOCUMENT_ALLOWED_EXTENSIONS.join(', ')} files are allowed`;
  }

  return null;
}

export function buildCargoLegDocumentStoragePath(params: {
  sourceOrganizationId: string;
  uploadedByOrganizationId: string;
  cargoLegId: string;
  documentId: string;
  fileName: string;
}) {
  return `${params.sourceOrganizationId}/${params.cargoLegId}/${params.uploadedByOrganizationId}/${params.documentId}-${sanitizeOrderDocumentFileName(
    params.fileName
  )}`;
}

export async function loadCargoLegDocumentCargoLegContext(
  serviceSupabase: SupabaseClient,
  userId: string,
  cargoLegId: string
) {
  const { profile, cargoLeg } = await loadEditableCargoLegExecutionContext(
    serviceSupabase,
    userId,
    cargoLegId
  );

  const typedProfile = profile as CargoLegDocumentProfile;
  const typedCargoLeg = cargoLeg as CargoLegDocumentCargoLeg;
  const isSameOrganization =
    typedCargoLeg.organization_id === typedProfile.organization_id;
  const canManageAll =
    isSameOrganization &&
    (typedProfile.is_super_admin === true ||
      typedProfile.is_creator === true ||
      ['OWNER', 'ADMIN'].includes(typedProfile.role || ''));

  return {
    profile: typedProfile,
    cargoLeg: typedCargoLeg,
    isSameOrganization,
    canManageAll,
  };
}

export async function loadCargoLegDocumentContextById(
  serviceSupabase: SupabaseClient,
  userId: string,
  documentId: string
) {
  const documentResponse = await serviceSupabase
    .from('cargo_leg_documents')
    .select(
      `
        id,
        organization_id,
        uploaded_by_organization_id,
        cargo_leg_id,
        storage_bucket,
        storage_path,
        original_file_name,
        mime_type,
        file_size,
        document_zone,
        created_by
      `
    )
    .eq('id', documentId)
    .single();

  if (documentResponse.error || !documentResponse.data) {
    throw new Error('Document not found');
  }

  const document = {
    ...(documentResponse.data as any),
    document_zone: normalizeCargoLegDocumentZone(
      (documentResponse.data as any).document_zone,
      'additional'
    ),
  } as CargoLegDocumentRow;

  const cargoLegContext = await loadCargoLegDocumentCargoLegContext(
    serviceSupabase,
    userId,
    document.cargo_leg_id
  );

  if (document.organization_id !== cargoLegContext.cargoLeg.organization_id) {
    throw new Error('Forbidden');
  }

  const canManage =
    cargoLegContext.canManageAll || document.created_by === userId;

  return {
    ...cargoLegContext,
    canManage,
    document,
  };
}
