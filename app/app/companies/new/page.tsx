'use client';

import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';

export default function NewCompanyPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [nameExists, setNameExists] = useState(false);
  const [codeExists, setCodeExists] = useState(false);
  const [checkingName, setCheckingName] = useState(false);
  const [checkingCode, setCheckingCode] = useState(false);


  const [form, setForm] = useState({
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
    cmr_insurance_valid_until: '',
    cmr_insurance_valid_from: '',
    cmr_insurance_amount: '',
    notes: '',
  });
  
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

  const update = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    const checkName = async () => {
      const name = form.name.trim();

      if (!name) {
        setNameExists(false);
        return;
      }

      try {
        setCheckingName(true);

        const res = await fetch('/api/companies/check-exists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field: 'name', value: name }),
        });

        const data = await res.json();

        if (res.ok) {
          setNameExists(!!data.exists);
        }
      } finally {
        setCheckingName(false);
      }
    };

    const timeout = setTimeout(() => {
      checkName();
    }, 400);

    return () => clearTimeout(timeout);
  }, [form.name]);

  useEffect(() => {
    const checkCode = async () => {
      const code = form.company_code.trim();

      if (!code) {
        setCodeExists(false);
        return;
      }

      try {
        setCheckingCode(true);

        const res = await fetch('/api/companies/check-exists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field: 'company_code', value: code }),
        });

        const data = await res.json();

        if (res.ok) {
          setCodeExists(!!data.exists);
        }
      } finally {
        setCheckingCode(false);
      }
    };

    const timeout = setTimeout(() => {
      checkCode();
    }, 400);

    return () => clearTimeout(timeout);
  }, [form.company_code]);

  const saveCompany = async () => {
    if (!form.company_code || !form.name) {
      toast.error('Company code and name are required');
      return;
    }

    if (nameExists) {
      toast.error('Company with this name already exists');
      return;
    }

    if (codeExists) {
      toast.error('Company with this code already exists');
      return;
    }

    if (form.is_carrier) {
      if (
        !form.cmr_insurance_number.trim() ||
        !form.cmr_insurance_valid_from ||
        !form.cmr_insurance_valid_until ||
        !form.cmr_insurance_amount
      ) {
        toast.error(
          'Carrier cannot be saved: CMR insurance number, valid from date, valid until date and amount are required'
        );
        return;
      }
    }

    setLoading(true);

    try {
      const payload = {
        ...form,
        payment_term_days:
          form.payment_term_days === '' ? null : Number(form.payment_term_days),
        cmr_insurance_amount: form.cmr_insurance_amount
          ? Number(form.cmr_insurance_amount)
          : null,
      };

      const res = await fetch('/api/companies/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to create company');
        return;
      }

      toast.success('Company created');
      router.push('/app/companies');
    } catch (error) {
      toast.error('Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Add Company</h1>

      <div className="space-y-4">
        <div>
          <input
            placeholder="Company name"
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
          <input
            placeholder="Company code"
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

        <input
          placeholder="VAT code"
          value={form.vat_code}
          onChange={(e) => update('vat_code', e.target.value)}
          className="w-full border rounded-md px-3 py-2"
        />

<div>
  <input
    list="country-options"
    placeholder="Country"
    value={form.country}
    onChange={(e) => update('country', e.target.value)}
    className="w-full border rounded-md px-3 py-2"
  />

  <datalist id="country-options">
    {countries.map((country) => (
      <option key={country} value={country} />
    ))}
  </datalist>
</div>

        <input
          placeholder="Postal code"
          value={form.postal_code}
          onChange={(e) => update('postal_code', e.target.value)}
          className="w-full border rounded-md px-3 py-2"
        />

        <input
          placeholder="City"
          value={form.city}
          onChange={(e) => update('city', e.target.value)}
          className="w-full border rounded-md px-3 py-2"
        />

        <input
          placeholder="Address"
          value={form.address}
          onChange={(e) => update('address', e.target.value)}
          className="w-full border rounded-md px-3 py-2"
        />

        <input
          placeholder="Phone"
          value={form.phone}
          onChange={(e) => update('phone', e.target.value)}
          className="w-full border rounded-md px-3 py-2"
        />

        <input
          placeholder="Email"
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
          className="w-full border rounded-md px-3 py-2"
        />

        <input
          placeholder="Website"
          value={form.website}
          onChange={(e) => update('website', e.target.value)}
          className="w-full border rounded-md px-3 py-2"
        />

<div>
  <input
    type="number"
    min="0"
    placeholder="Payment term (days)"
    value={form.payment_term_days}
    onChange={(e) => update('payment_term_days', e.target.value)}
    className="w-full border rounded-md px-3 py-2"
  />
</div>

        <div className="flex gap-6">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_client}
              onChange={(e) => update('is_client', e.target.checked)}
            />
            Client
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_carrier}
              onChange={(e) => update('is_carrier', e.target.checked)}
            />
            Carrier
          </label>
        </div>

        {form.is_carrier && (
          <div className="rounded-xl border border-slate-200 p-4 space-y-4 bg-slate-50">
            <div className="text-sm font-semibold text-slate-900">
              CMR Insurance
            </div>

            <div>
              <div className="text-xs text-slate-500 mb-1">
                CMR insurance number
              </div>
              <input
                value={form.cmr_insurance_number}
                onChange={(e) => update('cmr_insurance_number', e.target.value)}
                className="w-full border rounded-md px-3 py-2 bg-white"
              />
            </div>

            <div>
              <div className="text-xs text-slate-500 mb-1">
                Valid from
              </div>
              <input
                type="date"
                value={form.cmr_insurance_valid_from}
                onChange={(e) => update('cmr_insurance_valid_from', e.target.value)}
                className="w-full border rounded-md px-3 py-2 bg-white"
              />
            </div>

            <div>
              <div className="text-xs text-slate-500 mb-1">
                Valid until
              </div>
              <input
                type="date"
                value={form.cmr_insurance_valid_until}
                onChange={(e) => update('cmr_insurance_valid_until', e.target.value)}
                className="w-full border rounded-md px-3 py-2 bg-white"
              />
            </div>

            <div>
              <div className="text-xs text-slate-500 mb-1">
                Insurance amount (€)
              </div>
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

        <textarea
          placeholder="Notes"
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
          className="w-full border rounded-md px-3 py-2"
        />
      </div>

      <div className="flex gap-4">
        <button
          onClick={saveCompany}
          disabled={loading}
          className="bg-slate-900 text-white px-6 py-2 rounded-md"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin inline mr-2" size={16} />
              Saving...
            </>
          ) : (
            'Save'
          )}
        </button>

        <button
          onClick={() => router.push('/app/companies')}
          className="border px-6 py-2 rounded-md"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}