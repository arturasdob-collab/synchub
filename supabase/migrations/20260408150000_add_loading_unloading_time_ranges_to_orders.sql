alter table public.orders
  add column if not exists loading_time_from time,
  add column if not exists loading_time_to time,
  add column if not exists unloading_time_from time,
  add column if not exists unloading_time_to time;

update public.orders
set
  loading_time_from = coalesce(loading_time_from, loading_time),
  unloading_time_from = coalesce(unloading_time_from, unloading_time)
where
  loading_time is not null
  or unloading_time is not null;
