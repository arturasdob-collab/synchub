export type OrganizationType = 'company' | 'partner' | 'terminal';
export type UserRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'ACCOUNTANT' | 'FINANCE';

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
  disabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserWithOrganization extends UserProfile {
  organization: Organization | null;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: UserRole;
  invited_by: string;
  created_at: string;
  expires_at: string | null;
}
