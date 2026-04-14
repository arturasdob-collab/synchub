create table if not exists public.organization_warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  address text,
  city text,
  postal_code text,
  country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists organization_warehouses_org_name_lower_idx
  on public.organization_warehouses (organization_id, lower(name));

create index if not exists organization_warehouses_org_idx
  on public.organization_warehouses (organization_id);

create or replace function public.set_organization_warehouses_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_organization_warehouses_updated_at on public.organization_warehouses;
create trigger update_organization_warehouses_updated_at
before update on public.organization_warehouses
for each row execute procedure public.set_organization_warehouses_updated_at();

alter table public.cargo_legs
  add column if not exists responsible_warehouse_id uuid references public.organization_warehouses(id) on delete set null;

create index if not exists cargo_legs_responsible_warehouse_idx
  on public.cargo_legs (responsible_warehouse_id);

create or replace function public.validate_cargo_leg_responsible_warehouse()
returns trigger
language plpgsql
as $$
declare
  warehouse_org_id uuid;
begin
  if new.responsible_warehouse_id is null then
    return new;
  end if;

  select organization_id
    into warehouse_org_id
  from public.organization_warehouses
  where id = new.responsible_warehouse_id;

  if warehouse_org_id is null then
    raise exception 'Responsible warehouse not found';
  end if;

  if new.responsible_organization_id is null then
    raise exception 'Responsible organization is required when warehouse is selected';
  end if;

  if warehouse_org_id <> new.responsible_organization_id then
    raise exception 'Responsible warehouse must belong to the responsible organization';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_cargo_leg_responsible_warehouse_trigger on public.cargo_legs;
create trigger validate_cargo_leg_responsible_warehouse_trigger
before insert or update on public.cargo_legs
for each row execute procedure public.validate_cargo_leg_responsible_warehouse();
