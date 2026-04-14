export const TRIP_SEGMENT_TYPES = [
  'collection',
  'reloading',
  'international_trip',
  'delivery',
] as const;

export type TripSegmentType = (typeof TRIP_SEGMENT_TYPES)[number];

export const TRIP_SEGMENT_TYPE_LABELS: Record<TripSegmentType, string> = {
  collection: 'Collection',
  reloading: 'Reloading',
  international_trip: 'International Trip',
  delivery: 'Delivery',
};
