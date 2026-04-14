/*
  # Create Trip Segments Table

  1. New table
    - `trip_segments`
      - Stores ordered trip legs / segments inside organization scope
      - Belongs to a single trip
      - Keeps compact loading and unloading point data for future groupage flow

  2. Guard rails
    - Enforces same-organization relation with trips and creators
    - Keeps `updated_at` fresh on updates

  3. Security
    - Enable RLS
    - Same-organization users can read
    - Creator or elevated roles can update/delete
*/

CREATE TABLE IF NOT EXISTS public.trip_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  segment_order integer NOT NULL,
  loading_date date,
  loading_name text,
  loading_address text,
  loading_city text,
  loading_postal_code text,
  loading_country text,
  unloading_date date,
  unloading_name text,
  unloading_address text,
  unloading_city text,
  unloading_postal_code text,
  unloading_country text,
  last_known_location_text text,
  notes text,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trip_segments_order_positive CHECK (segment_order >= 1),
  CONSTRAINT trip_segments_trip_order_unique UNIQUE (trip_id, segment_order)
);

CREATE INDEX IF NOT EXISTS idx_trip_segments_organization_id
  ON public.trip_segments (organization_id);

CREATE INDEX IF NOT EXISTS idx_trip_segments_trip_order
  ON public.trip_segments (trip_id, segment_order);

CREATE INDEX IF NOT EXISTS idx_trip_segments_created_by
  ON public.trip_segments (created_by);

CREATE OR REPLACE FUNCTION public.set_trip_segments_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_trip_segment_relations()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  trip_org_id uuid;
  creator_org_id uuid;
BEGIN
  SELECT organization_id
  INTO trip_org_id
  FROM public.trips
  WHERE id = NEW.trip_id;

  IF trip_org_id IS NULL THEN
    RAISE EXCEPTION 'Trip not found';
  END IF;

  IF trip_org_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Trip segment organization must match trip organization';
  END IF;

  IF NEW.created_by IS NOT NULL THEN
    SELECT organization_id
    INTO creator_org_id
    FROM public.user_profiles
    WHERE id = NEW.created_by;

    IF creator_org_id IS NULL THEN
      RAISE EXCEPTION 'Trip segment creator not found';
    END IF;

    IF creator_org_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'Trip segment creator must belong to the same organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_trip_segments_updated_at_trigger ON public.trip_segments;

CREATE TRIGGER set_trip_segments_updated_at_trigger
  BEFORE UPDATE ON public.trip_segments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_trip_segments_updated_at();

DROP TRIGGER IF EXISTS validate_trip_segment_relations_trigger ON public.trip_segments;

CREATE TRIGGER validate_trip_segment_relations_trigger
  BEFORE INSERT OR UPDATE ON public.trip_segments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_trip_segment_relations();

ALTER TABLE public.trip_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trip segments same organization can view" ON public.trip_segments;
CREATE POLICY "Trip segments same organization can view"
  ON public.trip_segments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = trip_segments.organization_id
    )
  );

DROP POLICY IF EXISTS "Trip segments same organization can insert" ON public.trip_segments;
CREATE POLICY "Trip segments same organization can insert"
  ON public.trip_segments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = trip_segments.organization_id
    )
  );

DROP POLICY IF EXISTS "Trip segments creator or admins can update" ON public.trip_segments;
CREATE POLICY "Trip segments creator or admins can update"
  ON public.trip_segments
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = trip_segments.organization_id
      AND (
        trip_segments.created_by = auth.uid()
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
      AND up.organization_id = trip_segments.organization_id
      AND (
        trip_segments.created_by = auth.uid()
        OR up.is_super_admin = true
        OR up.is_creator = true
        OR up.role IN ('OWNER', 'ADMIN')
      )
    )
  );

DROP POLICY IF EXISTS "Trip segments creator or admins can delete" ON public.trip_segments;
CREATE POLICY "Trip segments creator or admins can delete"
  ON public.trip_segments
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = trip_segments.organization_id
      AND (
        trip_segments.created_by = auth.uid()
        OR up.is_super_admin = true
        OR up.is_creator = true
        OR up.role IN ('OWNER', 'ADMIN')
      )
    )
  );
