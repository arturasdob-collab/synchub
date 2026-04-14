export const ORDER_DOCUMENTS_BUCKET = 'order-documents';

export const ORDER_DOCUMENT_ALLOWED_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
] as const;

export const ORDER_DOCUMENT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

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
