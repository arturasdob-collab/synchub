/*
  # Add Cross-Organization Target To Manager Shares

  1. New columns
    - `order_manager_shares.shared_organization_id`
    - `trip_manager_shares.shared_organization_id`

  2. Purpose
    - keep `organization_id` as the source order/trip organization
    - store the target manager organization separately
    - preserve current same-organization logic by backfilling existing rows

  3. Rules
    - shared order/trip must belong to `organization_id`
    - shared manager must belong to `shared_organization_id`
    - share author must belong to `organization_id`
*/

ALTER TABLE public.order_manager_shares
  ADD COLUMN IF NOT EXISTS shared_organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.trip_manager_shares
  ADD COLUMN IF NOT EXISTS shared_organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.order_manager_shares
SET shared_organization_id = organization_id
WHERE shared_organization_id IS NULL;

UPDATE public.trip_manager_shares
SET shared_organization_id = organization_id
WHERE shared_organization_id IS NULL;

ALTER TABLE public.order_manager_shares
  ALTER COLUMN shared_organization_id SET NOT NULL;

ALTER TABLE public.trip_manager_shares
  ALTER COLUMN shared_organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_manager_shares_shared_organization_id
  ON public.order_manager_shares (shared_organization_id);

CREATE INDEX IF NOT EXISTS idx_trip_manager_shares_shared_organization_id
  ON public.trip_manager_shares (shared_organization_id);

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

  IF linked_manager_org_id <> NEW.shared_organization_id THEN
    RAISE EXCEPTION 'Shared manager must belong to the selected target organization';
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

  IF linked_manager_org_id <> NEW.shared_organization_id THEN
    RAISE EXCEPTION 'Shared manager must belong to the selected target organization';
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
      AND up.organization_id = order_manager_shares.shared_organization_id
      AND up.id = order_manager_shares.manager_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = order_manager_shares.organization_id
      AND (
        order_manager_shares.shared_by = auth.uid()
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
      AND up.organization_id = trip_manager_shares.shared_organization_id
      AND up.id = trip_manager_shares.manager_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = trip_manager_shares.organization_id
      AND (
        trip_manager_shares.shared_by = auth.uid()
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
