create table if not exists workflow_custom_columns (
  id uuid primary key default gen_random_uuid(),
  owner_organization_id uuid not null references organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  slug text not null check (btrim(slug) <> ''),
  visibility_scope text not null check (visibility_scope in ('self', 'selected_organizations')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_organization_id, slug)
);

create index if not exists workflow_custom_columns_owner_idx
  on workflow_custom_columns (owner_organization_id, created_at desc);

create index if not exists workflow_custom_columns_created_by_idx
  on workflow_custom_columns (created_by, created_at desc);

create table if not exists workflow_custom_column_organizations (
  column_id uuid not null references workflow_custom_columns(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (column_id, organization_id)
);

create index if not exists workflow_custom_column_organizations_org_idx
  on workflow_custom_column_organizations (organization_id, column_id);

create table if not exists workflow_custom_column_values (
  id uuid primary key default gen_random_uuid(),
  column_id uuid not null references workflow_custom_columns(id) on delete cascade,
  record_type text not null check (record_type in ('order', 'trip')),
  record_id uuid not null,
  value_text text,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (column_id, record_type, record_id)
);

create index if not exists workflow_custom_column_values_column_idx
  on workflow_custom_column_values (column_id, record_type);

create index if not exists workflow_custom_column_values_record_idx
  on workflow_custom_column_values (record_type, record_id);

create or replace function public.set_workflow_custom_columns_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_workflow_custom_columns_updated_at_trigger
on public.workflow_custom_columns;

create trigger set_workflow_custom_columns_updated_at_trigger
before update on public.workflow_custom_columns
for each row
execute function public.set_workflow_custom_columns_updated_at();

create or replace function public.set_workflow_custom_column_values_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_workflow_custom_column_values_updated_at_trigger
on public.workflow_custom_column_values;

create trigger set_workflow_custom_column_values_updated_at_trigger
before update on public.workflow_custom_column_values
for each row
execute function public.set_workflow_custom_column_values_updated_at();

alter table workflow_custom_columns enable row level security;
alter table workflow_custom_column_organizations enable row level security;
alter table workflow_custom_column_values enable row level security;
