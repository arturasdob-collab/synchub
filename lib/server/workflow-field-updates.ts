import {
  isWorkflowEditableFieldKey,
  isWorkflowRecordType,
  type WorkflowEditableFieldKey,
  type WorkflowRecordType,
} from '@/lib/constants/workflow-fields';

type ServiceSupabase = any;

export type WorkflowFieldUpdateRow = {
  id: string;
  organization_id: string;
  record_type: WorkflowRecordType;
  record_id: string;
  field_key: WorkflowEditableFieldKey;
  value_text: string | null;
  updated_by: string;
  revision: number;
  created_at: string;
  updated_at: string;
};

export type WorkflowFieldReceiptRow = {
  field_update_id: string;
  user_id: string;
  seen_revision: number;
  acknowledged_at: string;
  created_at: string;
};

export function buildWorkflowFieldCompositeKey(params: {
  recordType: WorkflowRecordType;
  recordId: string;
  fieldKey: WorkflowEditableFieldKey;
}) {
  return `${params.recordType}:${params.recordId}:${params.fieldKey}`;
}

export async function loadWorkflowFieldUpdates(
  serviceSupabase: ServiceSupabase,
  params: {
    recordType: WorkflowRecordType;
    recordIds: string[];
  }
) {
  if (params.recordIds.length === 0) {
    return new Map<string, WorkflowFieldUpdateRow>();
  }

  const { data, error } = await serviceSupabase
    .from('workflow_field_updates')
    .select(
      'id, organization_id, record_type, record_id, field_key, value_text, updated_by, revision, created_at, updated_at'
    )
    .eq('record_type', params.recordType)
    .in('record_id', params.recordIds);

  if (error) {
    throw new Error(error.message);
  }

  const result = new Map<string, WorkflowFieldUpdateRow>();

  for (const row of data || []) {
    if (
      !row?.id ||
      !row?.organization_id ||
      !row?.record_id ||
      !row?.updated_by ||
      !isWorkflowRecordType(row.record_type) ||
      !isWorkflowEditableFieldKey(row.field_key)
    ) {
      continue;
    }

    result.set(
      buildWorkflowFieldCompositeKey({
        recordType: row.record_type,
        recordId: row.record_id,
        fieldKey: row.field_key,
      }),
      {
        id: row.id,
        organization_id: row.organization_id,
        record_type: row.record_type,
        record_id: row.record_id,
        field_key: row.field_key,
        value_text: typeof row.value_text === 'string' ? row.value_text : null,
        updated_by: row.updated_by,
        revision:
          typeof row.revision === 'number' && Number.isInteger(row.revision)
            ? row.revision
            : 1,
        created_at:
          typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
        updated_at:
          typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
      }
    );
  }

  return result;
}

export async function loadWorkflowFieldReceiptsForUser(
  serviceSupabase: ServiceSupabase,
  params: {
    fieldUpdateIds: string[];
    userId: string;
  }
) {
  if (params.fieldUpdateIds.length === 0) {
    return new Map<string, WorkflowFieldReceiptRow>();
  }

  const { data, error } = await serviceSupabase
    .from('workflow_field_update_receipts')
    .select('field_update_id, user_id, seen_revision, acknowledged_at, created_at')
    .eq('user_id', params.userId)
    .in('field_update_id', params.fieldUpdateIds);

  if (error) {
    throw new Error(error.message);
  }

  const result = new Map<string, WorkflowFieldReceiptRow>();

  for (const row of data || []) {
    if (!row?.field_update_id || !row?.user_id) {
      continue;
    }

    result.set(row.field_update_id, {
      field_update_id: row.field_update_id,
      user_id: row.user_id,
      seen_revision:
        typeof row.seen_revision === 'number' && Number.isInteger(row.seen_revision)
          ? row.seen_revision
          : 0,
      acknowledged_at:
        typeof row.acknowledged_at === 'string'
          ? row.acknowledged_at
          : new Date().toISOString(),
      created_at:
        typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    });
  }

  return result;
}

