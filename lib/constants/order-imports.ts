export const ORDER_IMPORT_STATUSES = [
  'uploaded',
  'ocr_done',
  'parsed',
  'matched',
  'ready_for_review',
  'failed',
] as const;

export type OrderImportStatus = (typeof ORDER_IMPORT_STATUSES)[number];

export function isOrderImportStatus(value: unknown): value is OrderImportStatus {
  return ORDER_IMPORT_STATUSES.includes(value as OrderImportStatus);
}
