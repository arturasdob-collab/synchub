export const ORDER_DOCUMENTS_BUCKET = 'order-documents';

export const ORDER_DOCUMENT_ALLOWED_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
] as const;

export const ORDER_DOCUMENT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const ORDER_DOCUMENT_ZONES = [
  'order',
  'customs_documents',
  'cmr',
  'cargo_photo',
  'additional',
] as const;

export type OrderDocumentZone = (typeof ORDER_DOCUMENT_ZONES)[number];

export const ORDER_DOCUMENT_ZONE_LABELS: Record<OrderDocumentZone, string> = {
  order: 'Order',
  customs_documents: 'Customs documents',
  cmr: 'CMR',
  cargo_photo: 'Cargo photo',
  additional: 'Additional documents / photos',
};

export const ORDER_DOCUMENT_ZONE_DESCRIPTIONS: Record<OrderDocumentZone, string> = {
  order: 'Original order file from the source organization.',
  customs_documents: 'EX1, T1, customs files, declarations, and broker documents.',
  cmr: 'Signed or draft CMR documents for this cargo.',
  cargo_photo: 'Cargo loading, unloading, damage, or checkpoint photos.',
  additional: 'Any extra files, notes, scans, or supporting images.',
};

export const ORDER_DOCUMENT_ACCEPT_ATTRIBUTE =
  ORDER_DOCUMENT_ALLOWED_EXTENSIONS.join(',');

export const ORDER_DOCUMENT_MAX_SIZE_BYTES = 20 * 1024 * 1024;

export function formatOrderDocumentFileSize(bytes: number | null | undefined) {
  if (!bytes || bytes <= 0) {
    return '-';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function normalizeOrderDocumentZone(
  value: string | null | undefined,
  fallback: OrderDocumentZone = 'order'
): OrderDocumentZone {
  const normalizedValue = (value || '').trim().toLowerCase();

  return ORDER_DOCUMENT_ZONES.includes(normalizedValue as OrderDocumentZone)
    ? (normalizedValue as OrderDocumentZone)
    : fallback;
}
