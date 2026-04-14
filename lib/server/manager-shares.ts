export const SHAREABLE_MANAGER_ROLES = ['OWNER', 'ADMIN', 'MANAGER'] as const;

type ServiceSupabase = any;

function normalizeManagerId(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeOrganizationId(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export async function validateShareableManager(
  serviceSupabase: ServiceSupabase,
  organizationId: string,
  managerUserId: unknown,
  sharedOrganizationId?: unknown
) {
  const normalizedManagerUserId = normalizeManagerId(managerUserId);
  const targetOrganizationId =
    normalizeOrganizationId(sharedOrganizationId) || organizationId;

  if (!normalizedManagerUserId) {
    return null;
  }

  const { data: manager, error } = await serviceSupabase
    .from('user_profiles')
    .select('id, first_name, last_name, email, role, disabled, organization_id')
    .eq('id', normalizedManagerUserId)
    .eq('organization_id', targetOrganizationId)
    .single();

  if (error || !manager) {
    throw new Error('Selected manager not found in selected organization');
  }

  if (manager.disabled) {
    throw new Error('Selected manager is disabled');
  }

  if (!SHAREABLE_MANAGER_ROLES.includes(manager.role)) {
    throw new Error('Selected user cannot be used as a manager');
  }

  return manager;
}

export async function replaceOrderManagerShare(
  serviceSupabase: ServiceSupabase,
  params: {
    organizationId: string;
    orderId: string;
    managerUserId: unknown;
    sharedOrganizationId?: unknown;
    sharedBy: string;
  }
) {
  const manager = await validateShareableManager(
    serviceSupabase,
    params.organizationId,
    params.managerUserId,
    params.sharedOrganizationId
  );

  if (!manager) {
    const { error } = await serviceSupabase
      .from('order_manager_shares')
      .delete()
      .eq('order_id', params.orderId)
      .eq('organization_id', params.organizationId);

    if (error) {
      throw new Error(error.message);
    }

    return null;
  }

  const { error } = await serviceSupabase.from('order_manager_shares').upsert(
    {
      organization_id: params.organizationId,
      shared_organization_id: manager.organization_id,
      order_id: params.orderId,
      manager_user_id: manager.id,
      shared_by: params.sharedBy,
    },
    {
      onConflict: 'order_id',
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  return manager;
}

export async function replaceTripManagerShare(
  serviceSupabase: ServiceSupabase,
  params: {
    organizationId: string;
    tripId: string;
    managerUserId: unknown;
    sharedOrganizationId?: unknown;
    sharedBy?: string | null;
  }
) {
  const manager = await validateShareableManager(
    serviceSupabase,
    params.organizationId,
    params.managerUserId,
    params.sharedOrganizationId
  );

  if (!manager) {
    const { error } = await serviceSupabase
      .from('trip_manager_shares')
      .delete()
      .eq('trip_id', params.tripId)
      .eq('organization_id', params.organizationId);

    if (error) {
      throw new Error(error.message);
    }

    return null;
  }

  const { error } = await serviceSupabase.from('trip_manager_shares').upsert(
    {
      organization_id: params.organizationId,
      shared_organization_id: manager.organization_id,
      trip_id: params.tripId,
      manager_user_id: manager.id,
      shared_by: params.sharedBy ?? null,
    },
    {
      onConflict: 'trip_id',
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  return manager;
}
