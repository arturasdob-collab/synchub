/*
  Backfill manager shares for already linked order <-> trip pairs.

  Safety rules:
  - never overwrite an existing share
  - only backfill when the missing side can be inferred unambiguously
  - prefer explicit order/trip manager shares
  - if explicit share is missing, fallback to the order/trip creator only when
    that user is an active OWNER / ADMIN / MANAGER in the same organization
*/

with order_side_candidates as (
  select
    otl.organization_id,
    otl.trip_id,
    coalesce(
      oms.manager_user_id,
      case
        when coalesce(oc.disabled, false) = false
         and oc.role in ('OWNER', 'ADMIN', 'MANAGER')
         and oc.organization_id = otl.organization_id
        then oc.id
        else null
      end
    ) as manager_user_id,
    coalesce(
      oms.shared_organization_id,
      case
        when coalesce(oc.disabled, false) = false
         and oc.role in ('OWNER', 'ADMIN', 'MANAGER')
         and oc.organization_id = otl.organization_id
        then oc.organization_id
        else null
      end
    ) as shared_organization_id,
    coalesce(oms.shared_by, o.created_by, t.created_by, otl.created_by) as shared_by
  from public.order_trip_links otl
  join public.orders o
    on o.id = otl.order_id
  join public.trips t
    on t.id = otl.trip_id
  left join public.order_manager_shares oms
    on oms.order_id = otl.order_id
   and oms.organization_id = otl.organization_id
  left join public.user_profiles oc
    on oc.id = o.created_by
  left join public.trip_manager_shares tms
    on tms.trip_id = otl.trip_id
   and tms.organization_id = otl.organization_id
  where tms.id is null
),
trip_candidates as (
  select
    organization_id,
    trip_id,
    min(manager_user_id::text)::uuid as manager_user_id,
    min(shared_organization_id::text)::uuid as shared_organization_id,
    min(shared_by::text)::uuid as shared_by,
    count(
      distinct (manager_user_id::text || ':' || shared_organization_id::text)
    ) as distinct_target_count
  from order_side_candidates
  where manager_user_id is not null
    and shared_organization_id is not null
  group by organization_id, trip_id
),
trip_side_candidates as (
  select
    otl.organization_id,
    otl.order_id,
    coalesce(
      tms.manager_user_id,
      case
        when coalesce(tc.disabled, false) = false
         and tc.role in ('OWNER', 'ADMIN', 'MANAGER')
         and tc.organization_id = otl.organization_id
        then tc.id
        else null
      end
    ) as manager_user_id,
    coalesce(
      tms.shared_organization_id,
      case
        when coalesce(tc.disabled, false) = false
         and tc.role in ('OWNER', 'ADMIN', 'MANAGER')
         and tc.organization_id = otl.organization_id
        then tc.organization_id
        else null
      end
    ) as shared_organization_id,
    coalesce(tms.shared_by, t.created_by, o.created_by, otl.created_by) as shared_by
  from public.order_trip_links otl
  join public.trips t
    on t.id = otl.trip_id
  join public.orders o
    on o.id = otl.order_id
  left join public.trip_manager_shares tms
    on tms.trip_id = otl.trip_id
   and tms.organization_id = otl.organization_id
  left join public.user_profiles tc
    on tc.id = t.created_by
  left join public.order_manager_shares oms
    on oms.order_id = otl.order_id
   and oms.organization_id = otl.organization_id
  where oms.id is null
),
order_candidates as (
  select
    organization_id,
    order_id,
    min(manager_user_id::text)::uuid as manager_user_id,
    min(shared_organization_id::text)::uuid as shared_organization_id,
    min(shared_by::text)::uuid as shared_by,
    count(
      distinct (manager_user_id::text || ':' || shared_organization_id::text)
    ) as distinct_target_count
  from trip_side_candidates
  where manager_user_id is not null
    and shared_organization_id is not null
  group by organization_id, order_id
)
insert into public.trip_manager_shares (
  organization_id,
  shared_organization_id,
  trip_id,
  manager_user_id,
  shared_by
)
select
  organization_id,
  shared_organization_id,
  trip_id,
  manager_user_id,
  shared_by
from trip_candidates
where distinct_target_count = 1
on conflict (trip_id) do nothing;

with trip_side_candidates as (
  select
    otl.organization_id,
    otl.order_id,
    coalesce(
      tms.manager_user_id,
      case
        when tc.disabled = false
         and tc.role in ('OWNER', 'ADMIN', 'MANAGER')
         and tc.organization_id = otl.organization_id
        then tc.id
        else null
      end
    ) as manager_user_id,
    coalesce(
      tms.shared_organization_id,
      case
        when tc.disabled = false
         and tc.role in ('OWNER', 'ADMIN', 'MANAGER')
         and tc.organization_id = otl.organization_id
        then tc.organization_id
        else null
      end
    ) as shared_organization_id,
    coalesce(tms.shared_by, t.created_by, o.created_by, otl.created_by) as shared_by
  from public.order_trip_links otl
  join public.trips t
    on t.id = otl.trip_id
  join public.orders o
    on o.id = otl.order_id
  left join public.trip_manager_shares tms
    on tms.trip_id = otl.trip_id
   and tms.organization_id = otl.organization_id
  left join public.user_profiles tc
    on tc.id = t.created_by
  left join public.order_manager_shares oms
    on oms.order_id = otl.order_id
   and oms.organization_id = otl.organization_id
  where oms.id is null
),
order_candidates as (
  select
    organization_id,
    order_id,
    min(manager_user_id::text)::uuid as manager_user_id,
    min(shared_organization_id::text)::uuid as shared_organization_id,
    min(shared_by::text)::uuid as shared_by,
    count(
      distinct (manager_user_id::text || ':' || shared_organization_id::text)
    ) as distinct_target_count
  from trip_side_candidates
  where manager_user_id is not null
    and shared_organization_id is not null
  group by organization_id, order_id
)
insert into public.order_manager_shares (
  organization_id,
  shared_organization_id,
  order_id,
  manager_user_id,
  shared_by
)
select
  organization_id,
  shared_organization_id,
  order_id,
  manager_user_id,
  shared_by
from order_candidates
where distinct_target_count = 1
on conflict (order_id) do nothing;