function normalizeWorkflowFieldValue(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string') {
    return `${value}`;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export async function loadSingleWorkflowFieldUpdate(
  serviceSupabase: ServiceSupabase,
  params: {
    recordType: WorkflowRecordType;
    recordId: string;
    fieldKey: WorkflowEditableFieldKey;
  }
) {
  const { data, error } = await serviceSupabase
    .from('workflow_field_updates')
    .select(
      'id, organization_id, record_type, record_id, field_key, value_text, updated_by, revision, created_at, updated_at'
    )
    .eq('record_type', params.recordType)
    .eq('record_id', params.recordId)
    .eq('field_key', params.fieldKey)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (
    !data?.id ||
    !data?.organization_id ||
    !data?.record_id ||
    !data?.updated_by ||
    !isWorkflowRecordType(data.record_type) ||
    !isWorkflowEditableFieldKey(data.field_key)
  ) {
    return null;
  }

  return {
    id: data.id,
    organization_id: data.organization_id,
    record_type: data.record_type,
    record_id: data.record_id,
    field_key: data.field_key,
    value_text: typeof data.value_text === 'string' ? data.value_text : null,
    updated_by: data.updated_by,
    revision:
      typeof data.revision === 'number' && Number.isInteger(data.revision)
        ? data.revision
        : 1,
    created_at:
      typeof data.created_at === 'string' ? data.created_at : new Date().toISOString(),
    updated_at:
      typeof data.updated_at === 'string' ? data.updated_at : new Date().toISOString(),
  } satisfies WorkflowFieldUpdateRow;
}

export async function upsertWorkflowFieldUpdate(
  serviceSupabase: ServiceSupabase,
  params: {
    organizationId: string;
    recordType: WorkflowRecordType;
    recordId: string;
    fieldKey: WorkflowEditableFieldKey;
    value: unknown;
    updatedBy: string;
  }
) {
  const normalizedValue = normalizeWorkflowFieldValue(params.value);
  const existing = await loadSingleWorkflowFieldUpdate(serviceSupabase, {
    recordType: params.recordType,
    recordId: params.recordId,
    fieldKey: params.fieldKey,
  });

  const payload = existing
    ? {
        value_text: normalizedValue,
        updated_by: params.updatedBy,
        revision: existing.revision + 1,
      }
    : {
        organization_id: params.organizationId,
        record_type: params.recordType,
        record_id: params.recordId,
        field_key: params.fieldKey,
        value_text: normalizedValue,
        updated_by: params.updatedBy,
        revision: 1,
      };

  const query = existing
    ? serviceSupabase
        .from('workflow_field_updates')
        .update(payload)
        .eq('id', existing.id)
    : serviceSupabase.from('workflow_field_updates').insert(payload);

  const { error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const saved = await loadSingleWorkflowFieldUpdate(serviceSupabase, {
    recordType: params.recordType,
    recordId: params.recordId,
    fieldKey: params.fieldKey,
  });

  if (!saved) {
    throw new Error('Failed to save workflow field update');
  }

  await acknowledgeWorkflowFieldUpdate(serviceSupabase, {
    fieldUpdateId: saved.id,
    userId: params.updatedBy,
    revision: saved.revision,
  });

  return saved;
}

export async function acknowledgeWorkflowFieldUpdate(
  serviceSupabase: ServiceSupabase,
  params: {
    fieldUpdateId: string;
    userId: string;
    revision: number;
  }
) {
  const { error } = await serviceSupabase
    .from('workflow_field_update_receipts')
    .upsert(
      {
        field_update_id: params.fieldUpdateId,
        user_id: params.userId,
        seen_revision: params.revision,
        acknowledged_at: new Date().toISOString(),
      },
      {
        onConflict: 'field_update_id,user_id',
      }
    );

  if (error) {
    throw new Error(error.message);
  }
}
