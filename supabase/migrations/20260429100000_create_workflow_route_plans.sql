create table if not exists workflow_route_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  collection_mode text not null default 'not_set' check (
    collection_mode in ('not_set', 'direct', 'collection_trip')
  ),
  reloading_mode text not null default 'not_set' check (
    reloading_mode in ('not_set', 'no_reloading', 'reloading')
  ),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id)
);

create index if not exists workflow_route_plans_org_idx
  on workflow_route_plans (organization_id, created_at desc);

create index if not exists workflow_route_plans_order_idx
  on workflow_route_plans (order_id);

create or replace function public.set_workflow_route_plans_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_workflow_route_plans_updated_at_trigger
on public.workflow_route_plans;

create trigger set_workflow_route_plans_updated_at_trigger
before update on public.workflow_route_plans
for each row
execute function public.set_workflow_route_plans_updated_at();

alter table workflow_route_plans enable row level security;
