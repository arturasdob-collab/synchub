ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS vat_rate integer,
ADD COLUMN IF NOT EXISTS has_ex1 boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS has_t1 boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS has_adr boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS has_sent boolean NOT NULL DEFAULT false;

UPDATE public.orders
SET vat_rate = 21
WHERE vat_rate IS NULL;

ALTER TABLE public.orders
ALTER COLUMN vat_rate SET DEFAULT 21,
ALTER COLUMN vat_rate SET NOT NULL;

ALTER TABLE public.orders
DROP CONSTRAINT IF EXISTS orders_vat_rate_allowed;

ALTER TABLE public.orders
ADD CONSTRAINT orders_vat_rate_allowed
CHECK (vat_rate IN (0, 21));
