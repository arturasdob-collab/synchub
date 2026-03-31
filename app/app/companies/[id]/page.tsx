'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import {
  Loader2,
  ArrowLeft,
  Building2,
  Phone,
  Mail,
  Globe,
  MapPin,
  FileText,
  Pencil,
  Briefcase,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/AuthProvider';

type Company = {
  id: string;
  company_code: string;
  name: string;
  vat_code: string | null;
  country: string | null;
  postal_code: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  payment_term_days: number | null;
  is_client: boolean;
  is_carrier: boolean;
  rating: number | null;
  notes: string | null;
  created_at: string | null;
  cmr_insurance_number?: string | null;
  cmr_insurance_valid_from?: string;
  cmr_insurance_valid_until?: string | null;
  cmr_insurance_amount?: number | null;
  creator:
    | {
        first_name: string | null;
        last_name: string | null;
      }
    | {
        first_name: string | null;
        last_name: string | null;
      }[]
    | null;
};

type CompanyContact = {
  id: string;
  first_name: string;
  last_name: string | null;
  position: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

export default function CompanyPage() {
  const params = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const companyId = params.id as string;

  const [company, setCompany] = useState<Company | null>(null);
  const [contacts, setContacts] = useState<CompanyContact[]>([]);
  const [comments, setComments] = useState<any[]>([]);

  const [editingContact, setEditingContact] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState<any>({});

  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameExists, setNameExists] = useState(false);
const [codeExists, setCodeExists] = useState(false);
const [checkingName, setCheckingName] = useState(false);
const [checkingCode, setCheckingCode] = useState(false);

  const [form, setForm] = useState<any>({
    id: '',
    company_code: '',
    name: '',
    vat_code: '',
    country: '',
    postal_code: '',
    city: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    payment_term_days: '',
    is_client: false,
    is_carrier: false,
    cmr_insurance_number: '',
    cmr_insurance_valid_from: '',
    cmr_insurance_valid_until: '',
    cmr_insurance_amount: '',
    notes: '',
  });

  const [showAddContact, setShowAddContact] = useState(false);
  const [newContact, setNewContact] = useState({
    first_name: '',
    last_name: '',
    position: '',
    phone: '',
    email: '',
    notes: '',
  });

  const [commentText, setCommentText] = useState('');
  const [commentRating, setCommentRating] = useState<number | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentForm, setCommentForm] = useState<any>({});

  useEffect(() => {
    fetchAll();
    fetchComments();
  }, [companyId]);

  const fetchAll = async () => {
    await Promise.all([fetchCompany(), fetchContacts()]);
  };

  const createComment = async () => {
    if (!commentText.trim()) return;

    const res = await fetch('/api/company-comments/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: companyId,
        comment: commentText,
        rating: commentRating,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      toast.error(data.error || 'Failed to add comment');
      return;
    }

    toast.success('Comment added');
    setCommentText('');
    setCommentRating(null);
    fetchComments();
  };

  const fetchCompany = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select(`
          id,
          company_code,
          name,
          cmr_insurance_number,
          cmr_insurance_valid_from,
          cmr_insurance_valid_until,
          cmr_insurance_amount,
          vat_code,
          country,
          postal_code,
          city,
          address,
          phone,
          email,
          website,
          payment_term_days,
          is_client,
          is_carrier,
          rating,
          notes,
          created_at,
          creator:created_by (
            first_name,
            last_name
          )
        `)
        .eq('id', companyId)
        .single();

      if (error) {
        toast.error('Failed to load company');
        return;
      }

      const normalized = {
        ...data,
        id: data.id,
        company_code: data.company_code ?? '',
        name: data.name ?? '',
        vat_code: data.vat_code ?? '',
        country: data.country ?? '',
        postal_code: data.postal_code ?? '',
        city: data.city ?? '',
        address: data.address ?? '',
        phone: data.phone ?? '',
        email: data.email ?? '',
        website: data.website ?? '',
        payment_term_days: data.payment_term_days ?? '',
        is_client: !!data.is_client,
        is_carrier: !!data.is_carrier,
        notes: data.notes ?? '',
        cmr_insurance_number: data.cmr_insurance_number ?? '',
        cmr_insurance_valid_from: data.cmr_insurance_valid_from ?? '',
        cmr_insurance_valid_until: data.cmr_insurance_valid_until ?? '',
        cmr_insurance_amount: data.cmr_insurance_amount ?? '',
      };

      setCompany(data as Company);
      setForm(normalized);
    } catch (error) {
      console.error('COMPANY DETAILS ERROR:', error);
      toast.error('Failed to load company');
    } finally {
      setLoading(false);
    }
  };

  const fetchContacts = async () => {
    const { data, error } = await supabase
      .from('company_contacts')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load contacts');
      return;
    }

    setContacts((data || []) as CompanyContact[]);
  };

  const fetchComments = async () => {
    const { data, error } = await supabase
      .from('company_comments')
      .select(`
        *,
        user_profiles(first_name,last_name)
      `)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setComments(data);

      if (data.length > 0) {
        const ratings = data
          .map((c) => c.rating)
          .filter((r) => typeof r === 'number' && r > 0);

        let avg: number | null = null;

        if (ratings.length > 0) {
          avg = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
          avg = Number(avg.toFixed(1));
        }

        const { error: ratingUpdateError } = await supabase
          .from('companies')
          .update({ rating: avg })
          .eq('id', companyId);

        if (ratingUpdateError) {
          console.error('RATING UPDATE ERROR:', ratingUpdateError);
          toast.error('Failed to update company rating');
        } else {
          await fetchCompany();
        }
      }
    }
  };

  const update = (field: string, value: any) => {
    setForm((prev: any) => ({ ...prev, [field]: value }));
  };
  
  useEffect(() => {
    const checkName = async () => {
      const name = form.name?.trim();
  
      if (!editing || !name || !form.id) {
        setNameExists(false);
        return;
      }
  
      try {
        setCheckingName(true);
  
        const res = await fetch('/api/companies/check-exists-edit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: form.id,
            field: 'name',
            value: name,
          }),
        });
  
        const data = await res.json();
  
        if (res.ok) {
          setNameExists(!!data.exists);
        }
      } finally {
        setCheckingName(false);
      }
    };
  
    const timeout = setTimeout(checkName, 400);
    return () => clearTimeout(timeout);
  }, [editing, form.id, form.name]);

  useEffect(() => {
    const checkCode = async () => {
      const code = form.company_code?.trim();
  
      if (!editing || !code || !form.id) {
        setCodeExists(false);
        return;
      }
  
      try {
        setCheckingCode(true);
  
        const res = await fetch('/api/companies/check-exists-edit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: form.id,
            field: 'company_code',
            value: code,
          }),
        });
  
        const data = await res.json();
  
        if (res.ok) {
          setCodeExists(!!data.exists);
        }
      } finally {
        setCheckingCode(false);
      }
    };
  
    const timeout = setTimeout(checkCode, 400);
    return () => clearTimeout(timeout);
  }, [editing, form.id, form.company_code]);
  
  const save = async () => {
    if (nameExists) {
      toast.error('Company with this name already exists');
      return;
    }
    
    if (codeExists) {
      toast.error('Company with this code already exists');
      return;
    }

    try {
      setSaving(true);

      const payload = {
        ...form,
        payment_term_days:
          form.payment_term_days === '' ? null : Number(form.payment_term_days),
        cmr_insurance_amount:
          form.cmr_insurance_amount === '' ? null : Number(form.cmr_insurance_amount),
      };
      
      const res = await fetch('/api/companies/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data?.error || 'Failed to update company');
        return;
      }

      toast.success('Company updated');
      setEditing(false);
      await fetchCompany();
    } catch (error) {
      console.error('COMPANY UPDATE ERROR:', error);
      toast.error('Failed to update company');
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    if (!company) return;

    setForm({
      id: company.id,
      company_code: company.company_code ?? '',
      name: company.name ?? '',
      vat_code: company.vat_code ?? '',
      country: company.country ?? '',
      postal_code: company.postal_code ?? '',
      city: company.city ?? '',
      address: company.address ?? '',
      phone: company.phone ?? '',
      email: company.email ?? '',
      website: company.website ?? '',
      payment_term_days: company.payment_term_days ?? '',
      is_client: !!company.is_client,
      is_carrier: !!company.is_carrier,
      notes: company.notes ?? '',
      cmr_insurance_number: company.cmr_insurance_number ?? '',
      cmr_insurance_valid_from: company.cmr_insurance_valid_from ?? '',
      cmr_insurance_valid_until: company.cmr_insurance_valid_until ?? '',
      cmr_insurance_amount: company.cmr_insurance_amount ?? '',
    });

    setEditing(false);
  };

  const createContact = async () => {
    if (!newContact.first_name.trim()) {
      toast.error('First name required');
      return;
    }

    const res = await fetch('/api/company-contacts/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: companyId,
        ...newContact,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      toast.error(data?.error || 'Failed to create contact');
      return;
    }

    toast.success('Contact created');

    setNewContact({
      first_name: '',
      last_name: '',
      position: '',
      phone: '',
      email: '',
      notes: '',
    });

    fetchContacts();
  };

  const saveContact = async () => {
    if (!contactForm.first_name?.trim()) {
      toast.error('First name required');
      return;
    }

    const res = await fetch('/api/company-contacts/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contactForm),
    });

    const data = await res.json();

    if (!res.ok) {
      toast.error(data?.error || 'Failed to update contact');
      return;
    }

    toast.success('Contact updated');
    setEditingContact(null);
    setContactForm({});
    fetchContacts();
  };

  const creatorData = Array.isArray(company?.creator)
    ? company?.creator[0]
    : company?.creator;

  const creatorName =
    creatorData?.first_name || creatorData?.last_name
      ? `${creatorData?.first_name || ''} ${creatorData?.last_name || ''}`.trim()
      : '-';

  const canManageComment = (c: any) => {
    if (!profile) return false;

    return (
      (profile as any).is_super_admin ||
      (profile as any).is_creator ||
      profile.role === 'OWNER' ||
      c.created_by === profile.id
    );
  };

  const getTypeLabel = () => {
    const source = editing ? form : company;
    if (!source) return '-';

    const types = [
      source.is_client ? 'Client' : null,
      source.is_carrier ? 'Carrier' : null,
    ].filter(Boolean);

    return types.length ? types.join(', ') : '-';
  };

  const getAverageRating = () => {
    const validRatings = comments
      .map((c) => c.rating)
      .filter((r) => typeof r === 'number' && r > 0);

    if (!validRatings.length) return null;

    const avg =
      validRatings.reduce((sum, rating) => sum + rating, 0) / validRatings.length;

    return Number(avg.toFixed(1));
  };


  const renderRating = () => {
    const averageRating = getAverageRating();
  
    if (!averageRating) return '-';
  
    const fullStars = Math.round(averageRating);
    return `★`.repeat(fullStars) + ` (${averageRating})`;
  };
  
  const getCmrStatusBadge = () => {
    const validUntil = editing
      ? form.cmr_insurance_valid_until
      : company?.cmr_insurance_valid_until;
  
    if (!validUntil) return null;
  
    const today = new Date();
    today.setHours(0, 0, 0, 0);
  
    const expiryDate = new Date(validUntil);
    expiryDate.setHours(0, 0, 0, 0);
  
    const isValid = expiryDate >= today;
  
    return (
      <span
        className={
          isValid
            ? 'inline-flex items-center rounded-md bg-green-100 px-2 py-1 text-xs font-medium text-green-700'
            : 'inline-flex items-center rounded-md bg-red-100 px-2 py-1 text-xs font-medium text-red-700'
        }
      >
        {isValid ? 'Valid' : 'Expired'}
      </span>
    );
  };

  const countries = [
    'Afghanistan',
    'Albania',
    'Algeria',
    'Andorra',
    'Angola',
    'Antigua and Barbuda',
    'Argentina',
    'Armenia',
    'Australia',
    'Austria',
    'Azerbaijan',
    'Bahamas',
    'Bahrain',
    'Bangladesh',
    'Barbados',
    'Belarus',
    'Belgium',
    'Belize',
    'Benin',
    'Bhutan',
    'Bolivia',
    'Bosnia and Herzegovina',
    'Botswana',
    'Brazil',
    'Brunei',
    'Bulgaria',
    'Burkina Faso',
    'Burundi',
    'Cambodia',
    'Cameroon',
    'Canada',
    'Cape Verde',
    'Central African Republic',
    'Chad',
    'Chile',
    'China',
    'Colombia',
    'Comoros',
    'Congo',
    'Costa Rica',
    'Croatia',
    'Cuba',
    'Cyprus',
    'Czech Republic',
    'Denmark',
    'Djibouti',
    'Dominica',
    'Dominican Republic',
    'Ecuador',
    'Egypt',
    'El Salvador',
    'Equatorial Guinea',
    'Eritrea',
    'Estonia',
    'Eswatini',
    'Ethiopia',
    'Fiji',
    'Finland',
    'France',
    'Gabon',
    'Gambia',
    'Georgia',
    'Germany',
    'Ghana',
    'Greece',
    'Grenada',
    'Guatemala',
    'Guinea',
    'Guinea-Bissau',
    'Guyana',
    'Haiti',
    'Honduras',
    'Hungary',
    'Iceland',
    'India',
    'Indonesia',
    'Iran',
    'Iraq',
    'Ireland',
    'Israel',
    'Italy',
    'Ivory Coast',
    'Jamaica',
    'Japan',
    'Jordan',
    'Kazakhstan',
    'Kenya',
    'Kiribati',
    'Kuwait',
    'Kyrgyzstan',
    'Laos',
    'Latvia',
    'Lebanon',
    'Lesotho',
    'Liberia',
    'Libya',
    'Liechtenstein',
    'Lithuania',
    'Luxembourg',
    'Madagascar',
    'Malawi',
    'Malaysia',
    'Maldives',
    'Mali',
    'Malta',
    'Marshall Islands',
    'Mauritania',
    'Mauritius',
    'Mexico',
    'Micronesia',
    'Moldova',
    'Monaco',
    'Mongolia',
    'Montenegro',
    'Morocco',
    'Mozambique',
    'Myanmar',
    'Namibia',
    'Nauru',
    'Nepal',
    'Netherlands',
    'New Zealand',
    'Nicaragua',
    'Niger',
    'Nigeria',
    'North Korea',
    'North Macedonia',
    'Norway',
    'Oman',
    'Pakistan',
    'Palau',
    'Panama',
    'Papua New Guinea',
    'Paraguay',
    'Peru',
    'Philippines',
    'Poland',
    'Portugal',
    'Qatar',
    'Romania',
    'Russia',
    'Rwanda',
    'Saint Kitts and Nevis',
    'Saint Lucia',
    'Saint Vincent and the Grenadines',
    'Samoa',
    'San Marino',
    'Sao Tome and Principe',
    'Saudi Arabia',
    'Senegal',
    'Serbia',
    'Seychelles',
    'Sierra Leone',
    'Singapore',
    'Slovakia',
    'Slovenia',
    'Solomon Islands',
    'Somalia',
    'South Africa',
    'South Korea',
    'South Sudan',
    'Spain',
    'Sri Lanka',
    'Sudan',
    'Suriname',
    'Sweden',
    'Switzerland',
    'Syria',
    'Taiwan',
    'Tajikistan',
    'Tanzania',
    'Thailand',
    'Timor-Leste',
    'Togo',
    'Tonga',
    'Trinidad and Tobago',
    'Tunisia',
    'Turkey',
    'Turkmenistan',
    'Tuvalu',
    'Uganda',
    'Ukraine',
    'United Arab Emirates',
    'United Kingdom',
    'United States',
    'Uruguay',
    'Uzbekistan',
    'Vanuatu',
    'Vatican City',
    'Venezuela',
    'Vietnam',
    'Yemen',
    'Zambia',
    'Zimbabwe',
  ]; 

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="p-6 space-y-4">
        <button
          onClick={() => router.push('/app/companies')}
          className="inline-flex items-center gap-2 border px-4 py-2 rounded-md hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          Back to Companies
        </button>

        <div className="rounded-2xl border bg-white p-6">
          <div className="text-lg font-semibold">Company not found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <button
        onClick={() => router.push('/app/companies')}
        className="inline-flex items-center gap-2 border px-4 py-2 rounded-md hover:bg-slate-50"
      >
        <ArrowLeft size={16} />
        Back to Companies
      </button>

      <div className="rounded-2xl border bg-white p-6">
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Building2 className="h-6 w-6 text-slate-500" />
              <h1 className="text-3xl font-bold">
                {editing ? form.name || 'Company' : company.name}
              </h1>
            </div>

            <div className="text-sm text-slate-500">
              Company code:{' '}
              <span className="font-medium text-slate-700">
                {editing ? form.company_code || '-' : company.company_code}
              </span>
            </div>

            <div className="text-sm text-slate-500">
              Type: <span className="font-medium text-slate-700">{getTypeLabel()}</span>
            </div>

            <div className="text-sm text-slate-500">
              Rating: <span className="font-medium text-slate-700">{renderRating()}</span>
            </div>

            <div className="text-sm text-slate-500">
              Created by <span className="font-medium text-slate-700">{creatorName}</span>:{' '}
              <span className="font-medium text-slate-700">
                {company.created_at ? new Date(company.created_at).toLocaleString() : '-'}
              </span>
            </div>
          </div>

          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-2 border px-4 py-2 rounded-md hover:bg-slate-50"
            >
              <Pencil size={16} />
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save'
                )}
              </button>

              <button
                onClick={cancelEdit}
                disabled={saving}
                className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border bg-white p-6 space-y-4">
          <h2 className="text-xl font-semibold">Company Information</h2>

          {!editing ? (
            <div className="grid grid-cols-1 gap-4 text-sm">
              {company.is_carrier && (
                <>
                <div>
                  <div className="text-slate-500">CMR insurance number</div>
                  <div className="font-medium">{company.cmr_insurance_number || '-'}</div>
                </div>

                <div>
                  <div className="text-slate-500">Valid from</div>
                  <div className="font-medium">{company.cmr_insurance_valid_from || '-'}</div>
                </div>

                <div>
  <div className="text-slate-500">Valid until</div>
  <div className="font-medium flex items-center gap-2">
    <span>{company.cmr_insurance_valid_until || '-'}</span>
    {getCmrStatusBadge()}
  </div>
</div>

                <div>
                  <div className="text-slate-500">Insurance amount (€)</div>
                  <div className="font-medium">
                    {company.cmr_insurance_amount ? `${company.cmr_insurance_amount} €` : '-'}
                  </div>
                </div>
              </>
            )}

              <div>
                <div className="text-slate-500">Company name</div>
                <div className="font-medium">{company.name || '-'}</div>
              </div>

              <div>
                <div className="text-slate-500">Company code</div>
                <div className="font-medium">{company.company_code || '-'}</div>
              </div>

              <div>
  <div className="text-slate-500">VAT code</div>
  <div className="font-medium">{company.vat_code || '-'}</div>
</div>

<div>
  <div className="text-slate-500">Payment term (days)</div>
  <div className="font-medium">{company.payment_term_days ?? '-'}</div>
</div>

<div>
  <div className="text-slate-500">Type</div>
  <div className="font-medium">{getTypeLabel()}</div>
</div>

              <div>
                <div className="text-slate-500">Rating</div>
                <div className="font-medium">{renderRating()}</div>
              </div>
            </div>
) : (
  <div className="grid grid-cols-1 gap-4 text-sm">
    {form.is_carrier && (
      <div className="rounded-xl border border-slate-200 p-4 space-y-4 bg-slate-50">
        <div className="text-sm font-semibold text-slate-900">
          CMR Insurance
        </div>

        <div>
          <div className="text-slate-500 mb-1">Insurance number</div>
          <input
            value={form.cmr_insurance_number}
            onChange={(e) => update('cmr_insurance_number', e.target.value)}
            className="w-full border rounded-md px-3 py-2 bg-white"
          />
        </div>

        <div>
          <div className="text-slate-500 mb-1">Valid from</div>
          <input
            type="date"
            value={form.cmr_insurance_valid_from}
            onChange={(e) => update('cmr_insurance_valid_from', e.target.value)}
            className="w-full border rounded-md px-3 py-2 bg-white"
          />
        </div>

        <div>
          <div className="text-slate-500 mb-1">Valid until</div>
          <input
            type="date"
            value={form.cmr_insurance_valid_until}
            onChange={(e) => update('cmr_insurance_valid_until', e.target.value)}
            className="w-full border rounded-md px-3 py-2 bg-white"
          />
        </div>

        <div>
          <div className="text-slate-500 mb-1">Insurance amount (€)</div>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.cmr_insurance_amount}
            onChange={(e) => update('cmr_insurance_amount', e.target.value)}
            className="w-full border rounded-md px-3 py-2 bg-white"
          />
        </div>
      </div>
    )}

<div>
  <div className="text-slate-500 mb-1">Company name</div>
  <input
    value={form.name}
    onChange={(e) => update('name', e.target.value)}
    className="w-full border rounded-md px-3 py-2"
  />

  {checkingName ? (
    <div className="mt-1 text-xs text-slate-500">
      Checking company name...
    </div>
  ) : nameExists ? (
    <div className="mt-1 text-xs text-red-600">
      Company with this name already exists
    </div>
  ) : null}
</div>

<div>
  <div className="text-slate-500 mb-1">Company code</div>
  <input
    value={form.company_code}
    onChange={(e) => update('company_code', e.target.value)}
    className="w-full border rounded-md px-3 py-2"
  />

  {checkingCode ? (
    <div className="mt-1 text-xs text-slate-500">
      Checking company code...
    </div>
  ) : codeExists ? (
    <div className="mt-1 text-xs text-red-600">
      Company with this code already exists
    </div>
  ) : null}
</div>

    <div>
      <div className="text-slate-500 mb-1">VAT code</div>
      <input
        value={form.vat_code}
        onChange={(e) => update('vat_code', e.target.value)}
        className="w-full border rounded-md px-3 py-2"
      />
    </div>

    <div className="flex gap-6 text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={!!form.is_client}
          onChange={(e) => update('is_client', e.target.checked)}
        />
        Client
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={!!form.is_carrier}
          onChange={(e) => update('is_carrier', e.target.checked)}
        />
        Carrier
      </label>
    </div>

    <div>
      <div className="text-slate-500 text-sm">Rating</div>
      <div className="font-medium text-sm">{renderRating()}</div>
    </div>
  </div>
)}
        </div>

        <div className="rounded-2xl border bg-white p-6 space-y-4">
          <h2 className="text-xl font-semibold">Contact & Address</h2>

          {!editing ? (
            <div className="grid grid-cols-1 gap-4 text-sm">
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 mt-1 text-slate-400" />
                <div>
                <div className="text-slate-500">Address</div>
                <div className="font-medium">
  {[company.address, company.city, company.postal_code, company.country].filter(Boolean).join(', ') || '-'}
</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Phone className="h-4 w-4 mt-1 text-slate-400" />
                <div>
                  <div className="text-slate-500">Phone</div>
                  <div className="font-medium">{company.phone || '-'}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 mt-1 text-slate-400" />
                <div>
                  <div className="text-slate-500">Email</div>
                  <div className="font-medium">{company.email || '-'}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Globe className="h-4 w-4 mt-1 text-slate-400" />
                <div>
                  <div className="text-slate-500">Website</div>
                  <div className="font-medium">{company.website || '-'}</div>
                </div>
              </div>
            </div>
) : (
  <div className="grid grid-cols-1 gap-4 text-sm">
    <div>
      <div className="text-slate-500 mb-1">Address</div>
      <input
        value={form.address}
        onChange={(e) => update('address', e.target.value)}
        className="w-full border rounded-md px-3 py-2"
      />
    </div>

    <div>
      <div className="text-slate-500 mb-1">Country</div>
      <input
        type="text"
        list="edit-country-options"
        placeholder="Start typing country..."
        value={form.country}
        onChange={(e) => update('country', e.target.value)}
        className="w-full border rounded-md px-3 py-2"
      />
      <datalist id="edit-country-options">
        {countries.map((country) => (
          <option key={country} value={country} />
        ))}
      </datalist>
    </div>

    <div>
      <div className="text-slate-500 mb-1">Postal code</div>
      <input
        value={form.postal_code}
        onChange={(e) => update('postal_code', e.target.value)}
        className="w-full border rounded-md px-3 py-2"
      />
    </div>

    <div>
      <div className="text-slate-500 mb-1">City</div>
      <input
        value={form.city}
        onChange={(e) => update('city', e.target.value)}
        className="w-full border rounded-md px-3 py-2"
      />
    </div>

    <div>
      <div className="text-slate-500 mb-1">Phone</div>
      <input
        value={form.phone}
        onChange={(e) => update('phone', e.target.value)}
        className="w-full border rounded-md px-3 py-2"
      />
    </div>

    <div>
  <div className="text-slate-500 mb-1">Website</div>
  <input
    value={form.website}
    onChange={(e) => update('website', e.target.value)}
    className="w-full border rounded-md px-3 py-2"
  />
</div>

<div>
  <div className="text-slate-500 mb-1">Payment term (days)</div>
  <input
    type="number"
    min="0"
    value={form.payment_term_days}
    onChange={(e) => update('payment_term_days', e.target.value)}
    className="w-full border rounded-md px-3 py-2"
  />
</div>

    <div>
      <div className="text-slate-500 mb-1">Website</div>
      <input
        value={form.website}
        onChange={(e) => update('website', e.target.value)}
        className="w-full border rounded-md px-3 py-2"
      />
    </div>
  </div>
)}
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-6 space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-slate-500" />
          <h2 className="text-xl font-semibold">Notes</h2>
        </div>

        {!editing ? (
          <div className="text-sm text-slate-700 whitespace-pre-wrap">
            {company.notes || '-'}
          </div>
        ) : (
          <textarea
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="Notes"
            className="w-full min-h-[120px] border rounded-md px-3 py-2"
          />
        )}
      </div>

      <div className="rounded-2xl border bg-white p-6 space-y-4">
        <h2 className="text-xl font-semibold">Contacts</h2>

        <div className="space-y-3">
          {contacts.length === 0 ? (
            <div className="text-sm text-slate-500">No contacts yet</div>
          ) : (
            contacts.map((c) => (
              <div key={c.id} className="border rounded-lg p-4 text-sm hover:bg-slate-50 transition">
                {editingContact === c.id ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <div className="text-slate-500 mb-1">First name</div>
                        <input
                          value={contactForm.first_name || ''}
                          onChange={(e) =>
                            setContactForm({ ...contactForm, first_name: e.target.value })
                          }
                          className="border rounded-md px-3 py-2 w-full"
                        />
                      </div>

                      <div>
                        <div className="text-slate-500 mb-1">Last name</div>
                        <input
                          value={contactForm.last_name || ''}
                          onChange={(e) =>
                            setContactForm({ ...contactForm, last_name: e.target.value })
                          }
                          className="border rounded-md px-3 py-2 w-full"
                        />
                      </div>

                      <div>
                        <div className="text-slate-500 mb-1">Position</div>
                        <input
                          value={contactForm.position || ''}
                          onChange={(e) =>
                            setContactForm({ ...contactForm, position: e.target.value })
                          }
                          className="border rounded-md px-3 py-2 w-full"
                        />
                      </div>

                      <div>
                        <div className="text-slate-500 mb-1">Phone</div>
                        <input
                          value={contactForm.phone || ''}
                          onChange={(e) =>
                            setContactForm({ ...contactForm, phone: e.target.value })
                          }
                          className="border rounded-md px-3 py-2 w-full"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <div className="text-slate-500 mb-1">Email</div>
                        <input
                          value={contactForm.email || ''}
                          onChange={(e) =>
                            setContactForm({ ...contactForm, email: e.target.value })
                          }
                          className="border rounded-md px-3 py-2 w-full"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="text-slate-500 mb-1">Notes</div>
                      <textarea
                        value={contactForm.notes || ''}
                        onChange={(e) =>
                          setContactForm({ ...contactForm, notes: e.target.value })
                        }
                        className="border rounded-md px-3 py-2 w-full min-h-[80px]"
                      />
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={saveContact}
                        className="bg-slate-900 text-white px-4 py-2 rounded-md"
                      >
                        Save
                      </button>

                      <button
                        onClick={() => {
                          setEditingContact(null);
                          setContactForm({});
                        }}
                        className="border px-4 py-2 rounded-md"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-4">
                      <div className="grid grid-cols-4 gap-4 items-center text-sm flex-1">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                            {`${c.first_name?.[0] || ''}${c.last_name?.[0] || ''}`.toUpperCase() || 'C'}
                          </div>

                          <div className="font-medium">
                            {c.first_name} {c.last_name || ''}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-slate-500">
                          <Briefcase className="h-4 w-4 text-slate-400" />
                          <span>{c.position || '-'}</span>
                        </div>

                        <div className="flex items-center gap-2 text-slate-500">
                          <Phone className="h-4 w-4 text-slate-400" />
                          <span>{c.phone || '-'}</span>
                        </div>

                        <div className="flex items-center gap-2 text-slate-500">
                          <Mail className="h-4 w-4 text-slate-400" />
                          <span>{c.email || '-'}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingContact(c.id);
                            setContactForm(c);
                          }}
                          className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                        >
                          Edit
                        </button>

                        <button
                          onClick={async () => {
                            if (!confirm('Delete this contact?')) return;

                            const res = await fetch('/api/company-contacts/delete', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ id: c.id }),
                            });

                            const data = await res.json();

                            if (!res.ok) {
                              toast.error(data.error || 'Delete failed');
                              return;
                            }

                            toast.success('Contact deleted');
                            fetchContacts();
                          }}
                          className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {c.notes && (
                      <div className="text-slate-500 mt-2 text-sm">
                        {c.notes}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))
          )}
        </div>

        <div className="border-t pt-4 space-y-3">
          {!showAddContact ? (
            <button
              onClick={() => setShowAddContact(true)}
              className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Add contact
            </button>
          ) : (
            <>
              <div className="text-sm font-medium">Add contact</div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  placeholder="First name"
                  value={newContact.first_name}
                  onChange={(e) =>
                    setNewContact({ ...newContact, first_name: e.target.value })
                  }
                  className="border rounded-md px-3 py-2"
                />

                <input
                  placeholder="Last name"
                  value={newContact.last_name}
                  onChange={(e) =>
                    setNewContact({ ...newContact, last_name: e.target.value })
                  }
                  className="border rounded-md px-3 py-2"
                />

                <input
                  placeholder="Position"
                  value={newContact.position}
                  onChange={(e) =>
                    setNewContact({ ...newContact, position: e.target.value })
                  }
                  className="border rounded-md px-3 py-2"
                />

                <input
                  placeholder="Phone"
                  value={newContact.phone}
                  onChange={(e) =>
                    setNewContact({ ...newContact, phone: e.target.value })
                  }
                  className="border rounded-md px-3 py-2"
                />

                <input
                  placeholder="Email"
                  value={newContact.email}
                  onChange={(e) =>
                    setNewContact({ ...newContact, email: e.target.value })
                  }
                  className="border rounded-md px-3 py-2 md:col-span-2"
                />
              </div>

              <textarea
                placeholder="Notes"
                value={newContact.notes}
                onChange={(e) =>
                  setNewContact({ ...newContact, notes: e.target.value })
                }
                className="border rounded-md px-3 py-2 w-full min-h-[100px]"
              />

              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    await createContact();
                    setShowAddContact(false);
                  }}
                  className="bg-slate-900 text-white px-4 py-2 rounded-md"
                >
                  Save
                </button>

                <button
                  onClick={() => {
                    setShowAddContact(false);
                    setNewContact({
                      first_name: '',
                      last_name: '',
                      position: '',
                      phone: '',
                      email: '',
                      notes: '',
                    });
                  }}
                  className="border px-4 py-2 rounded-md"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-6 space-y-4">
        <h2 className="text-xl font-semibold">Comments</h2>

        <div className="flex items-center gap-2 text-xl">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setCommentRating(star)}
              className={
                commentRating && star <= commentRating
                  ? 'text-yellow-500'
                  : 'text-slate-300'
              }
            >
              ★
            </button>
          ))}
        </div>

        <textarea
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="Write comment..."
          className="w-full border rounded-md px-3 py-2 min-h-[80px]"
        />

        <button
          onClick={createComment}
          className="bg-slate-900 text-white px-4 py-2 rounded-md"
        >
          Add comment
        </button>

        <div className="space-y-3 pt-3">
          {comments.map((c) => (
            <div key={c.id} className="border rounded-md p-3 text-sm">
              {editingCommentId === c.id ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xl">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setCommentForm({ ...commentForm, rating: star })}
                        className={
                          commentForm.rating && star <= commentForm.rating
                            ? 'text-yellow-500'
                            : 'text-slate-300'
                        }
                      >
                        ★
                      </button>
                    ))}
                  </div>

                  <textarea
                    value={commentForm.comment || ''}
                    onChange={(e) =>
                      setCommentForm({ ...commentForm, comment: e.target.value })
                    }
                    className="w-full border rounded-md px-3 py-2 min-h-[80px]"
                  />

                  <div className="flex gap-3">
                    <button
                      onClick={async () => {
                        const res = await fetch('/api/company-comments/update', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(commentForm),
                        });

                        const data = await res.json();

                        if (!res.ok) {
                          toast.error(data.error || 'Update failed');
                          return;
                        }

                        toast.success('Comment updated');
                        setEditingCommentId(null);
                        setCommentForm({});
                        fetchComments();
                      }}
                      className="bg-slate-900 text-white px-4 py-2 rounded-md"
                    >
                      Save
                    </button>

                    <button
                      onClick={() => {
                        setEditingCommentId(null);
                        setCommentForm({});
                      }}
                      className="border px-4 py-2 rounded-md"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="text-yellow-500 text-sm">
                        {'★'.repeat(c.rating || 0)}
                      </div>

                      <span className="font-medium">
                        {c.user_profiles?.first_name} {c.user_profiles?.last_name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">
                        {new Date(c.created_at).toLocaleDateString()}
                      </span>

                      {canManageComment(c) && (
                        <>
                          <button
                            onClick={() => {
                              setEditingCommentId(c.id);
                              setCommentForm({
                                id: c.id,
                                comment: c.comment,
                                rating: c.rating || null,
                              });
                            }}
                            className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                          >
                            Edit
                          </button>

                          <button
                            onClick={async () => {
                              if (!confirm('Delete comment?')) return;

                              const res = await fetch('/api/company-comments/delete', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: c.id }),
                              });

                              const data = await res.json();

                              if (!res.ok) {
                                toast.error(data.error || 'Delete failed');
                                return;
                              }

                              toast.success('Comment deleted');
                              fetchComments();
                            }}
                            className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-1 text-slate-700">
                    {c.comment}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}