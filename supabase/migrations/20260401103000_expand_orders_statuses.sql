ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_allowed;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_allowed
  CHECK (status IN ('unconfirmed', 'confirmed', 'active', 'completed'));

UPDATE public.orders
SET status = 'confirmed'
WHERE status = 'active';

ALTER TABLE public.orders
  ALTER COLUMN status SET DEFAULT 'confirmed';
