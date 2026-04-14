type ServiceSupabase = any;

type RecordWithIdAndCreator = {
  id: string;
  created_by: string | null;
};

async function loadSharedIdSet(
  serviceSupabase: ServiceSupabase,
  params: {
    table: 'order_manager_shares' | 'trip_manager_shares';
    idColumn: 'order_id' | 'trip_id';
    organizationId: string;
    userId: string;
  }
): Promise<Set<string>> {
  const { data, error } = await serviceSupabase
    .from(params.table)
    .select(params.idColumn)
    .eq('organization_id', params.organizationId)
    .eq('manager_user_id', params.userId);

  if (error) {
    throw new Error(error.message);
  }

  return new Set(
    (data || [])
      .map((item: Record<string, unknown>) => item[params.idColumn])
      .filter(
        (value: unknown): value is string =>
          typeof value === 'string' && value.trim() !== ''
      )
  );
}

export async function loadSharedOrderIdSet(
  serviceSupabase: ServiceSupabase,
  organizationId: string,
  userId: string
) {
  return loadSharedIdSet(serviceSupabase, {
    table: 'order_manager_shares',
    idColumn: 'order_id',
    organizationId,
    userId,
  });
}

export async function loadSharedTripIdSet(
  serviceSupabase: ServiceSupabase,
  organizationId: string,
  userId: string
) {
  return loadSharedIdSet(serviceSupabase, {
    table: 'trip_manager_shares',
    idColumn: 'trip_id',
    organizationId,
    userId,
  });
}

export function filterVisibleRecords<T extends RecordWithIdAndCreator>(
  records: T[],
  userId: string,
  sharedIdSet: Set<string>
) {
  return records.filter((record) => {
    return record.created_by === userId || sharedIdSet.has(record.id);
  });
}
