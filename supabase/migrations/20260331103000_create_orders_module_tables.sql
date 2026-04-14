/*
  # Create Orders Module Tables

  1. New tables
    - `orders`
      - Stores business order data inside organization scope
      - Keeps loading, unloading, cargo, client, and manager data
      - Does not duplicate trip carrier/truck/payment execution data

    - `order_trip_links`
      - Links orders and trips
      - Supports both simple 1:1 links and future groupage scenarios

  2. Guard rails
    - Enforces same-organization relations for companies, managers, orders, and trips
    - Keeps `updated_at` fresh on order updates

  3. Security
    - Enable RLS on both new tables
    - Same-organization users can read
    - Creator or elevated roles can update/delete orders
*/

CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  next_number bigint;
BEGIN
  next_number := nextval('public.order_number_seq');
  RETURN 'ORD-' || lpad(next_number::text, 6, '0');
END;
$$;

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  internal_order_number text NOT NULL DEFAULT public.generate_order_number(),
  client_order_number text NOT NULL,
  client_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  assigned_manager_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  loading_date date,
  loading_address text,
  loading_city text,
  loading_postal_code text,
  loading_country text,
  loading_contact text,
  loading_reference text,
  loading_customs_info text,
  unloading_date date,
  unloading_address text,
  unloading_city text,
  unloading_postal_code text,
  unloading_country text,
  unloading_contact text,
  unloading_reference text,
  unloading_customs_info text,
  shipper_name text,
  consignee_name text,
  cargo_kg numeric(12,2),
  cargo_quantity text,
  cargo_description text,
  cargo_ldm numeric(12,2),
  price numeric(12,2),
  currency text NOT NULL DEFAULT 'EUR',
  notes text,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_org_internal_order_number_unique UNIQUE (organization_id, internal_order_number),
  CONSTRAINT orders_internal_order_number_not_blank CHECK (btrim(internal_order_number) <> ''),
  CONSTRAINT orders_client_order_number_not_blank CHECK (btrim(client_order_number) <> ''),
  CONSTRAINT orders_status_allowed CHECK (status IN ('active')),
  CONSTRAINT orders_currency_allowed CHECK (currency IN ('EUR', 'PLN', 'USD')),
  CONSTRAINT orders_cargo_kg_non_negative CHECK (cargo_kg IS NULL OR cargo_kg >= 0),
  CONSTRAINT orders_cargo_ldm_non_negative CHECK (cargo_ldm IS NULL OR cargo_ldm >= 0),
  CONSTRAINT orders_price_non_negative CHECK (price IS NULL OR price >= 0)
);

CREATE TABLE IF NOT EXISTS public.order_trip_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_trip_links_order_trip_unique UNIQUE (order_id, trip_id)
);

