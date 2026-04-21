export const WORKFLOW_RECORD_TYPES = ['order', 'trip'] as const;

export type WorkflowRecordType = (typeof WORKFLOW_RECORD_TYPES)[number];

export const WORKFLOW_EDITABLE_FIELD_KEYS = [
  'status',
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
  status: 'Status',
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

export const WORKFLOW_EXECUTION_STATUSES = [
  'active',
  'loaded_to_warehouse',
  'at_warehouse',
  'loaded_to_international_truck',
  'unloaded_in_warehouse',
  'delivered',
  'finished',
] as const;

export type WorkflowExecutionStatus =
  (typeof WORKFLOW_EXECUTION_STATUSES)[number];

export const WORKFLOW_EXECUTION_STATUS_LABELS: Record<
  WorkflowExecutionStatus,
  string
> = {
  active: 'Active',
  loaded_to_warehouse: 'Loaded to warehouse',
  at_warehouse: 'At warehouse',
  loaded_to_international_truck: 'Loaded to international truck',
  unloaded_in_warehouse: 'Unloaded in warehouse',
  delivered: 'Delivered',
  finished: 'Finished',
};

export function isWorkflowExecutionStatus(
  value: unknown
): value is WorkflowExecutionStatus {
  return (
    typeof value === 'string' &&
    (WORKFLOW_EXECUTION_STATUSES as readonly string[]).includes(value)
  );
}

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
