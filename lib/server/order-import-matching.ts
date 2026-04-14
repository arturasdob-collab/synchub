import type { SupabaseClient } from '@supabase/supabase-js';
import {
  detectOrderCargoFlagsFromValues,
  EMPTY_ORDER_CARGO_FLAGS,
  parseOrderLoadType,
  parseOrderVatRate,
  resolveOrderLoadType,
  resolveOrderVatRate,
  type OrderCargoFlags,
} from '@/lib/utils/order-fields';

type CompanyCandidate = {
  id: string;
  name: string | null;
  company_code: string | null;
  vat_code: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  is_client: boolean | null;
};

type ContactCandidate = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  phone: string | null;
  email: string | null;
};

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeDigits(value: string | null | undefined) {
  if (!value) return null;

  const digits = value.replace(/\D+/g, '');
  return digits || null;
}

function normalizeComparableText(value: string | null | undefined) {
  if (!value) return null;

  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const STREET_KEYWORD_REGEX =
  /\b(?:ul\.?|al\.?|aleja|g\.?|gatv(?:e|ė)|str\.?|street|st\.?|ave(?:nue)?|road|rd\.?|pl\.?|prospekt(?:as)?|pr\.?|lane|ln\.?)\b/iu;
const POSTAL_CODE_REGEX = /\b(?:[A-Z]{0,2}-)?\d{2,5}(?:-\d{2,5})?\b/u;
const ADDRESS_NUMBER_REGEX = /\d+[A-Za-z]?(?:[/-]\d+[A-Za-z]?)?/u;
const ADDRESS_NOISE_REGEX =
  /\b(?:ref(?:erence)?|tel(?:\.|efon)?|phone|mob(?:ile)?|email|contact|customs|broker|agency|celna|muitin(?:e|es)?|warehouse|sand(?:e|ė)l(?:io|is)?|working hours|open hours|godz(?:iny)?)\b|@/iu;
const COMPANY_NAME_REGEX =
  /\b(?:uab|sp\.?\s*z\.?\s*o\.?\s*o\.?|spoo|s\.?a\.?|llc|ltd|inc|gmbh|logistics|transport|terminal(?:as)?|group|company)\b/iu;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanAddressText(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/^[,;:/\-\s]+|[,;:/\-\s]+$/g, '')
    .trim();
}

function removeTrailingAddressPart(value: string, removable: string | null | undefined) {
  const normalizedRemovable = normalizeText(removable);

  if (!normalizedRemovable) {
    return value;
  }

  return cleanAddressText(
    value.replace(
      new RegExp(`(?:,?\\s*${escapeRegExp(normalizedRemovable)})\\s*$`, 'iu'),
      ''
    )
  );
}

function scoreStreetAddressCandidate(params: {
  candidate: string;
  partyName: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
}) {
  const candidate = cleanAddressText(params.candidate);
  const normalizedCandidate = normalizeComparableText(candidate);

  if (!candidate || !normalizedCandidate) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;

  if (ADDRESS_NOISE_REGEX.test(candidate)) {
    score -= 10;
  }

  if (params.partyName) {
    const normalizedPartyName = normalizeComparableText(params.partyName);

    if (normalizedPartyName && normalizedCandidate === normalizedPartyName) {
      score -= 8;
    } else if (
      normalizedPartyName &&
      normalizedCandidate.includes(normalizedPartyName) &&
      !ADDRESS_NUMBER_REGEX.test(candidate)
    ) {
      score -= 5;
    }
  }

  if (params.city) {
    const normalizedCity = normalizeComparableText(params.city);

    if (normalizedCity && normalizedCandidate === normalizedCity) {
      score -= 7;
    }
  }

  if (params.country) {
    const normalizedCountry = normalizeComparableText(params.country);

    if (normalizedCountry && normalizedCandidate === normalizedCountry) {
      score -= 7;
    }
  }

  if (params.postalCode && candidate.includes(params.postalCode)) {
    score -= STREET_KEYWORD_REGEX.test(candidate) ? 1 : 5;
  }

  if (COMPANY_NAME_REGEX.test(candidate) && !STREET_KEYWORD_REGEX.test(candidate)) {
    score -= 4;
  }

  if (POSTAL_CODE_REGEX.test(candidate) && !STREET_KEYWORD_REGEX.test(candidate)) {
    score -= 3;
  }

  if (STREET_KEYWORD_REGEX.test(candidate)) {
    score += 5;
  }

  if (ADDRESS_NUMBER_REGEX.test(candidate)) {
    score += 3;
  }

  if (/[^\W\d_]/u.test(candidate) && ADDRESS_NUMBER_REGEX.test(candidate)) {
    score += 1;
  }

  if (!STREET_KEYWORD_REGEX.test(candidate) && !ADDRESS_NUMBER_REGEX.test(candidate)) {
    score -= 3;
  }

  return score;
}

