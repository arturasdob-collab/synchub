type ServiceSupabase = any;

export type WorkflowCustomColumnVisibilityScope = 'self' | 'selected_organizations';

export type WorkflowCustomColumnRow = {
  id: string;
  owner_organization_id: string;
  created_by: string;
  name: string;
  slug: string;
  visibility_scope: WorkflowCustomColumnVisibilityScope;
  created_at: string;
  updated_at: string;
  visible_organization_ids: string[];
};

export function isWorkflowCustomColumnVisibilityScope(
  value: unknown
): value is WorkflowCustomColumnVisibilityScope {
  return value === 'self' || value === 'selected_organizations';
}

function normalizeWorkflowCustomColumnName(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ');
}

function slugifyWorkflowCustomColumnName(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'custom-column';
}

function normalizeOrganizationIds(values: unknown[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }

    const normalized = value.trim();

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function normalizeWorkflowCustomColumnRow(row: any): WorkflowCustomColumnRow | null {
  if (
    !row?.id ||
    !row?.owner_organization_id ||
    !row?.created_by ||
    !isWorkflowCustomColumnVisibilityScope(row.visibility_scope)
  ) {
    return null;
  }

  const visibleOrganizationIds = normalizeOrganizationIds(
    Array.isArray(row.workflow_custom_column_organizations)
      ? row.workflow_custom_column_organizations.map(
          (entry: any) => entry?.organization_id
        )
      : []
  );

  return {
    id: row.id,
    owner_organization_id: row.owner_organization_id,
    created_by: row.created_by,
    name: normalizeWorkflowCustomColumnName(row.name) || 'Custom column',
    slug: typeof row.slug === 'string' && row.slug.trim() !== '' ? row.slug.trim() : row.id,
    visibility_scope: row.visibility_scope,
    created_at:
      typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    updated_at:
      typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
    visible_organization_ids: visibleOrganizationIds,
  };
}

export async function loadWorkflowCustomColumns(
  serviceSupabase: ServiceSupabase,
  params: {
    viewerUserId: string;
    viewerOrganizationId: string;
  }
) {
  const { data, error } = await serviceSupabase
    .from('workflow_custom_columns')
    .select(
      `
        id,
        owner_organization_id,
        created_by,
        name,
        slug,
        visibility_scope,
        created_at,
        updated_at,
        workflow_custom_column_organizations (
          organization_id
        )
      `
    )
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const result: WorkflowCustomColumnRow[] = [];

  for (const rawRow of data || []) {
    const row = normalizeWorkflowCustomColumnRow(rawRow);

    if (!row) {
      continue;
    }

    const visibleToCurrentUser =
      row.created_by === params.viewerUserId ||
      (row.visibility_scope === 'selected_organizations' &&
        row.visible_organization_ids.includes(params.viewerOrganizationId));

    if (!visibleToCurrentUser) {
      continue;
    }

    result.push(row);
  }

  return result;
}

async function generateUniqueWorkflowCustomColumnSlug(
  serviceSupabase: ServiceSupabase,
  params: {
    ownerOrganizationId: string;
    name: string;
  }
) {
  const baseSlug = slugifyWorkflowCustomColumnName(params.name);

  const { data, error } = await serviceSupabase
    .from('workflow_custom_columns')
    .select('slug')
    .eq('owner_organization_id', params.ownerOrganizationId)
    .like('slug', `${baseSlug}%`);

  if (error) {
    throw new Error(error.message);
  }

  const usedSlugs = new Set<string>(
    (data || [])
      .map((row: any) => (typeof row?.slug === 'string' ? row.slug.trim() : ''))
      .filter((value: string) => value !== '')
  );

  if (!usedSlugs.has(baseSlug)) {
    return baseSlug;
  }

  let suffix = 2;
  while (usedSlugs.has(`${baseSlug}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseSlug}-${suffix}`;
}

export async function createWorkflowCustomColumn(
  serviceSupabase: ServiceSupabase,
  params: {
    ownerOrganizationId: string;
    createdBy: string;
    name: string;
    visibilityScope: WorkflowCustomColumnVisibilityScope;
    organizationIds: string[];
  }
) {
  const normalizedName = normalizeWorkflowCustomColumnName(params.name);

  if (!normalizedName) {
    throw new Error('Column name is required');
  }

  if (
    params.visibilityScope === 'selected_organizations' &&
    params.organizationIds.length === 0
  ) {
    throw new Error('Select at least one organization');
  }

  const slug = await generateUniqueWorkflowCustomColumnSlug(serviceSupabase, {
    ownerOrganizationId: params.ownerOrganizationId,
    name: normalizedName,
  });

  const { data, error } = await serviceSupabase
    .from('workflow_custom_columns')
    .insert({
      owner_organization_id: params.ownerOrganizationId,
      created_by: params.createdBy,
      name: normalizedName,
      slug,
      visibility_scope: params.visibilityScope,
    })
    .select(
      'id, owner_organization_id, created_by, name, slug, visibility_scope, created_at, updated_at'
    )
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message || 'Failed to create custom column');
  }

  const normalizedOrganizationIds = normalizeOrganizationIds(params.organizationIds);

  if (
    params.visibilityScope === 'selected_organizations' &&
    normalizedOrganizationIds.length > 0
  ) {
    const { error: organizationsError } = await serviceSupabase
      .from('workflow_custom_column_organizations')
      .insert(
        normalizedOrganizationIds.map((organizationId) => ({
          column_id: data.id,
          organization_id: organizationId,
        }))
      );

    if (organizationsError) {
      throw new Error(organizationsError.message);
    }
  }

  return {
    id: data.id,
    owner_organization_id: data.owner_organization_id,
    created_by: data.created_by,
    name: data.name,
    slug: data.slug,
    visibility_scope: data.visibility_scope as WorkflowCustomColumnVisibilityScope,
    created_at: data.created_at,
    updated_at: data.updated_at,
    visible_organization_ids:
      params.visibilityScope === 'selected_organizations'
        ? normalizedOrganizationIds
        : [],
  } satisfies WorkflowCustomColumnRow;
}
