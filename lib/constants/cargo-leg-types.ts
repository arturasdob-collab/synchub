export const CARGO_LEG_TYPES = [
  'collection',
  'reloading',
  'international_trip',
  'delivery',
] as const;

export type CargoLegType = (typeof CARGO_LEG_TYPES)[number];

export const CARGO_LEG_TYPE_LABELS: Record<CargoLegType, string> = {
  collection: 'Collection',
  reloading: 'Reloading',
  international_trip: 'International Trip',
  delivery: 'Delivery',
};
