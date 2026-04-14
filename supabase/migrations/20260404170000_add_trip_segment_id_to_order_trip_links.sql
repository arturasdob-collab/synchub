ALTER TABLE public.order_trip_links
  ADD COLUMN IF NOT EXISTS trip_segment_id uuid REFERENCES public.trip_segments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_trip_links_trip_segment_id
  ON public.order_trip_links (trip_segment_id);

CREATE OR REPLACE FUNCTION public.validate_order_trip_link_relations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  linked_order_org_id uuid;
  linked_trip_org_id uuid;
  linked_segment_org_id uuid;
  linked_segment_trip_id uuid;
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

  IF NEW.trip_segment_id IS NOT NULL THEN
    SELECT organization_id, trip_id
    INTO linked_segment_org_id, linked_segment_trip_id
    FROM public.trip_segments
    WHERE id = NEW.trip_segment_id;

    IF linked_segment_org_id IS NULL THEN
      RAISE EXCEPTION 'Trip leg not found';
    END IF;

    IF linked_segment_org_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'Order link organization must match trip leg organization';
    END IF;

    IF linked_segment_trip_id <> NEW.trip_id THEN
      RAISE EXCEPTION 'Trip leg must belong to the same trip';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Order trip links creator or admins can update" ON public.order_trip_links;
CREATE POLICY "Order trip links creator or admins can update"
  ON public.order_trip_links
  FOR UPDATE
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
  )
  WITH CHECK (
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
