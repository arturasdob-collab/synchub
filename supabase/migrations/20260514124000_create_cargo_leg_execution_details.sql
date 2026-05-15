create table if not exists public.cargo_leg_execution_details (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cargo_leg_id uuid not null unique references public.cargo_legs(id) on delete cascade,
  planned_date date null,
  planned_time_from text null,
  planned_time_to text null,
  actual_date date null,
  actual_time_from text null,
  actual_time_to text null,
  transport_price numeric(12,2) null,
  truck_plate text null,
  trailer_plate text null,
  driver_name text null,
  driver_phone text null,
  manager_notes text null,
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint cargo_leg_execution_details_planned_time_from_format
    check (planned_time_from is null or planned_time_from ~ '^[0-2][0-9]:[0-5][0-9]$'),
  constraint cargo_leg_execution_details_planned_time_to_format
    check (planned_time_to is null or planned_time_to ~ '^[0-2][0-9]:[0-5][0-9]$'),
  constraint cargo_leg_execution_details_actual_time_from_format
    check (actual_time_from is null or actual_time_from ~ '^[0-2][0-9]:[0-5][0-9]$'),
  constraint cargo_leg_execution_details_actual_time_to_format
    check (actual_time_to is null or actual_time_to ~ '^[0-2][0-9]:[0-5][0-9]$')
);

create index if not exists cargo_leg_execution_details_org_idx
  on public.cargo_leg_execution_details (organization_id);

create index if not exists cargo_leg_execution_details_cargo_leg_idx
  on public.cargo_leg_execution_details (cargo_leg_id);