function extractStreetAddress(params: {
  rawAddress: string | null;
  partyName?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
}) {
  const rawAddress = normalizeText(params.rawAddress);

  if (!rawAddress) {
    return null;
  }

  const rawCandidates = rawAddress
    .replace(/\r/g, '\n')
    .replace(/\/{2,}/g, '\n')
    .split(/\n+/)
    .flatMap((line) => {
      const normalizedLine = cleanAddressText(line);

      if (!normalizedLine) {
        return [];
      }

      const commaSegments = normalizedLine
        .split(/\s*,\s*/)
        .map((segment) => cleanAddressText(segment))
        .filter(Boolean);

      return [normalizedLine, ...commaSegments];
    });

  const uniqueCandidates = Array.from(new Set(rawCandidates));
  let bestCandidate: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of uniqueCandidates) {
    const score = scoreStreetAddressCandidate({
      candidate,
      partyName: params.partyName || null,
      city: params.city || null,
      postalCode: params.postalCode || null,
      country: params.country || null,
    });

    if (score > bestScore) {
      bestCandidate = candidate;
      bestScore = score;
    }
  }

  const fallbackCandidate = uniqueCandidates[0] || rawAddress;
  let nextAddress = cleanAddressText(
    bestCandidate && bestScore > 0 ? bestCandidate : fallbackCandidate
  );

  nextAddress = removeTrailingAddressPart(nextAddress, params.postalCode);
  nextAddress = removeTrailingAddressPart(nextAddress, params.city);
  nextAddress = removeTrailingAddressPart(nextAddress, params.country);

  return normalizeText(nextAddress) || rawAddress;
}

function buildCargoDescriptionWithDimensions(params: {
  cargoDescription: string | null;
  cargoDimensions: string | null;
}) {
  const cargoDescription = normalizeText(params.cargoDescription);
  const cargoDimensions = normalizeText(params.cargoDimensions);

  if (!cargoDescription) {
    return cargoDimensions;
  }

  if (!cargoDimensions) {
    return cargoDescription;
  }

  const normalizedDescription = normalizeComparableText(cargoDescription);
  const normalizedDimensions = normalizeComparableText(cargoDimensions);

  if (
    normalizedDescription &&
    normalizedDimensions &&
    normalizedDescription.includes(normalizedDimensions)
  ) {
    return cargoDescription;
  }

  return `${cargoDescription} / ${cargoDimensions}`;
}

function splitPersonName(fullName: string | null | undefined) {
  const normalized = normalizeText(fullName);

  if (!normalized) {
    return {
      first_name: null,
      last_name: null,
    };
  }

  const parts = normalized.split(/\s+/);

  if (parts.length === 1) {
    return {
      first_name: parts[0],
      last_name: null,
    };
  }

  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(' '),
  };
}

