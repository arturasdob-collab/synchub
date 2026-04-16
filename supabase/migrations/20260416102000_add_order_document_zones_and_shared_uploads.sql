INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'order-documents',
  'order-documents',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.order_documents
  ADD COLUMN IF NOT EXISTS uploaded_by_organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS document_zone text;

UPDATE public.order_documents
SET uploaded_by_organization_id = organization_id
WHERE uploaded_by_organization_id IS NULL;

UPDATE public.order_documents
SET document_zone = 'order'
WHERE document_zone IS NULL OR btrim(document_zone) = '';

ALTER TABLE public.order_documents
  ALTER COLUMN uploaded_by_organization_id SET NOT NULL,
  ALTER COLUMN document_zone SET NOT NULL;

ALTER TABLE public.order_documents
  DROP CONSTRAINT IF EXISTS order_documents_document_zone_allowed;

ALTER TABLE public.order_documents
  ADD CONSTRAINT order_documents_document_zone_allowed CHECK (
    document_zone IN (
      'order',
      'customs_documents',
      'cmr',
      'cargo_photo',
      'additional'
    )
  );

CREATE INDEX IF NOT EXISTS idx_order_documents_uploaded_by_organization_id
  ON public.order_documents (uploaded_by_organization_id);

CREATE INDEX IF NOT EXISTS idx_order_documents_document_zone
  ON public.order_documents (document_zone, created_at DESC);

CREATE OR REPLACE FUNCTION public.validate_order_document_relations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  linked_order_org_id uuid;
  creator_org_id uuid;
BEGIN
  SELECT organization_id
  INTO linked_order_org_id
  FROM public.orders
  WHERE id = NEW.order_id;

  IF linked_order_org_id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF linked_order_org_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Order document organization must match order organization';
  END IF;

  IF NEW.document_zone = 'order'
     AND NEW.uploaded_by_organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Only the source organization can upload order documents';
  END IF;

  IF NEW.created_by IS NOT NULL THEN
    SELECT organization_id
    INTO creator_org_id
    FROM public.user_profiles
    WHERE id = NEW.created_by;

    IF creator_org_id IS NULL THEN
      RAISE EXCEPTION 'Order document creator not found';
    END IF;

    IF creator_org_id <> NEW.uploaded_by_organization_id THEN
      RAISE EXCEPTION 'Order document creator must belong to the uploader organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
