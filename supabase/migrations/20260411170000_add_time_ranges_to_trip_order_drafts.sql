alter table if exists public.trip_order_drafts
  add column if not exists loading_time_from text,
  add column if not exists loading_time_to text,
  add column if not exists unloading_time_from text,
  add column if not exists unloading_time_to text;
