import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ORDER_DOCUMENT_ALLOWED_EXTENSIONS,
  ORDER_DOCUMENT_ALLOWED_MIME_TYPES,
  ORDER_DOCUMENT_MAX_SIZE_BYTES,
  normalizeOrderDocumentZone,
  type OrderDocumentZone,
} from '@/lib/constants/order-documents';
import { canAccessOrderViaCargoRoute } from '@/lib/server/cargo-legs';
import {
  canAccessLinkedRecord,
  loadCurrentLinkingProfile,
  loadOrderLinkContext,
} from '@/lib/server/order-trip-linking';

type OrderDocumentProfile = {
  organization_id: string | null;
  is_super_admin: boolean | null;
  is_creator: boolean | null;
  role: string | null;
};

type OrderDocumentOrder = {
  id: string;
  organization_id: string;
  created_by: string | null;
};

type OrderDocumentRow = {
  id: string;
  organization_id: string;
  uploaded_by_organization_id: string;
  order_id: string;
  storage_bucket: string;
  storage_path: string;
  original_file_name: string;
  mime_type: string;
  file_size: number;
  document_zone: OrderDocumentZone;
  created_by: string | null;
};

const mimeTypeByExtension: Record<string, (typeof ORDER_DOCUMENT_ALLOWED_MIME_TYPES)[number]> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export function sanitizeOrderDocumentFileName(fileName: string) {
  const trimmed = fileName.trim().replace(/\s+/g, ' ');
  const sanitized = trimmed.replace(/[^A-Za-z0-9._-]+/g, '-');

  return sanitized || 'document';
}

export function normalizeOrderDocumentMimeType(
  fileName: string,
  mimeType: string | null | undefined
) {
  const normalizedMimeType = (mimeType || '').trim().toLowerCase();

  if (
    ORDER_DOCUMENT_ALLOWED_MIME_TYPES.includes(
      normalizedMimeType as (typeof ORDER_DOCUMENT_ALLOWED_MIME_TYPES)[number]
    )
  ) {
    return normalizedMimeType;
  }

  const lowerName = fileName.trim().toLowerCase();
  const extension = ORDER_DOCUMENT_ALLOWED_EXTENSIONS.find((item) =>
    lowerName.endsWith(item)
  );

  return extension ? mimeTypeByExtension[extension] : null;
}

export function validateOrderDocumentFile(params: {
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

  if (params.fileSize > ORDER_DOCUMENT_MAX_SIZE_BYTES) {
    return 'File is too large';
  }

  const normalizedMimeType = normalizeOrderDocumentMimeType(
    normalizedName,
    params.mimeType
  );

  if (!normalizedMimeType) {
    return 'Only PDF, Word, and image files are allowed';
  }

  return null;
}

export function buildOrderDocumentStoragePath(params: {
  sourceOrganizationId: string;
  uploadedByOrganizationId: string;
  orderId: string;
  documentId: string;
  fileName: string;
}) {
  return `${params.sourceOrganizationId}/${params.orderId}/${params.uploadedByOrganizationId}/${params.documentId}-${sanitizeOrderDocumentFileName(
    params.fileName
  )}`;
}

export function canManageOrderDocuments(
  userId: string,
  profile: OrderDocumentProfile,
  order: OrderDocumentOrder
) {
  return (
    order.created_by === userId ||
    profile.is_super_admin === true ||
    profile.is_creator === true ||
    ['OWNER', 'ADMIN'].includes(profile.role || '')
  );
}

export async function loadOrderDocumentOrderContext(
  serviceSupabase: SupabaseClient,
  userId: string,
  orderId: string
) {
  const profile = (await loadCurrentLinkingProfile(
    serviceSupabase,
    userId
  )) as OrderDocumentProfile;
  const { order, sharedManagerUserId, sharedOrganizationId } =
    await loadOrderLinkContext(serviceSupabase, orderId);
  const canAccessViaCargoRoute = await canAccessOrderViaCargoRoute(
    serviceSupabase,
    userId,
    profile.organization_id as string,
    orderId
  );

  const isSameOrganization = order.organization_id === profile.organization_id;
  const canView = isSameOrganization
    ? canAccessLinkedRecord({
        profile,
        currentUserId: userId,
        createdBy: order.created_by,
        sharedManagerUserId,
      })
    : ((sharedOrganizationId === profile.organization_id &&
        sharedManagerUserId === userId) ||
        canAccessViaCargoRoute);

  if (!canView) {
    throw new Error('Forbidden');
  }

  return {
    profile,
    order: order as OrderDocumentOrder,
    isSameOrganization,
    canView,
    canManageAll: isSameOrganization && canManageOrderDocuments(userId, profile, order),
  };
}

export async function loadOrderDocumentContextById(
  serviceSupabase: SupabaseClient,
  userId: string,
  documentId: string
) {
  const documentResponse = await serviceSupabase
    .from('order_documents')
    .select(
      `
        id,
        organization_id,
        uploaded_by_organization_id,
        order_id,
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
    document_zone: normalizeOrderDocumentZone(
      (documentResponse.data as any).document_zone,
      'order'
    ),
  } as OrderDocumentRow;

  const orderContext = await loadOrderDocumentOrderContext(
    serviceSupabase,
    userId,
    document.order_id
  );

  if (document.organization_id !== orderContext.order.organization_id) {
    throw new Error('Forbidden');
  }

  const canView =
    orderContext.isSameOrganization || document.document_zone !== 'order';

  if (!canView) {
    throw new Error('Forbidden');
  }

  const canManage = orderContext.canManageAll || document.created_by === userId;

  return {
    ...orderContext,
    canManage,
    document,
  };
}
