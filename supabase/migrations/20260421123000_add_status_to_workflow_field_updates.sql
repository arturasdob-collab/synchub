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
      AND rel.relname = 'workflow_field_updates'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%field_key%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.workflow_field_updates DROP CONSTRAINT IF EXISTS %I',
      constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE public.workflow_field_updates
  ADD CONSTRAINT workflow_field_updates_field_key_allowed
  CHECK (
    field_key IN (
      'status',
      'contact',
      'sender',
      'loading',
      'loading_customs',
      'receiver',
      'unloading',
      'unloading_customs',
      'cargo',
      'kg',
      'ldm',
      'revenue',
      'cost',
      'profit',
      'trip_vehicle'
    )
  );
