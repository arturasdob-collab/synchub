alter table public.cargo_leg_execution_details
  drop constraint if exists cargo_leg_execution_details_step_status_allowed;

alter table public.cargo_leg_execution_details
  add constraint cargo_leg_execution_details_step_status_allowed
  check (
    step_status is null or step_status in (
      'active',
      'planned',
      'at_loading_place',
      'at_customs',
      'loaded',
      'in_transit',
      'loaded_to_warehouse',
      'at_warehouse',
      'loaded_to_international_truck',
      'unloaded_in_warehouse',
      'delivered',
      'finished'
    )
  );