CREATE INDEX IF NOT EXISTS idx_orders_organization_created_at
  ON public.orders (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_client_order_number
  ON public.orders (client_order_number);

CREATE INDEX IF NOT EXISTS idx_orders_client_company_id
  ON public.orders (client_company_id);

CREATE INDEX IF NOT EXISTS idx_orders_assigned_manager_id
  ON public.orders (assigned_manager_id);

CREATE INDEX IF NOT EXISTS idx_orders_created_by
  ON public.orders (created_by);

CREATE INDEX IF NOT EXISTS idx_order_trip_links_organization_id
  ON public.order_trip_links (organization_id);

CREATE INDEX IF NOT EXISTS idx_order_trip_links_order_id
  ON public.order_trip_links (order_id);

CREATE INDEX IF NOT EXISTS idx_order_trip_links_trip_id
  ON public.order_trip_links (trip_id);

CREATE OR REPLACE FUNCTION public.set_orders_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_order_relations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  company_org_id uuid;
  manager_org_id uuid;
  creator_org_id uuid;
BEGIN
  IF NEW.client_company_id IS NOT NULL THEN
    SELECT organization_id
    INTO company_org_id
    FROM public.companies
    WHERE id = NEW.client_company_id;

    IF company_org_id IS NULL THEN
      RAISE EXCEPTION 'Client company not found';
    END IF;

    IF company_org_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'Client company must belong to the same organization';
    END IF;
  END IF;

  IF NEW.assigned_manager_id IS NOT NULL THEN
    SELECT organization_id
    INTO manager_org_id
    FROM public.user_profiles
    WHERE id = NEW.assigned_manager_id;

    IF manager_org_id IS NULL THEN
      RAISE EXCEPTION 'Assigned manager not found';
    END IF;

    IF manager_org_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'Assigned manager must belong to the same organization';
    END IF;
  END IF;

  IF NEW.created_by IS NOT NULL THEN
    SELECT organization_id
    INTO creator_org_id
    FROM public.user_profiles
    WHERE id = NEW.created_by;

    IF creator_org_id IS NULL THEN
      RAISE EXCEPTION 'Order creator not found';
    END IF;

    IF creator_org_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'Order creator must belong to the same organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_order_trip_link_relations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  linked_order_org_id uuid;
  linked_trip_org_id uuid;
BEGIN
  SELECT organization_id
  INTO linked_order_org_id
  FROM public.orders
  WHERE id = NEW.order_id;

  IF linked_order_org_id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  SELECT organization_id
  INTO linked_trip_org_id
  FROM public.trips
  WHERE id = NEW.trip_id;

  IF linked_trip_org_id IS NULL THEN
    RAISE EXCEPTION 'Trip not found';
  END IF;

  IF linked_order_org_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Order link organization must match order organization';
  END IF;

  IF linked_trip_org_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Order link organization must match trip organization';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_orders_updated_at_trigger ON public.orders;

CREATE TRIGGER set_orders_updated_at_trigger
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_orders_updated_at();

DROP TRIGGER IF EXISTS validate_order_relations_trigger ON public.orders;

CREATE TRIGGER validate_order_relations_trigger
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_order_relations();

DROP TRIGGER IF EXISTS validate_order_trip_link_relations_trigger ON public.order_trip_links;

CREATE TRIGGER validate_order_trip_link_relations_trigger
  BEFORE INSERT OR UPDATE ON public.order_trip_links
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_order_trip_link_relations();

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_trip_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Orders same organization can view" ON public.orders;
CREATE POLICY "Orders same organization can view"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = orders.organization_id
    )
  );

DROP POLICY IF EXISTS "Orders same organization can insert" ON public.orders;
CREATE POLICY "Orders same organization can insert"
  ON public.orders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = orders.organization_id
    )
  );

DROP POLICY IF EXISTS "Orders creator or admins can update" ON public.orders;
CREATE POLICY "Orders creator or admins can update"
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = orders.organization_id
      AND (
        orders.created_by = auth.uid()
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
      AND up.organization_id = orders.organization_id
      AND (
        orders.created_by = auth.uid()
        OR up.is_super_admin = true
        OR up.is_creator = true
        OR up.role IN ('OWNER', 'ADMIN')
      )
    )
  );

DROP POLICY IF EXISTS "Orders creator or admins can delete" ON public.orders;
CREATE POLICY "Orders creator or admins can delete"
  ON public.orders
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = orders.organization_id
      AND (
        orders.created_by = auth.uid()
        OR up.is_super_admin = true
        OR up.is_creator = true
        OR up.role IN ('OWNER', 'ADMIN')
      )
    )
  );

DROP POLICY IF EXISTS "Order trip links same organization can view" ON public.order_trip_links;
CREATE POLICY "Order trip links same organization can view"
  ON public.order_trip_links
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = order_trip_links.organization_id
    )
  );

DROP POLICY IF EXISTS "Order trip links same organization can insert" ON public.order_trip_links;
CREATE POLICY "Order trip links same organization can insert"
  ON public.order_trip_links
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = order_trip_links.organization_id
    )
  );

DROP POLICY IF EXISTS "Order trip links creator or admins can delete" ON public.order_trip_links;
CREATE POLICY "Order trip links creator or admins can delete"
  ON public.order_trip_links
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.organization_id = order_trip_links.organization_id
      AND (
        order_trip_links.created_by = auth.uid()
        OR up.is_super_admin = true
        OR up.is_creator = true
        OR up.role IN ('OWNER', 'ADMIN')
      )
    )
  );
