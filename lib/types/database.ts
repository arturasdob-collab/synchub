export type OrganizationType = 'company' | 'partner' | 'terminal';
export type UserRole = 'Manager' | 'Admin' | 'Owner';

export interface Organization {
  id: string;
  name: string;
  type: OrganizationType;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  country: string | null;
  organization_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserWithOrganization extends UserProfile {
  organization: Organization | null;
}
