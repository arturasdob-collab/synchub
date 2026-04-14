'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Save,
  Trash2,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/AuthProvider';
import { supabase } from '@/lib/supabase/client';
import { COUNTRIES } from '@/lib/constants/countries';

type OrganizationType = 'company' | 'partner' | 'terminal' | 'warehouse';

type OrganizationDetails = {
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
  created_at: string | null;
  updated_at: string | null;
};

type EmployeeRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  role: string | null;
  disabled: boolean | null;
  created_at: string | null;
};

type WarehouseRow = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type OrganizationForm = {
  name: string;
  type: OrganizationType | '';
  company_code: string;
  vat_code: string;
  address: string;
  city: string;
  postal_code: string;
  country: string;
  contact_phone: string;
  contact_email: string;
  notes: string;
};

type WarehouseForm = {
  name: string;
  address: string;
  city: string;
  postal_code: string;
  country: string;
};

const EMPTY_FORM: OrganizationForm = {
  name: '',
  type: '',
  company_code: '',
  vat_code: '',
  address: '',
  city: '',
  postal_code: '',
  country: '',
  contact_phone: '',
  contact_email: '',
  notes: '',
};

const EMPTY_WAREHOUSE_FORM: WarehouseForm = {
  name: '',
  address: '',
  city: '',
  postal_code: '',
  country: '',
};

function formatOrganizationType(type: OrganizationType | null | undefined) {
  switch (type) {
    case 'company':
      return 'Company';
    case 'partner':
      return 'Partner';
    case 'terminal':
      return 'Terminal';
    case 'warehouse':
      return 'Warehouse';
    default:
      return '-';
  }
}

