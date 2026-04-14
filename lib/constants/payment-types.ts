export const PAYMENT_TYPE_OPTIONS = [
  {
    value: 'bank_after_scan',
    label: 'Bank transfer after scan',
  },
  {
    value: 'bank_after_originals',
    label: 'Bank transfer after originals',
  },
  {
    value: 'cash',
    label: 'Cash',
  },
  {
    value: 'other',
    label: 'Other',
  },
] as const;

export type PaymentTypeValue = (typeof PAYMENT_TYPE_OPTIONS)[number]['value'];

export function formatPaymentTypeLabel(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  const matched = PAYMENT_TYPE_OPTIONS.find((option) => option.value === value);

  if (matched) {
    return matched.label;
  }

  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
