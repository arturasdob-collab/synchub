INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'cargo-leg-documents',
  'cargo-leg-documents',
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

CREATE TABLE IF NOT EXISTS public.cargo_leg_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  uploaded_by_organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cargo_leg_id uuid NOT NULL REFERENCES public.cargo_legs(id) ON DELETE CASCADE,
  storage_bucket text NOT NULL DEFAULT 'cargo-leg-documents',
  storage_path text NOT NULL,
  original_file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL,
  document_zone text NOT NULL DEFAULT 'additional',
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cargo_leg_documents_storage_bucket_allowed CHECK (storage_bucket = 'cargo-leg-documents'),
  CONSTRAINT cargo_leg_documents_storage_path_not_blank CHECK (btrim(storage_path) <> ''),
  CONSTRAINT cargo_leg_documents_original_file_name_not_blank CHECK (btrim(original_file_name) <> ''),
  CONSTRAINT cargo_leg_documents_file_size_positive CHECK (file_size > 0),
  CONSTRAINT cargo_leg_documents_storage_path_unique UNIQUE (storage_path),
  CONSTRAINT cargo_leg_documents_document_zone_allowed CHECK (
    document_zone IN (
      'customs_documents',
      'cmr',
      'cargo_photo',
      'additional'
    )
  ),
  CONSTRAINT cargo_leg_documents_mime_type_allowed CHECK (
    mime_type IN (
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/webp'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_cargo_leg_documents_organization_id
  ON public.cargo_leg_documents (organization_id);

CREATE INDEX IF NOT EXISTS idx_cargo_leg_documents_cargo_leg_id
  ON public.cargo_leg_documents (cargo_leg_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cargo_leg_documents_uploaded_by_organization_id
  ON public.cargo_leg_documents (uploaded_by_organization_id);

CREATE INDEX IF NOT EXISTS idx_cargo_leg_documents_document_zone
  ON public.cargo_leg_documents (document_zone, created_at DESC);

CREATE OR REPLACE FUNCTION public.validate_cargo_leg_document_relations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  linked_cargo_leg_org_id uuid;
  creator_org_id uuid;
BEGIN
  SELECT organization_id
  INTO linked_cargo_leg_org_id
  FROM public.cargo_legs
  WHERE id = NEW.cargo_leg_id;

  IF linked_cargo_leg_org_id IS NULL THEN
    RAISE EXCEPTION 'Cargo route step not found';
  END IF;

  IF linked_cargo_leg_org_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Cargo leg document organization must match cargo route step organization';
  END IF;

  IF NEW.created_by IS NOT NULL THEN
    SELECT organization_id
    INTO creator_org_id
    FROM public.user_profiles
    WHERE id = NEW.created_by;

    IF creator_org_id IS NULL THEN
      RAISE EXCEPTION 'Cargo leg document creator not found';
    END IF;

    IF creator_org_id <> NEW.uploaded_by_organization_id THEN
      RAISE EXCEPTION 'Cargo leg document creator must belong to the uploader organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_cargo_leg_document_relations_trigger ON public.cargo_leg_documents;
CREATE TRIGGER validate_cargo_leg_document_relations_trigger
  BEFORE INSERT OR UPDATE ON public.cargo_leg_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_cargo_leg_document_relations();

ALTER TABLE public.cargo_leg_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cargo leg documents same organization can view" ON public.cargo_leg_documents;
CREATE POLICY "Cargo leg documents same organization can view"
  ON public.cargo_leg_documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = cargo_leg_documents.organization_id
    )
  );

DROP POLICY IF EXISTS "Cargo leg documents same organization can insert" ON public.cargo_leg_documents;
CREATE POLICY "Cargo leg documents same organization can insert"
  ON public.cargo_leg_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = cargo_leg_documents.organization_id
    )
  );

DROP POLICY IF EXISTS "Cargo leg documents creator or admins can delete" ON public.cargo_leg_documents;
CREATE POLICY "Cargo leg documents creator or admins can delete"
  ON public.cargo_leg_documents
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = cargo_leg_documents.organization_id
      AND (
        cargo_leg_documents.created_by = auth.uid()
        OR up.is_super_admin = true
        OR up.is_creator = true
        OR up.role IN ('OWNER', 'ADMIN')
      )
    )
  );
