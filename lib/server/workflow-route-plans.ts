type ServiceSupabase = any;

export type WorkflowCollectionMode = 'not_set' | 'direct' | 'collection_trip';
export type WorkflowReloadingMode = 'not_set' | 'no_reloading' | 'reloading';
export type WorkflowDistributionMode = 'not_set' | 'direct' | 'distribution_trip';

export type WorkflowRoutePlanRow = {
  id: string;
  organization_id: string;
  order_id: string;
  collection_mode: WorkflowCollectionMode;
  reloading_mode: WorkflowReloadingMode;
  distribution_mode: WorkflowDistributionMode;
  post_international_reloading_mode: WorkflowReloadingMode;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

export function isWorkflowCollectionMode(value: unknown): value is WorkflowCollectionMode {
  return value === 'not_set' || value === 'direct' || value === 'collection_trip';
}

export function isWorkflowReloadingMode(value: unknown): value is WorkflowReloadingMode {
  return value === 'not_set' || value === 'no_reloading' || value === 'reloading';
}

export function isWorkflowDistributionMode(value: unknown): value is WorkflowDistributionMode {
  return value === 'not_set' || value === 'direct' || value === 'distribution_trip';
}

export function buildDerivedWorkflowRoutePlan(params: {
  linkedTripId?: string | null;
  cargoLegs?: Array<{
    leg_order: number | null;
    leg_type: string;
  }>;
}) {
  const cargoLegs = (params.cargoLegs || [])
    .filter(
      (value): value is { leg_order: number | null; leg_type: string } =>
        !!value && typeof value.leg_type === 'string' && value.leg_type.trim() !== ''
    )
    .map((value) => ({
      leg_order:
        typeof value.leg_order === 'number' && Number.isFinite(value.leg_order)
          ? value.leg_order
          : Number.MAX_SAFE_INTEGER,
      leg_type: value.leg_type.trim(),
    }))
    .sort((left, right) => left.leg_order - right.leg_order);

  const legTypes = new Set(cargoLegs.map((value) => value.leg_type));

  const hasLinkedTrip = !!params.linkedTripId;
  const hasCollectionLeg = legTypes.has('collection');
  const hasDeliveryLeg = legTypes.has('delivery');
  const internationalTripIndex = cargoLegs.findIndex(
    (value) => value.leg_type === 'international_trip'
  );
  const reloadingIndexes = cargoLegs
    .map((value, index) => (value.leg_type === 'reloading' ? index : -1))
    .filter((value) => value >= 0);
  const hasReloadingBeforeInternational =
    internationalTripIndex >= 0
      ? reloadingIndexes.some((index) => index < internationalTripIndex)
      : reloadingIndexes.length > 0 && !hasDeliveryLeg;
  const hasReloadingAfterInternational =
    internationalTripIndex >= 0
      ? reloadingIndexes.some((index) => index > internationalTripIndex)
      : reloadingIndexes.length > 0 && hasDeliveryLeg;

  const collectionMode: WorkflowCollectionMode = hasCollectionLeg
    ? 'collection_trip'
    : hasLinkedTrip
      ? 'direct'
      : 'not_set';

  const reloadingMode: WorkflowReloadingMode = hasReloadingBeforeInternational
    ? 'reloading'
    : hasLinkedTrip
      ? 'no_reloading'
      : 'not_set';

  const distributionMode: WorkflowDistributionMode = hasDeliveryLeg
    ? 'distribution_trip'
    : hasLinkedTrip
      ? 'direct'
      : 'not_set';

  const postInternationalReloadingMode: WorkflowReloadingMode = hasReloadingAfterInternational
    ? 'reloading'
    : hasLinkedTrip
      ? 'no_reloading'
      : 'not_set';

  return {
    collection_mode: collectionMode,
    reloading_mode: reloadingMode,
    distribution_mode: distributionMode,
    post_international_reloading_mode: postInternationalReloadingMode,
  };
}

export function mergeWorkflowRoutePlan(params: {
  storedPlan?: WorkflowRoutePlanRow | null;
  derivedPlan: {
    collection_mode: WorkflowCollectionMode;
    reloading_mode: WorkflowReloadingMode;
    distribution_mode: WorkflowDistributionMode;
    post_international_reloading_mode: WorkflowReloadingMode;
  };
  linkedTripId?: string | null;
  linkedTripNumber?: string | null;
  linkedTripIsGroupage?: boolean | null;
}) {
  const collectionMode =
    params.storedPlan?.collection_mode || params.derivedPlan.collection_mode;
  const reloadingMode =
    params.storedPlan?.reloading_mode || params.derivedPlan.reloading_mode;
  const distributionMode =
    params.storedPlan?.distribution_mode || params.derivedPlan.distribution_mode;
  const postInternationalReloadingMode =
    params.storedPlan?.post_international_reloading_mode ||
    params.derivedPlan.post_international_reloading_mode;
  const setupNeeded =
    !!params.linkedTripId &&
    params.linkedTripIsGroupage === true &&
    (
      collectionMode === 'not_set' ||
      reloadingMode === 'not_set' ||
      distributionMode === 'not_set' ||
      postInternationalReloadingMode === 'not_set'
    );

  return {
    collection_mode: collectionMode,
    reloading_mode: reloadingMode,
    distribution_mode: distributionMode,
    post_international_reloading_mode: postInternationalReloadingMode,
    international_trip_id: params.linkedTripId ?? null,
    international_trip_number: params.linkedTripNumber ?? null,
    setup_status: setupNeeded ? 'setup_needed' : 'ready',
  };
}

export async function loadWorkflowRoutePlans(
  serviceSupabase: ServiceSupabase,
  orderIds: string[]
) {
  if (orderIds.length === 0) {
    return new Map<string, WorkflowRoutePlanRow>();
  }

  const { data, error } = await serviceSupabase
    .from('workflow_route_plans')
    .select(
      'id, organization_id, order_id, collection_mode, reloading_mode, distribution_mode, post_international_reloading_mode, created_by, updated_by, created_at, updated_at'
    )
    .in('order_id', orderIds);

  if (error) {
    throw new Error(error.message);
  }

  const result = new Map<string, WorkflowRoutePlanRow>();

  for (const row of data || []) {
    if (
      !row?.id ||
      !row?.organization_id ||
      !row?.order_id ||
      !row?.created_by ||
      !row?.updated_by ||
      !isWorkflowCollectionMode(row.collection_mode) ||
      !isWorkflowReloadingMode(row.reloading_mode) ||
      !isWorkflowDistributionMode(row.distribution_mode) ||
      !isWorkflowReloadingMode(row.post_international_reloading_mode)
    ) {
      continue;
    }

    result.set(row.order_id, {
      id: row.id,
      organization_id: row.organization_id,
      order_id: row.order_id,
      collection_mode: row.collection_mode,
      reloading_mode: row.reloading_mode,
      distribution_mode: row.distribution_mode,
      post_international_reloading_mode: row.post_international_reloading_mode,
      created_by: row.created_by,
      updated_by: row.updated_by,
      created_at:
        typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
      updated_at:
        typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
    });
  }

  return result;
}

export async function upsertWorkflowRoutePlan(
  serviceSupabase: ServiceSupabase,
  params: {
    organizationId: string;
    orderId: string;
    collectionMode: WorkflowCollectionMode;
    reloadingMode: WorkflowReloadingMode;
    distributionMode: WorkflowDistributionMode;
    postInternationalReloadingMode: WorkflowReloadingMode;
    userId: string;
  }
) {
  const { data: existing, error: existingError } = await serviceSupabase
    .from('workflow_route_plans')
    .select(
      'id, organization_id, order_id, collection_mode, reloading_mode, distribution_mode, post_international_reloading_mode, created_by, updated_by, created_at, updated_at'
    )
    .eq('order_id', params.orderId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing?.id) {
    const { data, error } = await serviceSupabase
      .from('workflow_route_plans')
      .update({
        collection_mode: params.collectionMode,
        reloading_mode: params.reloadingMode,
        distribution_mode: params.distributionMode,
        post_international_reloading_mode: params.postInternationalReloadingMode,
        updated_by: params.userId,
      })
      .eq('id', existing.id)
      .select(
        'id, organization_id, order_id, collection_mode, reloading_mode, distribution_mode, post_international_reloading_mode, created_by, updated_by, created_at, updated_at'
      )
      .single();

    if (error || !data?.id) {
      throw new Error(error?.message || 'Failed to update workflow route plan');
    }

    return data as WorkflowRoutePlanRow;
  }

  const { data, error } = await serviceSupabase
    .from('workflow_route_plans')
    .insert({
      organization_id: params.organizationId,
      order_id: params.orderId,
      collection_mode: params.collectionMode,
      reloading_mode: params.reloadingMode,
      distribution_mode: params.distributionMode,
      post_international_reloading_mode: params.postInternationalReloadingMode,
      created_by: params.userId,
      updated_by: params.userId,
    })
    .select(
      'id, organization_id, order_id, collection_mode, reloading_mode, distribution_mode, post_international_reloading_mode, created_by, updated_by, created_at, updated_at'
    )
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message || 'Failed to create workflow route plan');
  }

  return data as WorkflowRoutePlanRow;
}