function formatContactName(contact: ContactCandidate) {
  return `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || '-';
}

function joinUniqueContactValues(values: Array<string | null | undefined>) {
  const unique = new Set<string>();

  for (const value of values) {
    const normalized = normalizeText(value);

    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();

    if (!unique.has(key)) {
      unique.add(key);
    }
  }

  return Array.from(unique.values())
    .map((key) =>
      values.find(
        (value) => normalizeText(value)?.toLowerCase() === key
      )
    )
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    .join(' | ') || null;
}

function pickString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = normalizeText(source[key]);

    if (value) {
      return value;
    }
  }

  return null;
}

function pickNumber(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const rawValue = source[key];

    if (rawValue === null || rawValue === undefined || rawValue === '') {
      continue;
    }

    const parsed = Number(rawValue);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function pickBoolean(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const rawValue = source[key];

    if (typeof rawValue === 'boolean') {
      return rawValue;
    }

    if (typeof rawValue === 'string') {
      const normalized = rawValue.trim().toLowerCase();

      if (normalized === 'true' || normalized === 'yes' || normalized === '1') {
        return true;
      }

      if (normalized === 'false' || normalized === 'no' || normalized === '0') {
        return false;
      }
    }
  }

  return null;
}

async function findCompanyCandidates(
  serviceSupabase: SupabaseClient,
  organizationId: string,
  parsedData: Record<string, unknown>
) {
  const companyCode = pickString(parsedData, [
    'client_company_code',
    'company_code',
    'customer_code',
  ]);
  const vatCode = pickString(parsedData, [
    'client_vat_code',
    'vat_code',
    'company_vat_code',
  ]);
  const companyName = pickString(parsedData, [
    'client_company_name',
    'company_name',
    'client_name',
    'customer_name',
  ]);

  if (companyCode) {
    const { data } = await serviceSupabase
      .from('companies')
      .select(
        'id, name, company_code, vat_code, country, city, address, phone, email, is_client'
      )
      .eq('organization_id', organizationId)
      .eq('is_client', true)
      .ilike('company_code', companyCode)
      .limit(5);

    if ((data || []).length > 0) {
      return {
        mode: 'company_code',
        confidence: 'high',
        lookup_key: 'company_code',
        company_code_required: true,
        candidates: data as CompanyCandidate[],
      };
    }

    return {
      mode: 'company_code_missing',
      confidence: 'none',
      lookup_key: 'company_code',
      company_code_required: true,
      candidates: [] as CompanyCandidate[],
    };
  }

  if (vatCode) {
    const { data } = await serviceSupabase
      .from('companies')
      .select(
        'id, name, company_code, vat_code, country, city, address, phone, email, is_client'
      )
      .eq('organization_id', organizationId)
      .eq('is_client', true)
      .ilike('vat_code', vatCode)
      .limit(5);

    if ((data || []).length > 0) {
      return {
        mode: 'vat_code',
        confidence: 'high',
        lookup_key: 'vat_code',
        company_code_required: false,
        candidates: data as CompanyCandidate[],
      };
    }
  }

  if (companyName) {
    const { data: exactNameMatches } = await serviceSupabase
      .from('companies')
      .select(
        'id, name, company_code, vat_code, country, city, address, phone, email, is_client'
      )
      .eq('organization_id', organizationId)
      .eq('is_client', true)
      .ilike('name', companyName)
      .limit(5);

    if ((exactNameMatches || []).length > 0) {
      return {
        mode: 'name_exact',
        confidence: 'medium',
        lookup_key: 'name',
        company_code_required: false,
        candidates: exactNameMatches as CompanyCandidate[],
      };
    }

    const { data: partialNameMatches } = await serviceSupabase
      .from('companies')
      .select(
        'id, name, company_code, vat_code, country, city, address, phone, email, is_client'
      )
      .eq('organization_id', organizationId)
      .eq('is_client', true)
      .ilike('name', `%${companyName}%`)
      .limit(5);

    if ((partialNameMatches || []).length > 0) {
      return {
        mode: 'name_partial',
        confidence: 'low',
        lookup_key: 'name',
        company_code_required: false,
        candidates: partialNameMatches as CompanyCandidate[],
      };
    }
  }

  return {
    mode: null,
    confidence: 'none',
    lookup_key: null,
    company_code_required: false,
    candidates: [] as CompanyCandidate[],
  };
}

async function findContactMatch(
  serviceSupabase: SupabaseClient,
  companyId: string,
  parsedData: Record<string, unknown>
) {
  const receivedFromName = pickString(parsedData, [
    'received_from_name',
    'manager_name',
    'contact_name',
    'client_contact_name',
  ]);
  const receivedFromPhone = pickString(parsedData, [
    'received_from_phone',
    'manager_phone',
    'contact_phone',
    'client_contact_phone',
  ]);
  const receivedFromEmail = pickString(parsedData, [
    'received_from_email',
    'manager_email',
    'contact_email',
    'client_contact_email',
  ]);

  const { data } = await serviceSupabase
    .from('company_contacts')
    .select('id, first_name, last_name, position, phone, email')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  const contacts = (data || []) as ContactCandidate[];
  const normalizedPhone = normalizeDigits(receivedFromPhone);
  const normalizedEmail = normalizeComparableText(receivedFromEmail);
  const normalizedName = normalizeComparableText(receivedFromName);

  const byPhone = normalizedPhone
    ? contacts.find(
        (contact) => normalizeDigits(contact.phone) === normalizedPhone
      )
    : null;

  if (byPhone) {
    return {
      mode: 'phone',
      confidence: 'high',
      match: byPhone,
      should_create_new_contact: false,
    };
  }

  const byEmail = normalizedEmail
    ? contacts.find(
        (contact) => normalizeComparableText(contact.email) === normalizedEmail
      )
    : null;

  if (byEmail) {
    return {
      mode: 'email',
      confidence: 'high',
      match: byEmail,
      should_create_new_contact: false,
    };
  }

  const byName = normalizedName
    ? contacts.find(
        (contact) => normalizeComparableText(formatContactName(contact)) === normalizedName
      )
    : null;

  if (byName) {
    return {
      mode: 'name',
      confidence: 'medium',
      match: byName,
      should_create_new_contact: false,
    };
  }

  return {
    mode: null,
    confidence: 'none',
    match: null,
    should_create_new_contact: !!(receivedFromName || receivedFromPhone || receivedFromEmail),
  };
}

export function extractParsedOrderImportData(parsedJson: unknown) {
  const source =
    parsedJson && typeof parsedJson === 'object'
      ? (parsedJson as Record<string, unknown>)
      : {};

  const receivedFromName = pickString(source, [
    'received_from_name',
    'manager_name',
    'contact_name',
    'client_contact_name',
  ]);
  const receivedFromPhone = pickString(source, [
    'received_from_phone',
    'manager_phone',
    'contact_phone',
    'client_contact_phone',
  ]);
  const receivedFromEmail = pickString(source, [
    'received_from_email',
    'manager_email',
    'contact_email',
    'client_contact_email',
  ]);
  const detectedFlags = detectOrderCargoFlagsFromValues(
    Object.values(source).flatMap((value) => (typeof value === 'string' ? [value] : []))
  );
  const extractedFlags: OrderCargoFlags = {
    has_ex1: pickBoolean(source, ['has_ex1', 'cargo_has_ex1']) ?? detectedFlags.has_ex1,
    has_t1: pickBoolean(source, ['has_t1', 'cargo_has_t1']) ?? detectedFlags.has_t1,
    has_adr: pickBoolean(source, ['has_adr', 'cargo_has_adr']) ?? detectedFlags.has_adr,
    has_sent: pickBoolean(source, ['has_sent', 'cargo_has_sent']) ?? detectedFlags.has_sent,
  };
  const explicitVatRate = parseOrderVatRate(
    pickString(source, ['vat_rate', 'vat', 'pvm'])
  );
  const loadingCity = pickString(source, ['loading_city']);
  const loadingPostalCode = pickString(source, ['loading_postal_code']);
  const loadingCountry = pickString(source, ['loading_country']);
  const unloadingCity = pickString(source, ['unloading_city']);
  const unloadingPostalCode = pickString(source, ['unloading_postal_code']);
  const unloadingCountry = pickString(source, ['unloading_country']);
  const shipperName = pickString(source, ['shipper_name']);
  const consigneeName = pickString(source, ['consignee_name']);

  return {
    client_order_number: pickString(source, [
      'client_order_number',
      'order_number',
      'customer_order_number',
      'po_number',
    ]),
    client_company_name: pickString(source, [
      'client_company_name',
      'company_name',
      'client_name',
      'customer_name',
    ]),
    client_company_code: pickString(source, [
      'client_company_code',
      'company_code',
      'customer_code',
    ]),
    client_vat_code: pickString(source, [
      'client_vat_code',
      'vat_code',
      'company_vat_code',
    ]),
    client_country: pickString(source, [
      'client_country',
      'company_country',
      'country',
    ]),
    client_city: pickString(source, [
      'client_city',
      'company_city',
      'city',
    ]),
    client_postal_code: pickString(source, [
      'client_postal_code',
      'company_postal_code',
      'postal_code',
    ]),
    client_address: pickString(source, [
      'client_address',
      'company_address',
      'address',
    ]),
    client_phone: pickString(source, [
      'client_phone',
      'company_phone',
      'phone',
    ]),
    client_email: pickString(source, [
      'client_email',
      'company_email',
      'email',
    ]),
    received_from_name: receivedFromName,
    received_from_phone: receivedFromPhone,
    received_from_email: receivedFromEmail,
    loading_date: pickString(source, ['loading_date']),
    loading_time_from: pickString(source, ['loading_time_from', 'loading_time']),
    loading_time_to: pickString(source, ['loading_time_to']),
    loading_address: extractStreetAddress({
      rawAddress: pickString(source, ['loading_address']),
      partyName: shipperName,
      city: loadingCity,
      postalCode: loadingPostalCode,
      country: loadingCountry,
    }),
    loading_city: loadingCity,
    loading_postal_code: loadingPostalCode,
    loading_country: loadingCountry,
    loading_contact: pickString(source, ['loading_contact']),
    loading_reference: pickString(source, ['loading_reference']),
    loading_customs_info: pickString(source, ['loading_customs_info']),
    unloading_date: pickString(source, ['unloading_date']),
    unloading_time_from: pickString(source, ['unloading_time_from', 'unloading_time']),
    unloading_time_to: pickString(source, ['unloading_time_to']),
    unloading_address: extractStreetAddress({
      rawAddress: pickString(source, ['unloading_address']),
      partyName: consigneeName,
      city: unloadingCity,
      postalCode: unloadingPostalCode,
      country: unloadingCountry,
    }),
    unloading_city: unloadingCity,
    unloading_postal_code: unloadingPostalCode,
    unloading_country: unloadingCountry,
    unloading_contact: pickString(source, ['unloading_contact']),
    unloading_reference: pickString(source, ['unloading_reference']),
    unloading_customs_info: pickString(source, ['unloading_customs_info']),
    shipper_name: shipperName,
    consignee_name: consigneeName,
    cargo_dimensions: pickString(source, [
      'cargo_dimensions',
      'dimensions',
      'cargo_size',
    ]),
    cargo_description: buildCargoDescriptionWithDimensions({
      cargoDescription: pickString(source, ['cargo_description', 'cargo_text']),
      cargoDimensions: pickString(source, [
        'cargo_dimensions',
        'dimensions',
        'cargo_size',
      ]),
    }),
    cargo_quantity: pickString(source, ['cargo_quantity']),
    cargo_kg: pickNumber(source, ['cargo_kg']),
    cargo_ldm: pickNumber(source, ['cargo_ldm']),
    load_type:
      parseOrderLoadType(pickString(source, ['load_type', 'cargo_type', 'transport_type'])) ??
      resolveOrderLoadType({
        explicitLoadType: pickString(source, ['load_type', 'cargo_type', 'transport_type']),
        cargoLdm: pickNumber(source, ['cargo_ldm']),
        values: Object.values(source).flatMap((value) =>
          typeof value === 'string' ? [value] : []
        ),
      }),
    has_ex1: extractedFlags.has_ex1,
    has_t1: extractedFlags.has_t1,
    has_adr: extractedFlags.has_adr,
    has_sent: extractedFlags.has_sent,
    price: pickNumber(source, ['price', 'sell_price']),
    vat_rate: explicitVatRate,
    currency: pickString(source, ['currency']),
    payment_term_text: pickString(source, [
      'payment_term_text',
      'payment_terms',
      'payment_term',
      'payment_due',
    ]),
    payment_type: pickString(source, ['payment_type']),
    notes: pickString(source, ['notes', 'comments']),
    received_from_contact: joinUniqueContactValues([
      receivedFromPhone,
      receivedFromEmail,
      pickString(source, ['client_phone', 'company_phone', 'phone']),
      pickString(source, ['client_email', 'company_email', 'email']),
    ]),
  };
}

export async function buildOrderImportMatchResult(
  serviceSupabase: SupabaseClient,
  organizationId: string,
  parsedJson: unknown
) {
  const normalized = extractParsedOrderImportData(parsedJson);
  const companySearch = await findCompanyCandidates(
    serviceSupabase,
    organizationId,
    normalized as unknown as Record<string, unknown>
  );
  const primaryCompany = companySearch.candidates[0] ?? null;

  const contactSearch = primaryCompany
    ? await findContactMatch(
        serviceSupabase,
        primaryCompany.id,
        normalized as unknown as Record<string, unknown>
      )
    : {
        mode: null,
        confidence: 'none',
        match: null,
        should_create_new_contact: false,
      };

  const contactNameParts = splitPersonName(normalized.received_from_name);
  const resolvedFlags: OrderCargoFlags = {
    ...EMPTY_ORDER_CARGO_FLAGS,
    has_ex1: !!normalized.has_ex1,
    has_t1: !!normalized.has_t1,
    has_adr: !!normalized.has_adr,
    has_sent: !!normalized.has_sent,
  };
  const resolvedLoadType = resolveOrderLoadType({
    explicitLoadType: normalized.load_type,
    cargoLdm: normalized.cargo_ldm,
    values: [
      normalized.cargo_description,
      normalized.notes,
      normalized.loading_customs_info,
      normalized.unloading_customs_info,
      normalized.loading_reference,
      normalized.unloading_reference,
    ],
  });
  const resolvedVatRate = resolveOrderVatRate({
    explicitVatRate: normalized.vat_rate,
    clientCountry: primaryCompany?.country || normalized.client_country,
    flags: resolvedFlags,
    customsValues: [
      normalized.loading_customs_info,
      normalized.unloading_customs_info,
      normalized.loading_reference,
      normalized.unloading_reference,
      normalized.notes,
      normalized.cargo_description,
    ],
  });
  const needsCompanyCreateConfirmation =
    !primaryCompany &&
    !!normalized.client_company_name &&
    (
      !!normalized.client_company_code ||
      companySearch.lookup_key === 'name' ||
      companySearch.lookup_key === 'vat_code'
    );

  return {
    summary: {
      company_found: !!primaryCompany,
      contact_found: !!contactSearch.match,
      should_create_company: !primaryCompany && !!normalized.client_company_name,
      needs_company_create_confirmation: needsCompanyCreateConfirmation,
      should_create_contact:
        !!primaryCompany &&
        !contactSearch.match &&
        contactSearch.should_create_new_contact,
      ready_for_review: true,
    },
    company_match: {
      mode: companySearch.mode,
      confidence: companySearch.confidence,
      lookup_key: companySearch.lookup_key,
      company_code_required: companySearch.company_code_required,
      primary: primaryCompany,
      candidates: companySearch.candidates,
    },
    contact_match: {
      mode: contactSearch.mode,
      confidence: contactSearch.confidence,
      match: contactSearch.match,
    },
    suggested_company_create: primaryCompany
      ? null
      : {
          company_code: normalized.client_company_code,
          name: normalized.client_company_name,
          vat_code: normalized.client_vat_code,
          country: normalized.client_country,
          postal_code: normalized.client_postal_code,
          city: normalized.client_city,
          address: normalized.client_address,
          phone: normalized.client_phone,
          email: normalized.client_email,
          is_client: true,
        },
    ui_actions: {
      show_company_create_confirm: needsCompanyCreateConfirmation,
      company_create_confirm_title: 'Add new company?',
      company_create_confirm_message:
        normalized.client_company_code
          ? `Company with code ${normalized.client_company_code} was not found. Add a new client company?`
          : normalized.client_company_name
            ? `Company "${normalized.client_company_name}" was not found. Add a new client company?`
            : null,
    },
    suggested_contact_create:
      primaryCompany &&
      !contactSearch.match &&
      contactSearch.should_create_new_contact
        ? {
            first_name: contactNameParts.first_name,
            last_name: contactNameParts.last_name,
            phone: normalized.received_from_phone,
            email: normalized.received_from_email,
          }
        : null,
    suggested_order_prefill: {
      client_order_number: normalized.client_order_number,
      client_company_id: primaryCompany?.id ?? null,
      received_from_name:
        contactSearch.match ? formatContactName(contactSearch.match) : normalized.received_from_name,
      received_from_contact:
        contactSearch.match
          ? [contactSearch.match.phone, contactSearch.match.email]
              .filter(Boolean)
              .join(' | ') || null
          : normalized.received_from_contact,
      loading_date: normalized.loading_date,
      loading_time_from: normalized.loading_time_from,
      loading_time_to: normalized.loading_time_to,
      loading_address: normalized.loading_address,
      loading_city: normalized.loading_city,
      loading_postal_code: normalized.loading_postal_code,
      loading_country: normalized.loading_country,
      loading_contact: normalized.loading_contact,
      loading_reference: normalized.loading_reference,
      loading_customs_info: normalized.loading_customs_info,
      unloading_date: normalized.unloading_date,
      unloading_time_from: normalized.unloading_time_from,
      unloading_time_to: normalized.unloading_time_to,
      unloading_address: normalized.unloading_address,
      unloading_city: normalized.unloading_city,
      unloading_postal_code: normalized.unloading_postal_code,
      unloading_country: normalized.unloading_country,
      unloading_contact: normalized.unloading_contact,
      unloading_reference: normalized.unloading_reference,
      unloading_customs_info: normalized.unloading_customs_info,
      shipper_name: normalized.shipper_name,
      consignee_name: normalized.consignee_name,
      cargo_description: normalized.cargo_description,
      cargo_quantity: normalized.cargo_quantity,
      cargo_kg: normalized.cargo_kg,
      cargo_ldm: normalized.cargo_ldm,
      load_type: resolvedLoadType,
      has_ex1: resolvedFlags.has_ex1,
      has_t1: resolvedFlags.has_t1,
      has_adr: resolvedFlags.has_adr,
      has_sent: resolvedFlags.has_sent,
      price: normalized.price,
      vat_rate: resolvedVatRate,
      currency: normalized.currency,
      payment_term_text: normalized.payment_term_text,
      payment_type: normalized.payment_type,
      notes: normalized.notes,
    },
  };
}
