CREATE TABLE IF NOT EXISTS public.order_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_document_id uuid,
  source_file_name text,
  source_mime_type text,
  source_storage_path text,
  status text NOT NULL DEFAULT 'uploaded',
  raw_text text,
  parsed_json jsonb,
  match_result_json jsonb,
  error_text text,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_imports_status_allowed CHECK (
    status IN ('uploaded', 'ocr_done', 'parsed', 'matched', 'ready_for_review', 'failed')
  ),
  CONSTRAINT order_imports_source_file_name_not_blank CHECK (
    source_file_name IS NULL OR btrim(source_file_name) <> ''
  ),
  CONSTRAINT order_imports_source_storage_path_not_blank CHECK (
    source_storage_path IS NULL OR btrim(source_storage_path) <> ''
  )
);

CREATE INDEX IF NOT EXISTS idx_order_imports_organization_status
  ON public.order_imports (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_imports_created_by
  ON public.order_imports (created_by);

CREATE INDEX IF NOT EXISTS idx_order_imports_source_document_id
  ON public.order_imports (source_document_id);

CREATE OR REPLACE FUNCTION public.set_order_imports_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_order_import_relations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  creator_org_id uuid;
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    SELECT organization_id
    INTO creator_org_id
    FROM public.user_profiles
    WHERE id = NEW.created_by;

    IF creator_org_id IS NULL THEN
      RAISE EXCEPTION 'Order import creator not found';
    END IF;

    IF creator_org_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'Order import creator must belong to the same organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_order_imports_updated_at_trigger ON public.order_imports;
CREATE TRIGGER set_order_imports_updated_at_trigger
  BEFORE UPDATE ON public.order_imports
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_imports_updated_at();

DROP TRIGGER IF EXISTS validate_order_import_relations_trigger ON public.order_imports;
CREATE TRIGGER validate_order_import_relations_trigger
  BEFORE INSERT OR UPDATE ON public.order_imports
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_order_import_relations();

ALTER TABLE public.order_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Order imports same organization can view" ON public.order_imports;
CREATE POLICY "Order imports same organization can view"
  ON public.order_imports
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = order_imports.organization_id
    )
  );

DROP POLICY IF EXISTS "Order imports same organization can insert" ON public.order_imports;
CREATE POLICY "Order imports same organization can insert"
  ON public.order_imports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = order_imports.organization_id
    )
  );

DROP POLICY IF EXISTS "Order imports creator or admins can update" ON public.order_imports;
CREATE POLICY "Order imports creator or admins can update"
  ON public.order_imports
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = order_imports.organization_id
      AND (
        order_imports.created_by = auth.uid()
        OR up.is_super_admin = true
        OR up.is_creator = true
        OR up.role IN ('OWNER', 'ADMIN')
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = order_imports.organization_id
      AND (
        order_imports.created_by = auth.uid()
        OR up.is_super_admin = true
        OR up.is_creator = true
        OR up.role IN ('OWNER', 'ADMIN')
      )
    )
  );

DROP POLICY IF EXISTS "Order imports creator or admins can delete" ON public.order_imports;
CREATE POLICY "Order imports creator or admins can delete"
  ON public.order_imports
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = order_imports.organization_id
      AND (
        order_imports.created_by = auth.uid()
        OR up.is_super_admin = true
        OR up.is_creator = true
        OR up.role IN ('OWNER', 'ADMIN')
      )
    )
  );
