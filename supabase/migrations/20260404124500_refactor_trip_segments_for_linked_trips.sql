ALTER TABLE public.trip_segments
  ADD COLUMN IF NOT EXISTS segment_type text,
  ADD COLUMN IF NOT EXISTS linked_trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL;

UPDATE public.trip_segments
SET segment_type = 'international_trip'
WHERE segment_type IS NULL;

ALTER TABLE public.trip_segments
  ALTER COLUMN segment_type SET DEFAULT 'international_trip';

ALTER TABLE public.trip_segments
  ALTER COLUMN segment_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'trip_segments_segment_type_allowed'
  ) THEN
    ALTER TABLE public.trip_segments
      ADD CONSTRAINT trip_segments_segment_type_allowed
      CHECK (segment_type IN ('collection', 'reloading', 'international_trip', 'delivery'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_trip_segments_linked_trip_id
  ON public.trip_segments (linked_trip_id);

DROP INDEX IF EXISTS idx_trip_segments_trip_linked_trip_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_segments_linked_trip_unique
  ON public.trip_segments (linked_trip_id)
  WHERE linked_trip_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_trip_segment_relations()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  trip_org_id uuid;
  creator_org_id uuid;
  linked_trip_org_id uuid;
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

  IF NEW.linked_trip_id IS NOT NULL THEN
    IF NEW.linked_trip_id = NEW.trip_id THEN
      RAISE EXCEPTION 'Linked trip cannot be the same as parent trip';
    END IF;

    SELECT organization_id
    INTO linked_trip_org_id
    FROM public.trips
    WHERE id = NEW.linked_trip_id;

    IF linked_trip_org_id IS NULL THEN
      RAISE EXCEPTION 'Linked trip not found';
    END IF;

    IF linked_trip_org_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'Linked trip must belong to the same organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
