'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, Loader2, Plus, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/AuthProvider';
import { supabase } from '@/lib/supabase/client';
import { COUNTRIES } from '@/lib/constants/countries';

type OrganizationType = 'company' | 'partner' | 'terminal' | 'warehouse';

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

const EMPTY_FORM: OrganizationForm = {
  name: '',
  type: 'company',
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

export default function NewOrganizationPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<OrganizationForm>(EMPTY_FORM);

  const canManageOrganizations =
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

    if (!canManageOrganizations) {
      router.push('/app');
    }
  }, [authLoading, canManageOrganizations, profile, router]);

  const updateField = <K extends keyof OrganizationForm>(key: K, value: OrganizationForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreate = async () => {
    const name = form.name.trim();

    if (!name) {
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

      const res = await fetch('/api/admin/organizations/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          ...form,
          name,
          type: form.type || null,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        toast.error(data?.error || 'Failed to create organization');
        return;
      }

      toast.success('Organization created');
      router.push(`/app/admin/organizations/${data.organization.id}`);
    } catch (error) {
      console.error('CREATE ORGANIZATION CARD ERROR:', error);
      toast.error('Failed to create organization');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin" />
          <p className="mt-3 text-sm text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!canManageOrganizations) {
    return null;
  }

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
              <h1 className="text-4xl font-bold">New Organization</h1>
              <span className="inline-flex rounded-md bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                Draft
              </span>
            </div>
            <div className="text-sm text-slate-600">
              Fill the organization card first, then we will add warehouses and other route data.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? 'Creating...' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/app/admin/organizations')}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md border px-4 py-2 hover:bg-slate-50 disabled:opacity-50"
            >
              <X size={16} />
              Cancel
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-6">
        <h2 className="text-center text-xl font-semibold">Organization Information</h2>

        <div className="mt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1 text-sm text-slate-500">Organization name</div>
              <input
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                className="w-full rounded-md border px-3 py-2"
              />
            </div>
            <div>
              <div className="mb-1 text-sm text-slate-500">Type</div>
              <select
                value={form.type}
                onChange={(e) => updateField('type', e.target.value as OrganizationForm['type'])}
                className="w-full rounded-md border px-3 py-2"
              >
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
              <input
                value={form.company_code}
                onChange={(e) => updateField('company_code', e.target.value)}
                className="w-full rounded-md border px-3 py-2"
              />
            </div>
            <div>
              <div className="mb-1 text-sm text-slate-500">VAT code</div>
              <input
                value={form.vat_code}
                onChange={(e) => updateField('vat_code', e.target.value)}
                className="w-full rounded-md border px-3 py-2"
              />
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(260px,1.4fr)_minmax(140px,0.9fr)_110px_minmax(160px,0.9fr)]">
            <div>
              <div className="mb-1 text-sm text-slate-500">Address</div>
              <input
                value={form.address}
                onChange={(e) => updateField('address', e.target.value)}
                className="w-full rounded-md border px-3 py-2"
              />
            </div>
            <div>
              <div className="mb-1 text-sm text-slate-500">City</div>
              <input
                value={form.city}
                onChange={(e) => updateField('city', e.target.value)}
                className="w-full rounded-md border px-3 py-2"
              />
            </div>
            <div>
              <div className="mb-1 text-sm text-slate-500">Postal code</div>
              <input
                value={form.postal_code}
                onChange={(e) => updateField('postal_code', e.target.value)}
                className="w-full rounded-md border px-3 py-2"
              />
            </div>
            <div>
              <div className="mb-1 text-sm text-slate-500">Country</div>
              <CountrySearchInput
                value={form.country}
                onChange={(value) => updateField('country', value)}
                placeholder="Country"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1 text-sm text-slate-500">Contact phone</div>
              <input
                value={form.contact_phone}
                onChange={(e) => updateField('contact_phone', e.target.value)}
                className="w-full rounded-md border px-3 py-2"
              />
            </div>
            <div>
              <div className="mb-1 text-sm text-slate-500">Contact email</div>
              <input
                value={form.contact_email}
                onChange={(e) => updateField('contact_email', e.target.value)}
                className="w-full rounded-md border px-3 py-2"
              />
            </div>
          </div>

          <div>
            <div className="mb-1 text-sm text-slate-500">Notes</div>
            <textarea
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              className="min-h-[120px] w-full rounded-md border px-3 py-2"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-dashed bg-slate-50 p-6 text-center text-sm text-slate-500">
        Warehouses and employees will appear after the organization is created.
      </div>
    </div>
  );
}
