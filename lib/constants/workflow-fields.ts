export const WORKFLOW_RECORD_TYPES = ['order', 'trip'] as const;

export type WorkflowRecordType = (typeof WORKFLOW_RECORD_TYPES)[number];

export const WORKFLOW_EDITABLE_FIELD_KEYS = [
  'contact',
  'sender',
  'loading',
  'loading_customs',
  'receiver',
  'unloading',
  'unloading_customs',
  'cargo',
  'kg',
  'ldm',
  'revenue',
  'cost',
  'profit',
  'trip_vehicle',
] as const;

export type WorkflowEditableFieldKey =
  (typeof WORKFLOW_EDITABLE_FIELD_KEYS)[number];

export const WORKFLOW_FIELD_LABELS: Record<
  WorkflowEditableFieldKey,
  string
> = {
  contact: 'Contact',
  sender: 'Sender',
  loading: 'Loading',
  loading_customs: 'Loading customs',
  receiver: 'Receiver',
  unloading: 'Unloading',
  unloading_customs: 'Unloading customs',
  cargo: 'Cargo',
  kg: 'KG',
  ldm: 'LDM',
  revenue: 'Revenue',
  cost: 'Cost',
  profit: 'Profit',
  trip_vehicle: 'Trip / Vehicle',
};

export const WORKFLOW_TRIP_CREATOR_ONLY_FIELDS = new Set<WorkflowEditableFieldKey>([
  'cost',
  'trip_vehicle',
]);

export const WORKFLOW_NUMERIC_FIELDS = new Set<WorkflowEditableFieldKey>([
  'kg',
  'ldm',
  'revenue',
  'cost',
  'profit',
]);

export function isWorkflowRecordType(value: unknown): value is WorkflowRecordType {
  return (
    typeof value === 'string' &&
    (WORKFLOW_RECORD_TYPES as readonly string[]).includes(value)
  );
}

export function isWorkflowEditableFieldKey(
  value: unknown
): value is WorkflowEditableFieldKey {
  return (
    typeof value === 'string' &&
    (WORKFLOW_EDITABLE_FIELD_KEYS as readonly string[]).includes(value)
  );
}
