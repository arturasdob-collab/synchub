alter table public.cargo_leg_execution_details
add column if not exists transport_price_currency text not null default 'EUR';

update public.cargo_leg_execution_details
set transport_price_currency = 'EUR'
where transport_price_currency is null
   or transport_price_currency not in ('EUR', 'PLN');

alter table public.cargo_leg_execution_details
drop constraint if exists cargo_leg_execution_details_transport_price_currency_allowed;

alter table public.cargo_leg_execution_details
add constraint cargo_leg_execution_details_transport_price_currency_allowed
check (transport_price_currency in ('EUR', 'PLN'));
