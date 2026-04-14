/*
  # Create Order / Trip Manager Share Tables

  1. New tables
    - `order_manager_shares`
      - Controls which manager inside the same organization can see a specific order for linking

    - `trip_manager_shares`
      - Controls which manager inside the same organization can see a specific trip for linking

  2. Guard rails
    - Shared manager must belong to the same organization
    - Shared order/trip must belong to the same organization
    - Share author must belong to the same organization
    - One active shared manager per order/trip in current MVP

  3. Security
    - RLS enabled on both tables
    - Target manager, creator, and elevated roles can view
    - Only creator or elevated roles can create/update/delete
*/

CREATE TABLE IF NOT EXISTS public.order_manager_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  manager_user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  shared_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_manager_shares_order_unique UNIQUE (order_id)
);

CREATE TABLE IF NOT EXISTS public.trip_manager_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  manager_user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  shared_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trip_manager_shares_trip_unique UNIQUE (trip_id)
);

CREATE INDEX IF NOT EXISTS idx_order_manager_shares_organization_id
  ON public.order_manager_shares (organization_id);

CREATE INDEX IF NOT EXISTS idx_order_manager_shares_order_id
  ON public.order_manager_shares (order_id);

CREATE INDEX IF NOT EXISTS idx_order_manager_shares_manager_user_id
  ON public.order_manager_shares (manager_user_id);

CREATE INDEX IF NOT EXISTS idx_trip_manager_shares_organization_id
  ON public.trip_manager_shares (organization_id);

CREATE INDEX IF NOT EXISTS idx_trip_manager_shares_trip_id
  ON public.trip_manager_shares (trip_id);

CREATE INDEX IF NOT EXISTS idx_trip_manager_shares_manager_user_id
  ON public.trip_manager_shares (manager_user_id);

CREATE OR REPLACE FUNCTION public.validate_order_manager_share_relations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  linked_order_org_id uuid;
  linked_manager_org_id uuid;
  linked_shared_by_org_id uuid;
BEGIN
  SELECT organization_id
  INTO linked_order_org_id
  FROM public.orders
  WHERE id = NEW.order_id;

  IF linked_order_org_id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF linked_order_org_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Order share organization must match order organization';
  END IF;

  SELECT organization_id
  INTO linked_manager_org_id
  FROM public.user_profiles
  WHERE id = NEW.manager_user_id;

  IF linked_manager_org_id IS NULL THEN
    RAISE EXCEPTION 'Manager not found';
  END IF;

  IF linked_manager_org_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Shared manager must belong to the same organization';
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
      RAISE EXCEPTION 'Share author must belong to the same organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_trip_manager_share_relations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  linked_trip_org_id uuid;
  linked_manager_org_id uuid;
  linked_shared_by_org_id uuid;
BEGIN
  SELECT organization_id
  INTO linked_trip_org_id
  FROM public.trips
  WHERE id = NEW.trip_id;

  IF linked_trip_org_id IS NULL THEN
    RAISE EXCEPTION 'Trip not found';
  END IF;

  IF linked_trip_org_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Trip share organization must match trip organization';
  END IF;

  SELECT organization_id
  INTO linked_manager_org_id
  FROM public.user_profiles
  WHERE id = NEW.manager_user_id;

  IF linked_manager_org_id IS NULL THEN
    RAISE EXCEPTION 'Manager not found';
  END IF;

  IF linked_manager_org_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Shared manager must belong to the same organization';
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
      RAISE EXCEPTION 'Share author must belong to the same organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_order_manager_share_relations_trigger ON public.order_manager_shares;

CREATE TRIGGER validate_order_manager_share_relations_trigger
  BEFORE INSERT OR UPDATE ON public.order_manager_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_order_manager_share_relations();

DROP TRIGGER IF EXISTS validate_trip_manager_share_relations_trigger ON public.trip_manager_shares;

CREATE TRIGGER validate_trip_manager_share_relations_trigger
  BEFORE INSERT OR UPDATE ON public.trip_manager_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_trip_manager_share_relations();

