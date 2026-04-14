DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'trips'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.trips DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.trips
  ADD CONSTRAINT trips_status_allowed
  CHECK (status IN ('unconfirmed', 'confirmed', 'active', 'completed'));

ALTER TABLE public.trips
  ALTER COLUMN status SET DEFAULT 'unconfirmed';

UPDATE public.trips t
SET status = 'active'
WHERE t.status <> 'completed'
  AND EXISTS (
    SELECT 1
    FROM public.order_trip_links l
    WHERE l.trip_id = t.id
  );

UPDATE public.trips t
SET status = 'unconfirmed'
WHERE t.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM public.order_trip_links l
    WHERE l.trip_id = t.id
  );
