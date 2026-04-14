ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS payment_type text;

ALTER TABLE public.orders
DROP CONSTRAINT IF EXISTS orders_payment_type_allowed;

ALTER TABLE public.orders
ADD CONSTRAINT orders_payment_type_allowed
CHECK (
  payment_type IS NULL OR
  payment_type IN ('bank_after_scan', 'bank_after_originals', 'cash', 'other')
);
