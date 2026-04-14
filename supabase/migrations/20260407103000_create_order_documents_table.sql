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
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.order_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  storage_bucket text NOT NULL DEFAULT 'order-documents',
  storage_path text NOT NULL,
  original_file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_documents_storage_bucket_allowed CHECK (storage_bucket = 'order-documents'),
  CONSTRAINT order_documents_storage_path_not_blank CHECK (btrim(storage_path) <> ''),
  CONSTRAINT order_documents_original_file_name_not_blank CHECK (btrim(original_file_name) <> ''),
  CONSTRAINT order_documents_file_size_positive CHECK (file_size > 0),
  CONSTRAINT order_documents_mime_type_allowed CHECK (
    mime_type IN (
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  ),
  CONSTRAINT order_documents_storage_path_unique UNIQUE (storage_path)
);

CREATE INDEX IF NOT EXISTS idx_order_documents_organization_id
  ON public.order_documents (organization_id);

CREATE INDEX IF NOT EXISTS idx_order_documents_order_id
  ON public.order_documents (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_documents_created_by
  ON public.order_documents (created_by);

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

  IF NEW.created_by IS NOT NULL THEN
    SELECT organization_id
    INTO creator_org_id
    FROM public.user_profiles
    WHERE id = NEW.created_by;

    IF creator_org_id IS NULL THEN
      RAISE EXCEPTION 'Order document creator not found';
    END IF;

    IF creator_org_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'Order document creator must belong to the same organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_order_document_relations_trigger ON public.order_documents;
CREATE TRIGGER validate_order_document_relations_trigger
  BEFORE INSERT OR UPDATE ON public.order_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_order_document_relations();

ALTER TABLE public.order_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Order documents same organization can view" ON public.order_documents;
CREATE POLICY "Order documents same organization can view"
  ON public.order_documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = order_documents.organization_id
    )
  );

DROP POLICY IF EXISTS "Order documents same organization can insert" ON public.order_documents;
CREATE POLICY "Order documents same organization can insert"
  ON public.order_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = order_documents.organization_id
    )
  );

DROP POLICY IF EXISTS "Order documents creator or admins can delete" ON public.order_documents;
CREATE POLICY "Order documents creator or admins can delete"
  ON public.order_documents
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.orders o ON o.id = order_documents.order_id
      WHERE up.id = auth.uid()
      AND up.organization_id = order_documents.organization_id
      AND (
        order_documents.created_by = auth.uid()
        OR o.created_by = auth.uid()
        OR up.is_super_admin = true
        OR up.is_creator = true
        OR up.role IN ('OWNER', 'ADMIN')
      )
    )
  );
