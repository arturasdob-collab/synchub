alter table public.cargo_leg_execution_details
  add column if not exists arrival_confirmed boolean not null default false,
  add column if not exists dimensions_checked boolean not null default false,
  add column if not exists cargo_matches boolean not null default false,
  add column if not exists damaged_reported boolean not null default false;