function formatPerson(firstName: string | null | undefined, lastName: string | null | undefined) {
  return `${firstName || ''} ${lastName || ''}`.trim() || '-';
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

function formatWarehouseAddress(warehouse: {
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
}) {
  const parts = [
    warehouse.address,
    warehouse.city,
    warehouse.postal_code,
    warehouse.country,
  ]
    .filter(Boolean)
    .map((value) => value!.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : '-';
}

function normalizeFormFromOrganization(organization: OrganizationDetails): OrganizationForm {
  return {
    name: organization.name || '',
    type: organization.type || '',
    company_code: organization.company_code || '',
    vat_code: organization.vat_code || '',
    address: organization.address || '',
    city: organization.city || '',
    postal_code: organization.postal_code || '',
    country: organization.country || '',
    contact_phone: organization.contact_phone || '',
    contact_email: organization.contact_email || '',
    notes: organization.notes || '',
  };
}

function normalizeWarehouseForm(warehouse: WarehouseRow): WarehouseForm {
  return {
    name: warehouse.name || '',
    address: warehouse.address || '',
    city: warehouse.city || '',
    postal_code: warehouse.postal_code || '',
    country: warehouse.country || '',
  };
}

function CountrySearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value);

  useEffect(() => {
    if (!open) setSearch(value);
  }, [open, value]);

  const query = search.trim().toLowerCase();
  const filteredCountries = useMemo(() => {
    if (query.length < 2) return [];
    return COUNTRIES.filter((country) => country.toLowerCase().includes(query)).slice(0, 40);
  }, [query]);

  return (
    <div
      className="relative"
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          window.setTimeout(() => setOpen(false), 0);
        }
      }}
    >
      <input
        value={open ? search : value}
        onFocus={() => {
          setOpen(true);
          setSearch(value);
        }}
        onClick={() => {
          setOpen(true);
          setSearch(value);
        }}
        onChange={(e) => {
          setSearch(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        placeholder={placeholder}
        className="w-full rounded-md border px-3 py-2"
      />

      {open && query.length >= 2 ? (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-md border bg-white shadow-sm">
          {filteredCountries.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-500">No countries found</div>
          ) : (
            filteredCountries.map((country) => (
              <button
                key={country}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(country);
                  setSearch(country);
                  setOpen(false);
                }}
                className={`block w-full border-b px-3 py-2 text-left text-sm hover:bg-slate-50 last:border-b-0 ${
                  value === country ? 'bg-slate-50 font-medium' : ''
                }`}
              >
                {country}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function OrganizationDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const organizationIdParam = params?.id;
  const organizationId = Array.isArray(organizationIdParam)
    ? organizationIdParam[0] || ''
    : typeof organizationIdParam === 'string'
      ? organizationIdParam
      : '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [warehouseSaving, setWarehouseSaving] = useState(false);
  const [warehouseDeletingId, setWarehouseDeletingId] = useState('');
  const [warehouseEditorId, setWarehouseEditorId] = useState<string | 'new' | null>(
    null
  );

  const [organization, setOrganization] = useState<OrganizationDetails | null>(null);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [pendingInvitesCount, setPendingInvitesCount] = useState(0);
  const [canManage, setCanManage] = useState(false);
  const [form, setForm] = useState<OrganizationForm>(EMPTY_FORM);
  const [warehouseForm, setWarehouseForm] =
    useState<WarehouseForm>(EMPTY_WAREHOUSE_FORM);

  const canViewOrganizations =
    !!profile &&
    ((profile as any).is_super_admin ||
      (profile as any).is_creator ||
      profile.role === 'OWNER' ||
      profile.role === 'ADMIN');

  useEffect(() => {
    if (authLoading) return;
    if (!profile) {
      router.push('/login');
      return;
    }
    if (!canViewOrganizations) {
      router.push('/app');
      return;
    }
    if (!organizationId) return;
    void fetchOrganizationDetails();
  }, [authLoading, canViewOrganizations, organizationId, profile, router]);

  const fetchOrganizationDetails = async () => {
    try {
      setLoading(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error('Not authenticated');
        return;
      }

      const res = await fetch(
        `/api/admin/organizations/details?organizationId=${organizationId}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        toast.error(data?.error || 'Failed to load organization');
        router.push('/app/admin/organizations');
        return;
      }

      setOrganization(data.organization ?? null);
      setEmployees(data.employees ?? []);
      setWarehouses(data.warehouses ?? []);
      setPendingInvitesCount(data.pending_invites_count ?? 0);
      setCanManage(!!data.can_manage);

      if (data.organization) {
        setForm(normalizeFormFromOrganization(data.organization));
      }
    } catch (error) {
      console.error('FETCH ORGANIZATION DETAILS ERROR:', error);
      toast.error('Failed to load organization');
      router.push('/app/admin/organizations');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!organization) return;

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      toast.error('Organization name is required');
      return;
    }

    try {
      setSaving(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error('Not authenticated');
        return;
      }

      const res = await fetch('/api/admin/organizations/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          organizationId: organization.id,
          ...form,
          name: trimmedName,
          type: form.type || null,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error || 'Failed to update organization');
        return;
      }

      toast.success('Organization updated');
      setEditing(false);
      await fetchOrganizationDetails();
    } catch (error) {
      console.error('UPDATE ORGANIZATION DETAILS ERROR:', error);
      toast.error('Failed to update organization');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!organization) return;
    if (!confirm(`Delete organization "${organization.name}"?`)) return;

    try {
      setDeleting(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error('Not authenticated');
        return;
      }

      const res = await fetch('/api/admin/organizations/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ organizationId: organization.id }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error || 'Failed to delete organization');
        return;
      }

      toast.success('Organization deleted');
      router.push('/app/admin/organizations');
    } catch (error) {
      console.error('DELETE ORGANIZATION DETAILS ERROR:', error);
      toast.error('Failed to delete organization');
    } finally {
      setDeleting(false);
    }
  };

  const resetWarehouseEditor = () => {
    setWarehouseEditorId(null);
    setWarehouseForm(EMPTY_WAREHOUSE_FORM);
  };

  const openNewWarehouseEditor = () => {
    setWarehouseEditorId('new');
    setWarehouseForm(EMPTY_WAREHOUSE_FORM);
  };

  const openExistingWarehouseEditor = (warehouse: WarehouseRow) => {
    setWarehouseEditorId(warehouse.id);
    setWarehouseForm(normalizeWarehouseForm(warehouse));
  };

  const saveWarehouse = async () => {
    if (!organization) return;

    const trimmedName = warehouseForm.name.trim();
    if (!trimmedName) {
      toast.error('Warehouse name is required');
      return;
    }

    try {
      setWarehouseSaving(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error('Not authenticated');
        return;
      }

      const isEditingWarehouse =
        warehouseEditorId !== null && warehouseEditorId !== 'new';

      const res = await fetch(
        isEditingWarehouse
          ? '/api/admin/organizations/warehouses/update'
          : '/api/admin/organizations/warehouses/create',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            organizationId: organization.id,
            warehouseId: isEditingWarehouse ? warehouseEditorId : null,
            ...warehouseForm,
            name: trimmedName,
          }),
        }
      );

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error || 'Failed to save warehouse');
        return;
      }

      toast.success(isEditingWarehouse ? 'Warehouse updated' : 'Warehouse added');
      resetWarehouseEditor();
      await fetchOrganizationDetails();
    } catch (error) {
      console.error('SAVE WAREHOUSE ERROR:', error);
      toast.error('Failed to save warehouse');
    } finally {
      setWarehouseSaving(false);
    }
  };

  const deleteWarehouse = async (warehouseId: string, warehouseName: string) => {
    if (!confirm(`Delete warehouse "${warehouseName}"?`)) return;

    try {
      setWarehouseDeletingId(warehouseId);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error('Not authenticated');
        return;
      }

      const res = await fetch('/api/admin/organizations/warehouses/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ warehouseId }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error || 'Failed to delete warehouse');
        return;
      }

      toast.success('Warehouse deleted');
      if (warehouseEditorId === warehouseId) {
        resetWarehouseEditor();
      }
      await fetchOrganizationDetails();
    } catch (error) {
      console.error('DELETE WAREHOUSE ERROR:', error);
      toast.error('Failed to delete warehouse');
    } finally {
      setWarehouseDeletingId('');
    }
  };

  const summaryItems = useMemo(
    () => [
      { label: 'Employees', value: String(employees.length) },
      { label: 'Warehouses', value: String(warehouses.length) },
      { label: 'Pending invites', value: String(pendingInvitesCount) },
      { label: 'Created', value: formatDate(organization?.created_at) },
    ],
    [employees.length, organization?.created_at, pendingInvitesCount, warehouses.length]
  );

  const updateField = <K extends keyof OrganizationForm>(key: K, value: OrganizationForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateWarehouseField = <K extends keyof WarehouseForm>(
    key: K,
    value: WarehouseForm[K]
  ) => {
    setWarehouseForm((prev) => ({ ...prev, [key]: value }));
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin" />
          <p className="mt-3 text-sm text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!organization || !profile || !canViewOrganizations) {
    return null;
  }

  const renderWarehouseEditor = () => (
    <div className="rounded-xl border bg-slate-50 p-3 space-y-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(170px,0.9fr)_minmax(220px,1.5fr)_minmax(140px,0.8fr)_110px_minmax(140px,0.8fr)]">
        <div>
          <div className="mb-1 text-sm text-slate-500">Warehouse name</div>
          <input value={warehouseForm.name} onChange={(e) => updateWarehouseField('name', e.target.value)} className="w-full rounded-md border px-3 py-2" placeholder="Terminality Kaunas" />
        </div>
        <div>
          <div className="mb-1 text-sm text-slate-500">Address</div>
          <input value={warehouseForm.address} onChange={(e) => updateWarehouseField('address', e.target.value)} className="w-full rounded-md border px-3 py-2" placeholder="Šermukšnių g. 19" />
        </div>
        <div>
          <div className="mb-1 text-sm text-slate-500">City</div>
          <input value={warehouseForm.city} onChange={(e) => updateWarehouseField('city', e.target.value)} className="w-full rounded-md border px-3 py-2" placeholder="Kaunas" />
        </div>
        <div>
          <div className="mb-1 text-sm text-slate-500">Postal code</div>
          <input value={warehouseForm.postal_code} onChange={(e) => updateWarehouseField('postal_code', e.target.value)} className="w-full rounded-md border px-3 py-2" placeholder="LT-00000" />
        </div>
        <div>
          <div className="mb-1 text-sm text-slate-500">Country</div>
          <CountrySearchInput value={warehouseForm.country} onChange={(value) => updateWarehouseField('country', value)} placeholder="Country" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" onClick={saveWarehouse} disabled={warehouseSaving} className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-800 disabled:opacity-50">
          <Save size={16} />
          {warehouseSaving ? 'Saving...' : 'Save'}
        </button>
        <button type="button" onClick={resetWarehouseEditor} disabled={warehouseSaving} className="inline-flex items-center gap-2 rounded-md border px-4 py-2 hover:bg-slate-50 disabled:opacity-50">
          <X size={16} />
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <button
        type="button"
        onClick={() => router.push('/app/admin/organizations')}
        className="inline-flex items-center gap-2 rounded-md border px-4 py-2 hover:bg-slate-50"
      >
        <ArrowLeft size={16} />
        Back to Organizations
      </button>

      <div className="rounded-2xl border bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Building2 className="h-7 w-7 text-slate-500" />
              <h1 className="text-4xl font-bold">{organization.name}</h1>
              <span className="inline-flex rounded-md bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                {formatOrganizationType(organization.type)}
              </span>
            </div>

            <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              <div>Company code <span className="font-medium text-slate-900">{organization.company_code || '-'}</span></div>
              <div>VAT code <span className="font-medium text-slate-900">{organization.vat_code || '-'}</span></div>
              <div>Contact email <span className="font-medium text-slate-900">{organization.contact_email || '-'}</span></div>
              <div>Contact phone <span className="font-medium text-slate-900">{organization.contact_phone || '-'}</span></div>
            </div>
          </div>

          {canManage ? (
            <div className="flex flex-wrap items-center gap-3">
              {editing ? (
                <>
                  <button type="button" onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-800 disabled:opacity-50">
                    <Save size={16} />
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setForm(normalizeFormFromOrganization(organization));
                    }}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-md border px-4 py-2 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <X size={16} />
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-2 rounded-md border px-4 py-2 hover:bg-slate-50">
                    <Pencil size={16} />
                    Edit
                  </button>
                  <button type="button" onClick={handleDelete} disabled={deleting} className="inline-flex items-center gap-2 rounded-md border border-red-200 px-4 py-2 text-red-600 hover:bg-red-50 disabled:opacity-50">
                    <Trash2 size={16} />
                    {deleting ? 'Deleting...' : 'Delete'}
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {summaryItems.map((item) => (
          <div key={item.label} className="rounded-2xl border bg-white p-4 text-center">
            <div className="text-sm text-slate-500">{item.label}</div>
            <div className="mt-2 text-lg font-semibold text-slate-900">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border bg-white p-6">
        <h2 className="text-center text-xl font-semibold">Organization Information</h2>

        {editing ? (
          <div className="mt-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1 text-sm text-slate-500">Organization name</div>
                <input value={form.name} onChange={(e) => updateField('name', e.target.value)} className="w-full rounded-md border px-3 py-2" />
              </div>
              <div>
                <div className="mb-1 text-sm text-slate-500">Type</div>
                <select value={form.type} onChange={(e) => updateField('type', e.target.value as OrganizationForm['type'])} className="w-full rounded-md border px-3 py-2">
                  <option value="">-</option>
                  <option value="company">Company</option>
                  <option value="partner">Partner</option>
                  <option value="terminal">Terminal</option>
                  <option value="warehouse">Warehouse</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1 text-sm text-slate-500">Company code</div>
                <input value={form.company_code} onChange={(e) => updateField('company_code', e.target.value)} className="w-full rounded-md border px-3 py-2" />
              </div>
              <div>
                <div className="mb-1 text-sm text-slate-500">VAT code</div>
                <input value={form.vat_code} onChange={(e) => updateField('vat_code', e.target.value)} className="w-full rounded-md border px-3 py-2" />
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-[minmax(260px,1.4fr)_minmax(140px,0.9fr)_110px_minmax(160px,0.9fr)]">
              <div>
                <div className="mb-1 text-sm text-slate-500">Address</div>
                <input value={form.address} onChange={(e) => updateField('address', e.target.value)} className="w-full rounded-md border px-3 py-2" />
              </div>
              <div>
                <div className="mb-1 text-sm text-slate-500">City</div>
                <input value={form.city} onChange={(e) => updateField('city', e.target.value)} className="w-full rounded-md border px-3 py-2" />
              </div>
              <div>
                <div className="mb-1 text-sm text-slate-500">Postal code</div>
                <input value={form.postal_code} onChange={(e) => updateField('postal_code', e.target.value)} className="w-full rounded-md border px-3 py-2" />
              </div>
              <div>
                <div className="mb-1 text-sm text-slate-500">Country</div>
                <CountrySearchInput value={form.country} onChange={(value) => updateField('country', value)} placeholder="Country" />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1 text-sm text-slate-500">Contact phone</div>
                <input value={form.contact_phone} onChange={(e) => updateField('contact_phone', e.target.value)} className="w-full rounded-md border px-3 py-2" />
              </div>
              <div>
                <div className="mb-1 text-sm text-slate-500">Contact email</div>
                <input value={form.contact_email} onChange={(e) => updateField('contact_email', e.target.value)} className="w-full rounded-md border px-3 py-2" />
              </div>
            </div>

            <div>
              <div className="mb-1 text-sm text-slate-500">Notes</div>
              <textarea value={form.notes} onChange={(e) => updateField('notes', e.target.value)} className="min-h-[120px] w-full rounded-md border px-3 py-2" />
            </div>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 text-slate-400" />
                <div>
                  <div className="text-sm text-slate-500">Address</div>
                  <div className="font-medium text-slate-900">{organization.address || '-'}</div>
                  <div className="text-sm text-slate-600">{[organization.city, organization.postal_code, organization.country].filter(Boolean).join(', ') || '-'}</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="mt-0.5 h-5 w-5 text-slate-400" />
                <div>
                  <div className="text-sm text-slate-500">Contact phone</div>
                  <div className="font-medium text-slate-900">{organization.contact_phone || '-'}</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 h-5 w-5 text-slate-400" />
                <div>
                  <div className="text-sm text-slate-500">Contact email</div>
                  <div className="font-medium text-slate-900">{organization.contact_email || '-'}</div>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div><div className="text-sm text-slate-500">Type</div><div className="font-medium text-slate-900">{formatOrganizationType(organization.type)}</div></div>
              <div><div className="text-sm text-slate-500">Company code</div><div className="font-medium text-slate-900">{organization.company_code || '-'}</div></div>
              <div><div className="text-sm text-slate-500">VAT code</div><div className="font-medium text-slate-900">{organization.vat_code || '-'}</div></div>
              <div><div className="text-sm text-slate-500">Notes</div><div className="whitespace-pre-wrap font-medium text-slate-900">{organization.notes || '-'}</div></div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Warehouse className="h-5 w-5 text-slate-500" />
            <h2 className="text-xl font-semibold">Warehouses</h2>
          </div>
          {canManage && warehouseEditorId === null ? (
            <button type="button" onClick={openNewWarehouseEditor} className="inline-flex items-center gap-2 rounded-md border px-4 py-2 hover:bg-slate-50">
              <Plus size={16} />
              Add Warehouse
            </button>
          ) : null}
        </div>

        <div className="mt-6 space-y-3">
          {warehouseEditorId === 'new' ? renderWarehouseEditor() : null}

          {warehouses.length === 0 && warehouseEditorId !== 'new' ? (
            <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-slate-500">No warehouses yet</div>
          ) : (
            warehouses.map((warehouse) =>
              warehouseEditorId === warehouse.id ? (
                <div key={warehouse.id}>{renderWarehouseEditor()}</div>
              ) : (
                <div key={warehouse.id} className="rounded-xl border bg-slate-50 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">{warehouse.name || '-'}</div>
                      <div className="text-sm text-slate-600">{formatWarehouseAddress(warehouse)}</div>
                    </div>
                    {canManage ? (
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => openExistingWarehouseEditor(warehouse)} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-white">
                          <Pencil size={14} />
                          Edit
                        </button>
                        <button type="button" onClick={() => deleteWarehouse(warehouse.id, warehouse.name || '-')} disabled={warehouseDeletingId === warehouse.id} className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">
                          <Trash2 size={14} />
                          {warehouseDeletingId === warehouse.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            )
          )}
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-6">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-slate-500" />
          <h2 className="text-xl font-semibold">Employees</h2>
        </div>
        <div className="mt-6 overflow-hidden rounded-2xl border">
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="border-b bg-slate-50">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold">Manager</th>
                  <th className="px-3 py-3 text-left font-semibold">Email</th>
                  <th className="px-3 py-3 text-left font-semibold">Phone</th>
                  <th className="px-3 py-3 text-left font-semibold">Position</th>
                  <th className="px-3 py-3 text-left font-semibold">Role</th>
                  <th className="px-3 py-3 text-left font-semibold">Status</th>
                  <th className="px-3 py-3 text-left font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-500">No employees yet</td>
                  </tr>
                ) : (
                  employees.map((employee) => (
                    <tr key={employee.id} className="border-b last:border-b-0">
                      <td className="px-3 py-3 font-medium">{formatPerson(employee.first_name, employee.last_name)}</td>
                      <td className="px-3 py-3">{employee.email || '-'}</td>
                      <td className="px-3 py-3">{employee.phone || '-'}</td>
                      <td className="px-3 py-3">{employee.position || '-'}</td>
                      <td className="px-3 py-3">{employee.role || '-'}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${employee.disabled ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                          {employee.disabled ? 'Disabled' : 'Active'}
                        </span>
                      </td>
                      <td className="px-3 py-3">{formatDate(employee.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
