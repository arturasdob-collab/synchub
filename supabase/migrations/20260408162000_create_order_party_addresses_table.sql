create table if not exists public.order_party_addresses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  party_role text not null check (party_role in ('shipper', 'consignee')),
  party_name text not null,
  normalized_party_name text not null,
  address text,
  city text,
  postal_code text,
  country text,
  usage_count integer not null default 1 check (usage_count >= 1),
  last_used_at timestamptz not null default now(),
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_party_addresses_party_name_not_blank check (btrim(party_name) <> ''),
  constraint order_party_addresses_org_role_name_unique unique (
    organization_id,
    party_role,
    normalized_party_name
  )
);

create index if not exists idx_order_party_addresses_org_role_name
  on public.order_party_addresses (organization_id, party_role, party_name);

create index if not exists idx_order_party_addresses_org_role_last_used
  on public.order_party_addresses (organization_id, party_role, last_used_at desc);

create or replace function public.set_order_party_addresses_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.validate_order_party_address_relations()
returns trigger
language plpgsql
as $$
declare
  creator_org_id uuid;
begin
  if new.created_by is not null then
    select organization_id
    into creator_org_id
    from public.user_profiles
    where id = new.created_by;

    if creator_org_id is null then
      raise exception 'Order party address creator not found';
    end if;

    if creator_org_id <> new.organization_id then
      raise exception 'Order party address creator must belong to the same organization';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_order_party_addresses_updated_at on public.order_party_addresses;
create trigger trg_set_order_party_addresses_updated_at
before update on public.order_party_addresses
for each row
execute function public.set_order_party_addresses_updated_at();

drop trigger if exists trg_validate_order_party_address_relations on public.order_party_addresses;
create trigger trg_validate_order_party_address_relations
before insert or update on public.order_party_addresses
for each row
execute function public.validate_order_party_address_relations();

alter table public.order_party_addresses enable row level security;

drop policy if exists "order_party_addresses_select_same_org" on public.order_party_addresses;
create policy "order_party_addresses_select_same_org"
  on public.order_party_addresses
  for select
  using (
    exists (
      select 1
      from public.user_profiles up
      where up.id = auth.uid()
        and up.organization_id = order_party_addresses.organization_id
    )
  );
