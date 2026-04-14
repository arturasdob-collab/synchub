export const ORDER_VAT_RATES = [0, 21] as const;
export const ORDER_LOAD_TYPES = ['LTL', 'FTL'] as const;

export type OrderVatRate = (typeof ORDER_VAT_RATES)[number];
export type OrderLoadType = (typeof ORDER_LOAD_TYPES)[number];

export type OrderCargoFlags = {
  has_ex1: boolean;
  has_t1: boolean;
  has_adr: boolean;
  has_sent: boolean;
};

export const EMPTY_ORDER_CARGO_FLAGS: OrderCargoFlags = {
  has_ex1: false,
  has_t1: false,
  has_adr: false,
  has_sent: false,
};

const FLAG_PATTERNS: Record<keyof OrderCargoFlags, RegExp[]> = {
  has_ex1: [
    /\bex1\b/i,
    /\bexport declaration\b/i,
    /\beksporto deklar/i,
    /\bmrn\b/i,
  ],
  has_t1: [
    /\bt1\b/i,
    /\btransit declaration\b/i,
    /\btransit document\b/i,
    /\bcommon transit\b/i,
    /\btranzit/i,
  ],
  has_adr: [
    /\badr\b/i,
    /\bdangerous goods\b/i,
    /\bhazmat\b/i,
    /\bhazardous cargo\b/i,
  ],
  has_sent: [
    /\be-?sent\b/i,
    /\bsent nr\b/i,
    /\bsent number\b/i,
    /\bsent id\b/i,
    /\bsystem sent\b/i,
    /\bpl sent\b/i,
  ],
};

const CUSTOMS_PATTERNS = [
  /\bcustoms?\b/i,
  /\bmuitin/i,
  /\bcelna\b/i,
  /\bbroker\b/i,
  /\bmrn\b/i,
];

const LOAD_TYPE_PATTERNS: Record<OrderLoadType, RegExp[]> = {
  LTL: [
    /\bltl\b/i,
    /\bless than truck load\b/i,
    /\bpartial load\b/i,
    /\bpart load\b/i,
    /\bgroupage\b/i,
    /\bdalinis\b/i,
  ],
  FTL: [
    /\bftl\b/i,
    /\bfull truck load\b/i,
    /\bfull load\b/i,
    /\bfull truck\b/i,
    /\bpilnas\b/i,
  ],
};

function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function parseOrderVatRate(value: unknown): OrderVatRate | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return ORDER_VAT_RATES.includes(value as OrderVatRate)
      ? (value as OrderVatRate)
      : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const digits = value.replace(/[^\d]/g, '');

  if (digits === '0') return 0;
  if (digits === '21') return 21;

  return null;
}

export function parseOrderLoadType(value: unknown): OrderLoadType | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = normalizeSearchText(value).toUpperCase();

  if (!trimmed) {
    return null;
  }

  if (trimmed === 'LTL') return 'LTL';
  if (trimmed === 'FTL') return 'FTL';

  if (LOAD_TYPE_PATTERNS.FTL.some((pattern) => pattern.test(trimmed))) {
    return 'FTL';
  }

  if (LOAD_TYPE_PATTERNS.LTL.some((pattern) => pattern.test(trimmed))) {
    return 'LTL';
  }

  return null;
}

export function isLithuanianCountry(value: string | null | undefined) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return false;
  }

  const lower = normalizeSearchText(normalized).toLowerCase();

  return (
    lower === 'lt' ||
    lower === 'lithuania' ||
    lower === 'lietuva' ||
    lower === 'lietuvos respublika' ||
    lower.includes('lithuan') ||
    lower.includes('lietu')
  );
}

export function detectOrderCargoFlagsFromValues(
  values: Array<string | null | undefined>
): OrderCargoFlags {
  const haystack = normalizeSearchText(
    values.filter((value): value is string => typeof value === 'string').join(' ')
  );

  if (!haystack) {
    return { ...EMPTY_ORDER_CARGO_FLAGS };
  }

  return {
    has_ex1: FLAG_PATTERNS.has_ex1.some((pattern) => pattern.test(haystack)),
    has_t1: FLAG_PATTERNS.has_t1.some((pattern) => pattern.test(haystack)),
    has_adr: FLAG_PATTERNS.has_adr.some((pattern) => pattern.test(haystack)),
    has_sent: FLAG_PATTERNS.has_sent.some((pattern) => pattern.test(haystack)),
  };
}

export function detectOrderLoadTypeFromValues(
  values: Array<string | null | undefined>
): OrderLoadType | null {
  const haystack = normalizeSearchText(
    values.filter((value): value is string => typeof value === 'string').join(' ')
  );

  if (!haystack) {
    return null;
  }

  if (LOAD_TYPE_PATTERNS.FTL.some((pattern) => pattern.test(haystack))) {
    return 'FTL';
  }

  if (LOAD_TYPE_PATTERNS.LTL.some((pattern) => pattern.test(haystack))) {
    return 'LTL';
  }

  return null;
}

export function hasOrderCustomsContext(
  values: Array<string | null | undefined>,
  flags: OrderCargoFlags
) {
  if (flags.has_ex1 || flags.has_t1) {
    return true;
  }

  const haystack = normalizeSearchText(
    values.filter((value): value is string => typeof value === 'string').join(' ')
  );

  if (!haystack) {
    return false;
  }

  return CUSTOMS_PATTERNS.some((pattern) => pattern.test(haystack));
}

export function resolveOrderVatRate(params: {
  explicitVatRate?: OrderVatRate | null;
  clientCountry?: string | null;
  flags?: Partial<OrderCargoFlags> | null;
  customsValues?: Array<string | null | undefined>;
}) {
  if (params.explicitVatRate !== null && params.explicitVatRate !== undefined) {
    return params.explicitVatRate;
  }

  const flags: OrderCargoFlags = {
    ...EMPTY_ORDER_CARGO_FLAGS,
    ...(params.flags || {}),
  };

  if (hasOrderCustomsContext(params.customsValues || [], flags)) {
    return 0;
  }

  if (params.clientCountry && !isLithuanianCountry(params.clientCountry)) {
    return 0;
  }

  return 21;
}

export function resolveOrderLoadType(params: {
  explicitLoadType?: unknown;
  cargoLdm?: number | null;
  values?: Array<string | null | undefined>;
}) {
  const explicitLoadType = parseOrderLoadType(params.explicitLoadType);

  if (explicitLoadType) {
    return explicitLoadType;
  }

  const detectedLoadType = detectOrderLoadTypeFromValues(params.values || []);

  if (detectedLoadType) {
    return detectedLoadType;
  }

  if (
    typeof params.cargoLdm === 'number' &&
    Number.isFinite(params.cargoLdm) &&
    params.cargoLdm >= 0
  ) {
    return params.cargoLdm >= 13.6 ? 'FTL' : 'LTL';
  }

  return null;
}
