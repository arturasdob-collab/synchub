export type OrganizationType = 'company' | 'partner' | 'terminal' | 'warehouse';
export type UserRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'ACCOUNTANT' | 'FINANCE';

export interface Organization {
  id: string;
  name: string;
  type: OrganizationType | null;
  company_code: string | null;
  vat_code: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  phone?: string | null;
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
