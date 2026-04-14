ALTER TABLE public.cargo_legs
  ALTER COLUMN linked_trip_id DROP NOT NULL;

ALTER TABLE public.cargo_legs
  DROP CONSTRAINT IF EXISTS cargo_legs_linked_trip_id_fkey;

ALTER TABLE public.cargo_legs
  ADD CONSTRAINT cargo_legs_linked_trip_id_fkey
  FOREIGN KEY (linked_trip_id)
  REFERENCES public.trips(id)
  ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.validate_cargo_leg_relations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  order_trip_link_org_id uuid;
  linked_trip_org_id uuid;
  creator_org_id uuid;
BEGIN
  SELECT organization_id
  INTO order_trip_link_org_id
  FROM public.order_trip_links
  WHERE id = NEW.order_trip_link_id;

  IF order_trip_link_org_id IS NULL THEN
    RAISE EXCEPTION 'Order-trip link not found';
  END IF;

  IF order_trip_link_org_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Cargo leg organization must match order-trip link organization';
  END IF;

  IF NEW.linked_trip_id IS NOT NULL THEN
    SELECT organization_id
    INTO linked_trip_org_id
    FROM public.trips
    WHERE id = NEW.linked_trip_id;

    IF linked_trip_org_id IS NULL THEN
      RAISE EXCEPTION 'Linked trip not found';
    END IF;

    IF linked_trip_org_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'Cargo leg linked trip must belong to the same organization';
    END IF;
  END IF;

  IF NEW.created_by IS NOT NULL THEN
    SELECT organization_id
    INTO creator_org_id
    FROM public.user_profiles
    WHERE id = NEW.created_by;

    IF creator_org_id IS NULL THEN
      RAISE EXCEPTION 'Cargo leg creator not found';
    END IF;

    IF creator_org_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'Cargo leg creator must belong to the same organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
