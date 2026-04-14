import type { SupabaseClient } from '@supabase/supabase-js';

export type OrderPartyRole = 'shipper' | 'consignee';

export type OrderPartyAddressRow = {
  id: string;
  party_role: OrderPartyRole;
  party_name: string;
  normalized_party_name: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  usage_count: number;
  last_used_at: string | null;
};

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function normalizeOrderPartyName(value: string | null | undefined) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  return normalized
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAnyAddressValue(params: {
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
}) {
  return !!(
    normalizeText(params.address) ||
    normalizeText(params.city) ||
    normalizeText(params.postal_code) ||
    normalizeText(params.country)
  );
}

export async function searchOrderPartyAddresses(
  serviceSupabase: SupabaseClient,
  organizationId: string,
  partyRole: OrderPartyRole,
  query: string
) {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return {
      matches: [] as OrderPartyAddressRow[],
      exactMatch: null as OrderPartyAddressRow | null,
    };
  }

  const normalizedPartyName = normalizeOrderPartyName(normalizedQuery);
  let exactMatch: OrderPartyAddressRow | null = null;

  if (normalizedPartyName) {
    const { data: exactData } = await serviceSupabase
      .from('order_party_addresses')
      .select(
        'id, party_role, party_name, normalized_party_name, address, city, postal_code, country, usage_count, last_used_at'
      )
      .eq('organization_id', organizationId)
      .eq('party_role', partyRole)
      .eq('normalized_party_name', normalizedPartyName)
      .maybeSingle();

    exactMatch = (exactData as OrderPartyAddressRow | null) ?? null;
  }

  const { data, error } = await serviceSupabase
    .from('order_party_addresses')
    .select(
      'id, party_role, party_name, normalized_party_name, address, city, postal_code, country, usage_count, last_used_at'
    )
    .eq('organization_id', organizationId)
    .eq('party_role', partyRole)
    .ilike('party_name', `%${normalizedQuery}%`)
    .order('last_used_at', { ascending: false })
    .order('usage_count', { ascending: false })
    .limit(8);

  if (error) {
    throw new Error(error.message);
  }

  const rows = ((data || []) as OrderPartyAddressRow[]).filter(Boolean);
  const deduped = exactMatch
    ? [exactMatch, ...rows.filter((row) => row.id !== exactMatch?.id)]
    : rows;

  return {
    matches: deduped,
    exactMatch,
  };
}

export async function upsertOrderPartyAddress(
  serviceSupabase: SupabaseClient,
  params: {
    organizationId: string;
    userId: string;
    partyRole: OrderPartyRole;
    partyName: string | null | undefined;
    address?: string | null;
    city?: string | null;
    postal_code?: string | null;
    country?: string | null;
  }
) {
  const partyName = normalizeText(params.partyName);
  const normalizedPartyName = normalizeOrderPartyName(partyName);

  if (!partyName || !normalizedPartyName) {
    return null;
  }

  const payload = {
    organization_id: params.organizationId,
    party_role: params.partyRole,
    party_name: partyName,
    normalized_party_name: normalizedPartyName,
    address: normalizeText(params.address),
    city: normalizeText(params.city),
    postal_code: normalizeText(params.postal_code),
    country: normalizeText(params.country),
    created_by: params.userId,
  };

  if (!hasAnyAddressValue(payload)) {
    return null;
  }

  const { data: existing } = await serviceSupabase
    .from('order_party_addresses')
    .select('id, usage_count')
    .eq('organization_id', params.organizationId)
    .eq('party_role', params.partyRole)
    .eq('normalized_party_name', normalizedPartyName)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await serviceSupabase
      .from('order_party_addresses')
      .update({
        party_name: payload.party_name,
        address: payload.address,
        city: payload.city,
        postal_code: payload.postal_code,
        country: payload.country,
        usage_count: Math.max(Number(existing.usage_count || 0) + 1, 1),
        last_used_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (error) {
      throw new Error(error.message);
    }

    return existing.id;
  }

  const { data, error } = await serviceSupabase
    .from('order_party_addresses')
    .insert({
      ...payload,
      usage_count: 1,
      last_used_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
}

export async function persistOrderPartyAddressesFromOrder(
  serviceSupabase: SupabaseClient,
  params: {
    organizationId: string;
    userId: string;
    shipper_name?: string | null;
    loading_address?: string | null;
    loading_city?: string | null;
    loading_postal_code?: string | null;
    loading_country?: string | null;
    consignee_name?: string | null;
    unloading_address?: string | null;
    unloading_city?: string | null;
    unloading_postal_code?: string | null;
    unloading_country?: string | null;
  }
) {
  await upsertOrderPartyAddress(serviceSupabase, {
    organizationId: params.organizationId,
    userId: params.userId,
    partyRole: 'shipper',
    partyName: params.shipper_name,
    address: params.loading_address,
    city: params.loading_city,
    postal_code: params.loading_postal_code,
    country: params.loading_country,
  });

  await upsertOrderPartyAddress(serviceSupabase, {
    organizationId: params.organizationId,
    userId: params.userId,
    partyRole: 'consignee',
    partyName: params.consignee_name,
    address: params.unloading_address,
    city: params.unloading_city,
    postal_code: params.unloading_postal_code,
    country: params.unloading_country,
  });
}