ALTER TABLE public.order_manager_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_manager_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Order manager shares visible to allowed users" ON public.order_manager_shares;
CREATE POLICY "Order manager shares visible to allowed users"
  ON public.order_manager_shares
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = order_manager_shares.organization_id
      AND (
        up.id = order_manager_shares.manager_user_id
        OR order_manager_shares.shared_by = auth.uid()
        OR up.is_super_admin = true
        OR up.is_creator = true
        OR up.role IN ('OWNER', 'ADMIN')
        OR EXISTS (
          SELECT 1
          FROM public.orders o
          WHERE o.id = order_manager_shares.order_id
          AND o.created_by = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "Order manager shares manageable by creator or admins" ON public.order_manager_shares;
CREATE POLICY "Order manager shares manageable by creator or admins"
  ON public.order_manager_shares
  FOR INSERT
  TO authenticated
  WITH CHECK (
    shared_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = order_manager_shares.organization_id
      AND (
        up.is_super_admin = true
        OR up.is_creator = true
        OR up.role IN ('OWNER', 'ADMIN')
        OR EXISTS (
          SELECT 1
          FROM public.orders o
          WHERE o.id = order_manager_shares.order_id
          AND o.created_by = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "Order manager shares updatable by creator or admins" ON public.order_manager_shares;
CREATE POLICY "Order manager shares updatable by creator or admins"
  ON public.order_manager_shares
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = order_manager_shares.organization_id
      AND (
        up.is_super_admin = true
        OR up.is_creator = true
        OR up.role IN ('OWNER', 'ADMIN')
        OR EXISTS (
          SELECT 1
          FROM public.orders o
          WHERE o.id = order_manager_shares.order_id
          AND o.created_by = auth.uid()
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = order_manager_shares.organization_id
      AND (
        up.is_super_admin = true
        OR up.is_creator = true
        OR up.role IN ('OWNER', 'ADMIN')
        OR EXISTS (
          SELECT 1
          FROM public.orders o
          WHERE o.id = order_manager_shares.order_id
          AND o.created_by = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "Order manager shares deletable by creator or admins" ON public.order_manager_shares;
CREATE POLICY "Order manager shares deletable by creator or admins"
  ON public.order_manager_shares
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = order_manager_shares.organization_id
      AND (
        up.is_super_admin = true
        OR up.is_creator = true
        OR up.role IN ('OWNER', 'ADMIN')
        OR EXISTS (
          SELECT 1
          FROM public.orders o
          WHERE o.id = order_manager_shares.order_id
          AND o.created_by = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "Trip manager shares visible to allowed users" ON public.trip_manager_shares;
CREATE POLICY "Trip manager shares visible to allowed users"
  ON public.trip_manager_shares
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = trip_manager_shares.organization_id
      AND (
        up.id = trip_manager_shares.manager_user_id
        OR trip_manager_shares.shared_by = auth.uid()
        OR up.is_super_admin = true
        OR up.is_creator = true
        OR up.role IN ('OWNER', 'ADMIN')
        OR EXISTS (
          SELECT 1
          FROM public.trips t
          WHERE t.id = trip_manager_shares.trip_id
          AND t.created_by = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "Trip manager shares manageable by creator or admins" ON public.trip_manager_shares;
CREATE POLICY "Trip manager shares manageable by creator or admins"
  ON public.trip_manager_shares
  FOR INSERT
  TO authenticated
  WITH CHECK (
    shared_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = trip_manager_shares.organization_id
      AND (
        up.is_super_admin = true
        OR up.is_creator = true
        OR up.role IN ('OWNER', 'ADMIN')
        OR EXISTS (
          SELECT 1
          FROM public.trips t
          WHERE t.id = trip_manager_shares.trip_id
          AND t.created_by = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "Trip manager shares updatable by creator or admins" ON public.trip_manager_shares;
CREATE POLICY "Trip manager shares updatable by creator or admins"
  ON public.trip_manager_shares
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = trip_manager_shares.organization_id
      AND (
        up.is_super_admin = true
        OR up.is_creator = true
        OR up.role IN ('OWNER', 'ADMIN')
        OR EXISTS (
          SELECT 1
          FROM public.trips t
          WHERE t.id = trip_manager_shares.trip_id
          AND t.created_by = auth.uid()
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = trip_manager_shares.organization_id
      AND (
        up.is_super_admin = true
        OR up.is_creator = true
        OR up.role IN ('OWNER', 'ADMIN')
        OR EXISTS (
          SELECT 1
          FROM public.trips t
          WHERE t.id = trip_manager_shares.trip_id
          AND t.created_by = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "Trip manager shares deletable by creator or admins" ON public.trip_manager_shares;
CREATE POLICY "Trip manager shares deletable by creator or admins"
  ON public.trip_manager_shares
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = trip_manager_shares.organization_id
      AND (
        up.is_super_admin = true
        OR up.is_creator = true
        OR up.role IN ('OWNER', 'ADMIN')
        OR EXISTS (
          SELECT 1
          FROM public.trips t
          WHERE t.id = trip_manager_shares.trip_id
          AND t.created_by = auth.uid()
        )
      )
    )
  );
