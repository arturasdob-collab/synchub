/*
  # Add Responsible Organization And Manager Shares To Cargo Legs

  1. Cargo leg ownership model
    - `cargo_legs.organization_id` stays as the source order organization
    - `cargo_legs.responsible_organization_id` becomes the organization that is responsible for this route step
    - `cargo_legs.show_to_all_managers` allows showing the step to everyone in the responsible organization

  2. Multi-manager visibility
    - new `cargo_leg_manager_shares`
    - allows multiple specific managers to see the same cargo route step

  3. Future-safe rule
    - linked trip must belong to the responsible organization, not necessarily the source order organization
*/

ALTER TABLE public.cargo_legs
  ADD COLUMN IF NOT EXISTS responsible_organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.cargo_legs
  ADD COLUMN IF NOT EXISTS show_to_all_managers boolean NOT NULL DEFAULT false;

UPDATE public.cargo_legs cl
SET responsible_organization_id = t.organization_id
FROM public.trips t
WHERE cl.responsible_organization_id IS NULL
AND cl.linked_trip_id = t.id;

UPDATE public.cargo_legs
SET responsible_organization_id = organization_id
WHERE responsible_organization_id IS NULL;

ALTER TABLE public.cargo_legs
  ALTER COLUMN responsible_organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cargo_legs_responsible_organization_id
  ON public.cargo_legs (responsible_organization_id);

CREATE TABLE IF NOT EXISTS public.cargo_leg_manager_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cargo_leg_id uuid NOT NULL REFERENCES public.cargo_legs(id) ON DELETE CASCADE,
  shared_organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  manager_user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  shared_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cargo_leg_manager_shares_leg_manager_unique UNIQUE (cargo_leg_id, manager_user_id)
);

CREATE INDEX IF NOT EXISTS idx_cargo_leg_manager_shares_organization_id
  ON public.cargo_leg_manager_shares (organization_id);

CREATE INDEX IF NOT EXISTS idx_cargo_leg_manager_shares_cargo_leg_id
  ON public.cargo_leg_manager_shares (cargo_leg_id);

CREATE INDEX IF NOT EXISTS idx_cargo_leg_manager_shares_shared_organization_id
  ON public.cargo_leg_manager_shares (shared_organization_id);

CREATE INDEX IF NOT EXISTS idx_cargo_leg_manager_shares_manager_user_id
  ON public.cargo_leg_manager_shares (manager_user_id);

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

  IF NEW.responsible_organization_id IS NULL THEN
    RAISE EXCEPTION 'Responsible organization is required';
  END IF;

  IF NEW.linked_trip_id IS NOT NULL THEN
    SELECT organization_id
    INTO linked_trip_org_id
    FROM public.trips
    WHERE id = NEW.linked_trip_id;

    IF linked_trip_org_id IS NULL THEN
      RAISE EXCEPTION 'Linked trip not found';
    END IF;

    IF linked_trip_org_id <> NEW.responsible_organization_id THEN
      RAISE EXCEPTION 'Cargo leg linked trip must belong to the responsible organization';
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
      RAISE EXCEPTION 'Cargo leg creator must belong to the source organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_cargo_leg_manager_share_relations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  linked_leg_org_id uuid;
  linked_leg_responsible_org_id uuid;
  linked_manager_org_id uuid;
  linked_shared_by_org_id uuid;
BEGIN
  SELECT organization_id, responsible_organization_id
  INTO linked_leg_org_id, linked_leg_responsible_org_id
  FROM public.cargo_legs
  WHERE id = NEW.cargo_leg_id;

  IF linked_leg_org_id IS NULL THEN
    RAISE EXCEPTION 'Cargo leg not found';
  END IF;

  IF linked_leg_org_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Cargo leg share organization must match source cargo leg organization';
  END IF;

  IF linked_leg_responsible_org_id <> NEW.shared_organization_id THEN
    RAISE EXCEPTION 'Cargo leg share target organization must match responsible organization';
  END IF;

  SELECT organization_id
  INTO linked_manager_org_id
  FROM public.user_profiles
  WHERE id = NEW.manager_user_id;

  IF linked_manager_org_id IS NULL THEN
    RAISE EXCEPTION 'Manager not found';
  END IF;

  IF linked_manager_org_id <> NEW.shared_organization_id THEN
    RAISE EXCEPTION 'Shared manager must belong to the responsible organization';
  END IF;

  IF NEW.shared_by IS NOT NULL THEN
    SELECT organization_id
    INTO linked_shared_by_org_id
    FROM public.user_profiles
    WHERE id = NEW.shared_by;

    IF linked_shared_by_org_id IS NULL THEN
      RAISE EXCEPTION 'Share author not found';
    END IF;

    IF linked_shared_by_org_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'Share author must belong to the source organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_cargo_leg_manager_share_relations_trigger ON public.cargo_leg_manager_shares;
