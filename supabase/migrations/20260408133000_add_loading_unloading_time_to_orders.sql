ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS loading_time time,
ADD COLUMN IF NOT EXISTS unloading_time time;
