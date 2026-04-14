ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS payment_term_text text;

CREATE INDEX IF NOT EXISTS idx_orders_payment_term_text
  ON public.orders (payment_term_text);
