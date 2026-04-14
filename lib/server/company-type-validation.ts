type ServiceSupabase = any;

type CompanyType = 'carrier' | 'client';

export async function validateCompanyTypeForOrganization(
  serviceSupabase: ServiceSupabase,
  organizationId: string,
  companyId: string | null | undefined,
  companyType: CompanyType
) {
  if (!companyId) {
    return null;
  }

  const { data: company, error } = await serviceSupabase
    .from('companies')
    .select('id, organization_id, is_carrier, is_client')
    .eq('id', companyId)
    .single();

  if (error || !company) {
    throw new Error('Company not found');
  }

  if (company.organization_id !== organizationId) {
    throw new Error('Forbidden');
  }

  if (companyType === 'carrier' && company.is_carrier !== true) {
    throw new Error('Selected company must be a carrier');
  }

  if (companyType === 'client' && company.is_client !== true) {
    throw new Error('Selected company must be a client');
  }

  return company;
}
