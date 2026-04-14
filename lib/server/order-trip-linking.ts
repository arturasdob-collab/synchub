type ServiceSupabase = any;

export type LinkingProfile = {
  organization_id: string | null;
  role: string | null;
  is_super_admin: boolean | null;
  is_creator: boolean | null;
};

export function isElevatedLinkingUser(profile: LinkingProfile | null | undefined) {
  if (!profile) return false;

  return (
    profile.is_super_admin === true ||
    profile.is_creator === true ||
    profile.role === 'OWNER' ||
    profile.role === 'ADMIN'
  );
}

export function canAccessLinkedRecord(params: {
  profile: LinkingProfile;
  currentUserId: string;
  createdBy: string | null;
  sharedManagerUserId: string | null;
}) {
  return (
    isElevatedLinkingUser(params.profile) ||
    params.createdBy === params.currentUserId ||
    params.sharedManagerUserId === params.currentUserId
  );
}

export async function loadCurrentLinkingProfile(
  serviceSupabase: ServiceSupabase,
  userId: string
) {
  const { data: profile, error } = await serviceSupabase
    .from('user_profiles')
    .select('organization_id, role, is_super_admin, is_creator')
    .eq('id', userId)
    .single();

  if (error || !profile?.organization_id) {
    throw new Error('User organization not found');
  }

  return profile as LinkingProfile;
}

export async function loadOrderLinkContext(
  serviceSupabase: ServiceSupabase,
  orderId: string
) {
  const [orderResponse, shareResponse] = await Promise.all([
    serviceSupabase
      .from('orders')
      .select('id, organization_id, created_by, status, internal_order_number')
      .eq('id', orderId)
      .single(),
    serviceSupabase
      .from('order_manager_shares')
      .select('manager_user_id, shared_organization_id')
      .eq('order_id', orderId)
      .maybeSingle(),
  ]);

  if (orderResponse.error || !orderResponse.data) {
    throw new Error('Order not found');
  }

  return {
    order: orderResponse.data as {
      id: string;
      organization_id: string;
      created_by: string | null;
      status: string | null;
      internal_order_number: string | null;
    },
    sharedManagerUserId: (shareResponse.data?.manager_user_id as string | null) ?? null,
    sharedOrganizationId:
      (shareResponse.data?.shared_organization_id as string | null) ?? null,
  };
}

export async function loadTripLinkContext(
  serviceSupabase: ServiceSupabase,
  tripId: string
) {
  const [tripResponse, shareResponse] = await Promise.all([
    serviceSupabase
      .from('trips')
      .select('id, organization_id, created_by, status, is_groupage, trip_number')
      .eq('id', tripId)
      .single(),
    serviceSupabase
      .from('trip_manager_shares')
      .select('manager_user_id, shared_organization_id')
      .eq('trip_id', tripId)
      .maybeSingle(),
  ]);

  if (tripResponse.error || !tripResponse.data) {
    throw new Error('Trip not found');
  }

  return {
    trip: tripResponse.data as {
      id: string;
      organization_id: string;
      created_by: string | null;
      status: string | null;
      is_groupage: boolean | null;
      trip_number: string | null;
    },
    sharedManagerUserId: (shareResponse.data?.manager_user_id as string | null) ?? null,
    sharedOrganizationId:
      (shareResponse.data?.shared_organization_id as string | null) ?? null,
  };
}

export async function syncOrderStatusFromLinks(
  serviceSupabase: ServiceSupabase,
  orderId: string,
  organizationId: string
) {
  const [{ count }, orderResponse] = await Promise.all([
    serviceSupabase
      .from('order_trip_links')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderId)
      .eq('organization_id', organizationId),
    serviceSupabase
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .eq('organization_id', organizationId)
      .single(),
  ]);

  if (orderResponse.error || !orderResponse.data) {
    throw new Error('Order not found');
  }

  const currentStatus = orderResponse.data.status as string | null;

  if ((count || 0) > 0) {
    if (currentStatus !== 'active' && currentStatus !== 'completed') {
      const { error } = await serviceSupabase
        .from('orders')
        .update({ status: 'active' })
        .eq('id', orderId)
        .eq('organization_id', organizationId);

      if (error) {
        throw new Error(error.message);
      }
    }

    return 'active';
  }

  if (currentStatus === 'active') {
    const { error } = await serviceSupabase
      .from('orders')
      .update({ status: 'confirmed' })
      .eq('id', orderId)
      .eq('organization_id', organizationId);

    if (error) {
      throw new Error(error.message);
    }
  }

  return currentStatus === 'active' ? 'confirmed' : currentStatus;
}

export async function syncTripStatusFromLinks(
  serviceSupabase: ServiceSupabase,
  tripId: string,
  organizationId: string
) {
  const [{ count }, tripResponse] = await Promise.all([
    serviceSupabase
      .from('order_trip_links')
      .select('id', { count: 'exact', head: true })
      .eq('trip_id', tripId)
      .eq('organization_id', organizationId),
    serviceSupabase
      .from('trips')
      .select('status')
      .eq('id', tripId)
      .eq('organization_id', organizationId)
      .single(),
  ]);

  if (tripResponse.error || !tripResponse.data) {
    throw new Error('Trip not found');
  }

  const currentStatus = tripResponse.data.status as string | null;

  if ((count || 0) > 0) {
    if (currentStatus !== 'active' && currentStatus !== 'completed') {
      const { error } = await serviceSupabase
        .from('trips')
        .update({ status: 'active' })
        .eq('id', tripId)
        .eq('organization_id', organizationId);

      if (error) {
        throw new Error(error.message);
      }
    }

    return 'active';
  }

  if (currentStatus === 'active') {
    const { error } = await serviceSupabase
      .from('trips')
      .update({ status: 'unconfirmed' })
      .eq('id', tripId)
      .eq('organization_id', organizationId);

    if (error) {
      throw new Error(error.message);
    }
  }

  return currentStatus === 'active' ? 'unconfirmed' : currentStatus;
}