CREATE TRIGGER validate_cargo_leg_manager_share_relations_trigger
  BEFORE INSERT OR UPDATE ON public.cargo_leg_manager_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_cargo_leg_manager_share_relations();

DROP POLICY IF EXISTS "Cargo legs same organization can view" ON public.cargo_legs;
DROP POLICY IF EXISTS "Cargo legs visible to source and shared organizations" ON public.cargo_legs;
CREATE POLICY "Cargo legs visible to source and shared organizations"
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
    OR (
      cargo_legs.show_to_all_managers = true
      AND EXISTS (
        SELECT 1
        FROM public.user_profiles up
        WHERE up.id = auth.uid()
        AND up.organization_id = cargo_legs.responsible_organization_id
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.cargo_leg_manager_shares clms
      JOIN public.user_profiles up ON up.id = auth.uid()
      WHERE clms.cargo_leg_id = cargo_legs.id
      AND clms.manager_user_id = auth.uid()
      AND up.organization_id = cargo_legs.responsible_organization_id
    )
  );

ALTER TABLE public.cargo_leg_manager_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cargo leg manager shares visible to allowed users" ON public.cargo_leg_manager_shares;
CREATE POLICY "Cargo leg manager shares visible to allowed users"
  ON public.cargo_leg_manager_shares
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = cargo_leg_manager_shares.organization_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = cargo_leg_manager_shares.shared_organization_id
      AND up.id = cargo_leg_manager_shares.manager_user_id
    )
  );

DROP POLICY IF EXISTS "Cargo leg manager shares manageable by creator or admins" ON public.cargo_leg_manager_shares;
CREATE POLICY "Cargo leg manager shares manageable by creator or admins"
  ON public.cargo_leg_manager_shares
  FOR INSERT
  TO authenticated
  WITH CHECK (
    shared_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.cargo_legs cl ON cl.id = cargo_leg_manager_shares.cargo_leg_id
      JOIN public.order_trip_links otl ON otl.id = cl.order_trip_link_id
      JOIN public.orders o ON o.id = otl.order_id
      WHERE up.id = auth.uid()
      AND up.organization_id = cargo_leg_manager_shares.organization_id
      AND (
        up.is_super_admin = true
        OR up.is_creator = true
        OR up.role IN ('OWNER', 'ADMIN')
        OR o.created_by = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Cargo leg manager shares updatable by creator or admins" ON public.cargo_leg_manager_shares;
CREATE POLICY "Cargo leg manager shares updatable by creator or admins"
  ON public.cargo_leg_manager_shares
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.cargo_legs cl ON cl.id = cargo_leg_manager_shares.cargo_leg_id
      JOIN public.order_trip_links otl ON otl.id = cl.order_trip_link_id
      JOIN public.orders o ON o.id = otl.order_id
      WHERE up.id = auth.uid()
      AND up.organization_id = cargo_leg_manager_shares.organization_id
      AND (
        up.is_super_admin = true
        OR up.is_creator = true
        OR up.role IN ('OWNER', 'ADMIN')
        OR o.created_by = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.cargo_legs cl ON cl.id = cargo_leg_manager_shares.cargo_leg_id
      JOIN public.order_trip_links otl ON otl.id = cl.order_trip_link_id
      JOIN public.orders o ON o.id = otl.order_id
      WHERE up.id = auth.uid()
      AND up.organization_id = cargo_leg_manager_shares.organization_id
      AND (
        up.is_super_admin = true
        OR up.is_creator = true
        OR up.role IN ('OWNER', 'ADMIN')
        OR o.created_by = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Cargo leg manager shares deletable by creator or admins" ON public.cargo_leg_manager_shares;
CREATE POLICY "Cargo leg manager shares deletable by creator or admins"
  ON public.cargo_leg_manager_shares
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.cargo_legs cl ON cl.id = cargo_leg_manager_shares.cargo_leg_id
      JOIN public.order_trip_links otl ON otl.id = cl.order_trip_link_id
      JOIN public.orders o ON o.id = otl.order_id
      WHERE up.id = auth.uid()
      AND up.organization_id = cargo_leg_manager_shares.organization_id
      AND (
        up.is_super_admin = true
        OR up.is_creator = true
        OR up.role IN ('OWNER', 'ADMIN')
        OR o.created_by = auth.uid()
      )
    )
  );
