alter table public.organizations
  add column if not exists workspace_mode text;

update public.organizations
set workspace_mode = case
  when upper(coalesce(name, '')) like 'TEMPUS%' then 'full_internal'
  else 'partner_limited'
end
where workspace_mode is null;

alter table public.organizations
  alter column workspace_mode set default 'partner_limited';

alter table public.organizations
  alter column workspace_mode set not null;

alter table public.organizations
  drop constraint if exists organizations_workspace_mode_check;

alter table public.organizations
  add constraint organizations_workspace_mode_check
  check (workspace_mode in ('full_internal', 'partner_limited'));

create index if not exists organizations_workspace_mode_idx
  on public.organizations(workspace_mode);
