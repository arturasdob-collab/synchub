CREATE TABLE IF NOT EXISTS public.cargo_legs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  order_trip_link_id uuid NOT NULL REFERENCES public.order_trip_links(id) ON DELETE CASCADE,
  linked_trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE RESTRICT,
  leg_order integer NOT NULL,
  leg_type text NOT NULL,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cargo_legs_leg_order_positive CHECK (leg_order > 0),
  CONSTRAINT cargo_legs_leg_type_allowed CHECK (
    leg_type IN ('collection', 'reloading', 'international_trip', 'delivery')
  ),
  CONSTRAINT cargo_legs_order_trip_link_leg_order_unique UNIQUE (order_trip_link_id, leg_order)
);

CREATE INDEX IF NOT EXISTS idx_cargo_legs_organization_id
  ON public.cargo_legs (organization_id);

CREATE INDEX IF NOT EXISTS idx_cargo_legs_order_trip_link_id
  ON public.cargo_legs (order_trip_link_id);

CREATE INDEX IF NOT EXISTS idx_cargo_legs_linked_trip_id
  ON public.cargo_legs (linked_trip_id);

CREATE OR REPLACE FUNCTION public.set_cargo_legs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_cargo_leg_relations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  order_trip_link_org_id uuid;
  order_trip_link_trip_id uuid;
  linked_trip_org_id uuid;
  creator_org_id uuid;
BEGIN
  SELECT organization_id, trip_id
  INTO order_trip_link_org_id, order_trip_link_trip_id
  FROM public.order_trip_links
  WHERE id = NEW.order_trip_link_id;

  IF order_trip_link_org_id IS NULL THEN
    RAISE EXCEPTION 'Order-trip link not found';
  END IF;

  IF order_trip_link_org_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Cargo leg organization must match order-trip link organization';
  END IF;

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

DROP TRIGGER IF EXISTS set_cargo_legs_updated_at_trigger ON public.cargo_legs;
CREATE TRIGGER set_cargo_legs_updated_at_trigger
  BEFORE UPDATE ON public.cargo_legs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_cargo_legs_updated_at();

DROP TRIGGER IF EXISTS validate_cargo_leg_relations_trigger ON public.cargo_legs;
CREATE TRIGGER validate_cargo_leg_relations_trigger
  BEFORE INSERT OR UPDATE ON public.cargo_legs
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_cargo_leg_relations();

ALTER TABLE public.cargo_legs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cargo legs same organization can view" ON public.cargo_legs;
CREATE POLICY "Cargo legs same organization can view"
  ON public.cargo_legs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = cargo_legs.organization_id
    )
  );

DROP POLICY IF EXISTS "Cargo legs same organization can insert" ON public.cargo_legs;
CREATE POLICY "Cargo legs same organization can insert"
  ON public.cargo_legs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = cargo_legs.organization_id
    )
  );

DROP POLICY IF EXISTS "Cargo legs creator or admins can update" ON public.cargo_legs;
CREATE POLICY "Cargo legs creator or admins can update"
  ON public.cargo_legs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = cargo_legs.organization_id
      AND (
        cargo_legs.created_by = auth.uid()
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
      AND up.organization_id = cargo_legs.organization_id
      AND (
        cargo_legs.created_by = auth.uid()
        OR up.is_super_admin = true
        OR up.is_creator = true
        OR up.role IN ('OWNER', 'ADMIN')
      )
    )
  );

DROP POLICY IF EXISTS "Cargo legs creator or admins can delete" ON public.cargo_legs;
CREATE POLICY "Cargo legs creator or admins can delete"
  ON public.cargo_legs
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = cargo_legs.organization_id
      AND (
        cargo_legs.created_by = auth.uid()
        OR up.is_super_admin = true
        OR up.is_creator = true
        OR up.role IN ('OWNER', 'ADMIN')
      )
    )
  );
