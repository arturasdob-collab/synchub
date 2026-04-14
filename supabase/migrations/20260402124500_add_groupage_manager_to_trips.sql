ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS groupage_responsible_manager_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_trips_groupage_responsible_manager_id
  ON public.trips (groupage_responsible_manager_id);

CREATE OR REPLACE FUNCTION public.validate_trip_groupage_manager_relation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  manager_org_id uuid;
BEGIN
  IF COALESCE(NEW.is_groupage, false) = false THEN
    NEW.groupage_responsible_manager_id := NULL;
    RETURN NEW;
  END IF;

  IF NEW.groupage_responsible_manager_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT organization_id
  INTO manager_org_id
  FROM public.user_profiles
  WHERE id = NEW.groupage_responsible_manager_id;

  IF manager_org_id IS NULL THEN
    RAISE EXCEPTION 'Selected groupage manager not found';
  END IF;

  IF manager_org_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Groupage manager must belong to the same organization';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_trip_groupage_manager_relation_trigger ON public.trips;

CREATE TRIGGER validate_trip_groupage_manager_relation_trigger
  BEFORE INSERT OR UPDATE ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_trip_groupage_manager_relation();

UPDATE public.trips t
SET groupage_responsible_manager_id = tms.manager_user_id
FROM public.trip_manager_shares tms
WHERE t.id = tms.trip_id
  AND t.is_groupage = true
  AND t.groupage_responsible_manager_id IS NULL;
