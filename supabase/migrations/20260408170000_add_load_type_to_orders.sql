alter table public.orders
add column if not exists load_type text
check (load_type in ('LTL', 'FTL'));

update public.orders
set load_type = case
  when cargo_description ilike '%FTL%' or notes ilike '%FTL%' then 'FTL'
  when cargo_ldm >= 13.6 then 'FTL'
  when cargo_ldm is not null then 'LTL'
  else load_type
end
where load_type is null;
