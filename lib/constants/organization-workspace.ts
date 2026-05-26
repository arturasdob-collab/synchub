export const ORGANIZATION_WORKSPACE_MODES = [
  'full_internal',
  'partner_limited',
] as const;

export type OrganizationWorkspaceMode =
  (typeof ORGANIZATION_WORKSPACE_MODES)[number];

export function normalizeOrganizationWorkspaceMode(
  value: unknown
): OrganizationWorkspaceMode | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === 'full_internal') {
    return 'full_internal';
  }

  if (normalized === 'partner_limited') {
    return 'partner_limited';
  }

  return null;
}

export function inferOrganizationWorkspaceMode(
  organizationName: string
): OrganizationWorkspaceMode {
  return organizationName.trim().toUpperCase().startsWith('TEMPUS')
    ? 'full_internal'
    : 'partner_limited';
}

export function isFullInternalWorkspaceMode(
  value: OrganizationWorkspaceMode | string | null | undefined
) {
  return normalizeOrganizationWorkspaceMode(value) === 'full_internal';
}

export function formatOrganizationWorkspaceMode(
  value: OrganizationWorkspaceMode | null | undefined
) {
  if (value === 'full_internal') {
    return 'Full internal';
  }

  if (value === 'partner_limited') {
    return 'Partner limited';
  }

  return '-';
}
