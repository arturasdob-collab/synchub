import {
  ORDER_DOCUMENT_ACCEPT_ATTRIBUTE,
  ORDER_DOCUMENT_ALLOWED_EXTENSIONS,
  ORDER_DOCUMENT_ALLOWED_MIME_TYPES,
  ORDER_DOCUMENT_MAX_SIZE_BYTES,
} from '@/lib/constants/order-documents';

export const CARGO_LEG_DOCUMENTS_BUCKET = 'cargo-leg-documents';

export const CARGO_LEG_DOCUMENT_ALLOWED_EXTENSIONS =
  ORDER_DOCUMENT_ALLOWED_EXTENSIONS;

export const CARGO_LEG_DOCUMENT_ALLOWED_MIME_TYPES =
  ORDER_DOCUMENT_ALLOWED_MIME_TYPES;

export const CARGO_LEG_DOCUMENT_ACCEPT_ATTRIBUTE = ORDER_DOCUMENT_ACCEPT_ATTRIBUTE;

export const CARGO_LEG_DOCUMENT_MAX_SIZE_BYTES = ORDER_DOCUMENT_MAX_SIZE_BYTES;

export const CARGO_LEG_DOCUMENT_ZONES = [
  'customs_documents',
  'cmr',
  'cargo_photo',
  'additional',
] as const;

export type CargoLegDocumentZone = (typeof CARGO_LEG_DOCUMENT_ZONES)[number];

export const CARGO_LEG_DOCUMENT_ZONE_LABELS: Record<CargoLegDocumentZone, string> = {
  customs_documents: 'Customs documents',
  cmr: 'CMR',
  cargo_photo: 'Cargo photo',
  additional: 'Additional documents / photos',
};

export const CARGO_LEG_DOCUMENT_ZONE_DESCRIPTIONS: Record<
  CargoLegDocumentZone,
  string
> = {
  customs_documents: 'Route-step customs, terminal, or border documents.',
  cmr: 'CMR files related to this specific route step.',
  cargo_photo: 'Photos from loading, reloading, unloading, or checkpoints.',
  additional: 'Extra files, damage photos, confirmations, or supporting notes.',
};

export function normalizeCargoLegDocumentZone(
  value: string | null | undefined,
  fallback: CargoLegDocumentZone = 'additional'
): CargoLegDocumentZone {
  const normalizedValue = (value || '').trim().toLowerCase();

  return CARGO_LEG_DOCUMENT_ZONES.includes(
    normalizedValue as CargoLegDocumentZone
  )
    ? (normalizedValue as CargoLegDocumentZone)
    : fallback;
}
