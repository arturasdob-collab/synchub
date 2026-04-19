create table if not exists workflow_field_updates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  record_type text not null check (record_type in ('order', 'trip')),
  record_id uuid not null,
  field_key text not null check (
    field_key in (
      'contact',
      'sender',
      'loading',
      'loading_customs',
      'receiver',
      'unloading',
      'unloading_customs',
      'cargo',
      'kg',
      'ldm',
      'revenue',
      'cost',
      'profit',
      'trip_vehicle'
    )
  ),
  value_text text,
  updated_by uuid not null references auth.users(id) on delete restrict,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (record_type, record_id, field_key)
);

create index if not exists workflow_field_updates_org_idx
  on workflow_field_updates (organization_id, record_type);

create index if not exists workflow_field_updates_record_idx
  on workflow_field_updates (record_type, record_id);

create index if not exists workflow_field_updates_updated_by_idx
  on workflow_field_updates (updated_by);

create table if not exists workflow_field_update_receipts (
  field_update_id uuid not null references workflow_field_updates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seen_revision integer not null default 0 check (seen_revision >= 0),
  acknowledged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (field_update_id, user_id)
);

create index if not exists workflow_field_update_receipts_user_idx
  on workflow_field_update_receipts (user_id, acknowledged_at desc);

alter table workflow_field_updates enable row level security;
alter table workflow_field_update_receipts enable row level security;
