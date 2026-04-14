/*
  # Add organization profile fields and user contact fields

  Purpose:
  - support organization cards for route responsibility
  - store organization requisites/address/type in a dedicated tenant-level place
  - store employee contact info on user_profiles for organization staff lists
*/

alter table public.organizations
  add column if not exists type text,
  add column if not exists company_code text,
  add column if not exists vat_code text,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists postal_code text,
  add column if not exists country text,
  add column if not exists contact_phone text,
  add column if not exists contact_email text,
  add column if not exists notes text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_type_check'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations
      add constraint organizations_type_check
      check (
        type is null
        or type in ('company', 'partner', 'terminal', 'warehouse')
      );
  end if;
end $$;

alter table public.user_profiles
  add column if not exists position text,
  add column if not exists phone text;

create index if not exists organizations_type_idx
  on public.organizations(type);

create index if not exists organizations_company_code_idx
  on public.organizations(company_code);
