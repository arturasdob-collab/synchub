alter table public.workflow_route_plans
  add column if not exists distribution_mode text not null default 'not_set';

alter table public.workflow_route_plans
  drop constraint if exists workflow_route_plans_distribution_mode_check;

alter table public.workflow_route_plans
  add constraint workflow_route_plans_distribution_mode_check check (
    distribution_mode in ('not_set', 'direct', 'distribution_trip')
  );

alter table public.workflow_route_plans
  add column if not exists post_international_reloading_mode text not null default 'not_set';

alter table public.workflow_route_plans
  drop constraint if exists workflow_route_plans_post_international_reloading_mode_check;

alter table public.workflow_route_plans
  add constraint workflow_route_plans_post_international_reloading_mode_check check (
    post_international_reloading_mode in ('not_set', 'no_reloading', 'reloading')
  );
