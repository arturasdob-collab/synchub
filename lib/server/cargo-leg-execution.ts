import {
  loadCurrentLinkingProfile,
} from '@/lib/server/order-trip-linking';
import { loadManageableOrderTripLinkContext } from '@/lib/server/cargo-legs';

type ServiceSupabase = any;

export async function loadEditableCargoLegExecutionContext(
  serviceSupabase: ServiceSupabase,
  userId: string,
  cargoLegId: string
) {
  const profile = await loadCurrentLinkingProfile(serviceSupabase, userId);

  const { data: cargoLeg, error: cargoLegError } = await serviceSupabase
    .from('cargo_legs')
    .select(
      `
        id,
        organization_id,
        responsible_organization_id,
        order_trip_link_id,
        show_to_all_managers,
        manager_shares:cargo_leg_manager_shares (
          manager_user_id,
          shared_organization_id
        )
      `
    )
    .eq('id', cargoLegId)
    .single();

  if (cargoLegError || !cargoLeg) {
    throw new Error('Cargo route step not found');
  }

  if (cargoLeg.organization_id === profile.organization_id) {
    await loadManageableOrderTripLinkContext(
      serviceSupabase,
      userId,
      cargoLeg.order_trip_link_id
    );

    return {
      profile,
      cargoLeg,
      effectiveOrganizationId: cargoLeg.organization_id as string,
    };
  }

  if (cargoLeg.responsible_organization_id !== profile.organization_id) {
    throw new Error('Forbidden');
  }

  if (cargoLeg.show_to_all_managers) {
    return {
      profile,
      cargoLeg,
      effectiveOrganizationId: cargoLeg.organization_id as string,
    };
  }

  const managerShares = Array.isArray(cargoLeg.manager_shares)
    ? cargoLeg.manager_shares
    : cargoLeg.manager_shares
      ? [cargoLeg.manager_shares]
      : [];

  const hasManagerAccess = managerShares.some(
    (share: any) =>
      share?.shared_organization_id === profile.organization_id &&
      share?.manager_user_id === userId
  );

  if (!hasManagerAccess) {
    throw new Error('Forbidden');
  }

  return {
    profile,
    cargoLeg,
    effectiveOrganizationId: cargoLeg.organization_id as string,
  };
}
