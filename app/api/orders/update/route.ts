import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  replaceOrderManagerShare,
  validateShareableManager,
} from '@/lib/server/manager-shares';
import { validateCompanyTypeForOrganization } from '@/lib/server/company-type-validation';
import { persistOrderPartyAddressesFromOrder } from '@/lib/server/order-party-addresses';
import { PAYMENT_TYPE_OPTIONS } from '@/lib/constants/payment-types';
import {
  parseOrderLoadType,
  parseOrderVatRate,
  resolveOrderLoadType,
} from '@/lib/utils/order-fields';

const allowedCurrencies = ['EUR', 'PLN', 'USD'] as const;
const allowedPaymentTypes = PAYMENT_TYPE_OPTIONS.map((option) => option.value);

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeDate(value: unknown) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeTime(value: unknown) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  if (trimmed === '') {
    return null;
  }

  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

  if (!match) {
    return '__invalid__';
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] ? Number(match[3]) : 0;

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    !Number.isInteger(seconds) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return '__invalid__';
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function normalizeNumber(value: unknown) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizeBoolean(value: unknown) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export async function POST(req: Request) {
  const cookieStore = cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();

  if (!body.id) {
    return NextResponse.json({ error: 'Order id is required' }, { status: 400 });
  }

  const normalizedClientOrderNumber = normalizeText(
    body.client_order_number ?? body.order_number
  );
  const normalizedCurrency = (normalizeText(body.currency) || 'EUR').toUpperCase();
  const normalizedPaymentType = normalizeText(body.payment_type);
  const normalizedPrice = normalizeNumber(body.price ?? body.sell_price);
  const normalizedCargoKg = normalizeNumber(body.cargo_kg);
  const normalizedCargoLdm = normalizeNumber(body.cargo_ldm);
  const normalizedVatRate = parseOrderVatRate(body.vat_rate);
  const rawLoadType = normalizeText(body.load_type);
  const parsedExplicitLoadType = parseOrderLoadType(rawLoadType);
  const normalizedLoadingTimeFrom = normalizeTime(
    body.loading_time_from ?? body.loading_time
  );
  const normalizedLoadingTimeTo = normalizeTime(body.loading_time_to);
  const normalizedUnloadingTimeFrom = normalizeTime(
    body.unloading_time_from ?? body.unloading_time
  );
  const normalizedUnloadingTimeTo = normalizeTime(body.unloading_time_to);

  if (!normalizedClientOrderNumber) {
    return NextResponse.json(
      { error: 'Client order number is required' },
      { status: 400 }
    );
  }

  if (!allowedCurrencies.includes(normalizedCurrency as (typeof allowedCurrencies)[number])) {
    return NextResponse.json({ error: 'Invalid currency' }, { status: 400 });
  }

  if (Number.isNaN(normalizedPrice)) {
    return NextResponse.json({ error: 'Invalid price' }, { status: 400 });
  }

  if (normalizedPrice !== null && normalizedPrice < 0) {
    return NextResponse.json(
      { error: 'Price cannot be negative' },
      { status: 400 }
    );
  }

  if (Number.isNaN(normalizedCargoKg)) {
    return NextResponse.json({ error: 'Invalid cargo kg' }, { status: 400 });
  }

  if (normalizedCargoKg !== null && normalizedCargoKg < 0) {
    return NextResponse.json(
      { error: 'Cargo kg cannot be negative' },
      { status: 400 }
    );
  }

  if (Number.isNaN(normalizedCargoLdm)) {
    return NextResponse.json({ error: 'Invalid cargo LDM' }, { status: 400 });
  }

  if (normalizedCargoLdm !== null && normalizedCargoLdm < 0) {
    return NextResponse.json(
      { error: 'Cargo LDM cannot be negative' },
      { status: 400 }
    );
  }

  if (normalizedVatRate === null) {
    return NextResponse.json({ error: 'Invalid VAT rate' }, { status: 400 });
  }

  if (rawLoadType && !parsedExplicitLoadType) {
    return NextResponse.json({ error: 'Invalid load type' }, { status: 400 });
  }

  if (normalizedLoadingTimeFrom === '__invalid__') {
    return NextResponse.json({ error: 'Invalid loading time from' }, { status: 400 });
  }

  if (normalizedLoadingTimeTo === '__invalid__') {
    return NextResponse.json({ error: 'Invalid loading time to' }, { status: 400 });
  }

  if (normalizedUnloadingTimeFrom === '__invalid__') {
    return NextResponse.json({ error: 'Invalid unloading time from' }, { status: 400 });
  }

  if (normalizedUnloadingTimeTo === '__invalid__') {
    return NextResponse.json({ error: 'Invalid unloading time to' }, { status: 400 });
  }

  if (
    normalizedPaymentType &&
    !allowedPaymentTypes.includes(normalizedPaymentType as (typeof allowedPaymentTypes)[number])
  ) {
    return NextResponse.json({ error: 'Invalid payment type' }, { status: 400 });
  }

  const { data: profile, error: profileError } = await serviceSupabase
    .from('user_profiles')
    .select('organization_id, role, is_super_admin, is_creator')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    return NextResponse.json(
      { error: 'User organization not found' },
      { status: 400 }
    );
  }

  const { data: existingOrder, error: existingOrderError } = await serviceSupabase
    .from('orders')
    .select('id, created_by, organization_id')
    .eq('id', body.id)
    .single();

  if (existingOrderError || !existingOrder) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  if (existingOrder.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const canEdit =
    existingOrder.created_by === user.id ||
    profile.is_super_admin === true ||
    profile.is_creator === true ||
    ['OWNER', 'ADMIN'].includes(profile.role);

  if (!canEdit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await validateShareableManager(
      serviceSupabase,
      profile.organization_id,
      body.shared_manager_user_id,
      body.shared_organization_id
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid shared manager' },
      { status: 400 }
    );
  }

  try {
    await validateCompanyTypeForOrganization(
      serviceSupabase,
      profile.organization_id,
      body.client_company_id || null,
      'client'
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid client company' },
      { status: 400 }
    );
  }

  const payload = {
    client_order_number: normalizedClientOrderNumber,
    client_company_id: body.client_company_id || null,
    loading_date: normalizeDate(body.loading_date),
    loading_time_from: normalizedLoadingTimeFrom,
    loading_time_to: normalizedLoadingTimeTo,
    loading_address: normalizeText(body.loading_address),
    loading_city: normalizeText(body.loading_city),
    loading_postal_code: normalizeText(body.loading_postal_code),
    loading_country: normalizeText(body.loading_country),
    loading_contact: normalizeText(body.loading_contact),
    loading_reference: normalizeText(body.loading_reference),
    loading_customs_info: normalizeText(body.loading_customs_info),
    unloading_date: normalizeDate(body.unloading_date),
    unloading_time_from: normalizedUnloadingTimeFrom,
    unloading_time_to: normalizedUnloadingTimeTo,
    unloading_address: normalizeText(body.unloading_address),
    unloading_city: normalizeText(body.unloading_city),
    unloading_postal_code: normalizeText(body.unloading_postal_code),
    unloading_country: normalizeText(body.unloading_country),
    unloading_contact: normalizeText(body.unloading_contact),
    unloading_reference: normalizeText(body.unloading_reference),
    unloading_customs_info: normalizeText(body.unloading_customs_info),
    shipper_name: normalizeText(body.shipper_name),
    consignee_name: normalizeText(body.consignee_name),
    received_from_name: normalizeText(body.received_from_name),
    received_from_contact: normalizeText(body.received_from_contact),
    cargo_kg: normalizedCargoKg,
    cargo_quantity: normalizeText(body.cargo_quantity),
    cargo_description: normalizeText(body.cargo_description ?? body.cargo_text),
    cargo_ldm: normalizedCargoLdm,
    load_type: resolveOrderLoadType({
      explicitLoadType: parsedExplicitLoadType,
      cargoLdm: normalizedCargoLdm,
      values: [
        body.cargo_description ?? body.cargo_text,
        body.notes,
        body.loading_customs_info,
        body.unloading_customs_info,
        body.loading_reference,
        body.unloading_reference,
      ],
    }),
    has_ex1: normalizeBoolean(body.has_ex1),
    has_t1: normalizeBoolean(body.has_t1),
    has_adr: normalizeBoolean(body.has_adr),
    has_sent: normalizeBoolean(body.has_sent),
    price: normalizedPrice,
    vat_rate: normalizedVatRate,
    currency: normalizedCurrency,
    payment_term_text: normalizeText(body.payment_term_text),
    payment_type: normalizedPaymentType,
    notes: normalizeText(body.notes),
  };

  const { error } = await serviceSupabase
    .from('orders')
    .update(payload)
    .eq('id', body.id)
    .eq('organization_id', profile.organization_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    await persistOrderPartyAddressesFromOrder(serviceSupabase, {
      organizationId: profile.organization_id,
      userId: user.id,
      shipper_name: payload.shipper_name,
      loading_address: payload.loading_address,
      loading_city: payload.loading_city,
      loading_postal_code: payload.loading_postal_code,
      loading_country: payload.loading_country,
      consignee_name: payload.consignee_name,
      unloading_address: payload.unloading_address,
      unloading_city: payload.unloading_city,
      unloading_postal_code: payload.unloading_postal_code,
      unloading_country: payload.unloading_country,
    });
  } catch (partyAddressError) {
    console.error('Failed to persist order party addresses on update', partyAddressError);
  }

  try {
    await replaceOrderManagerShare(serviceSupabase, {
      organizationId: profile.organization_id,
      orderId: body.id,
      managerUserId: body.shared_manager_user_id,
      sharedOrganizationId: body.shared_organization_id,
      sharedBy: user.id,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save shared manager' },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
