'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { ArrowLeft, Loader2, Pencil, Truck } from 'lucide-react';
import { toast } from 'sonner';

type TripDetails = {
  id: string;
  trip_number: string;
  status: 'unconfirmed' | 'confirmed' | 'completed';
  truck_plate: string | null;
  trailer_plate: string | null;
  driver_name: string | null;
  price: number | null;
  payment_term_days: number | null;
  payment_type: string | null;
  vat_rate: string | null;
  notes: string | null;
  is_groupage: boolean;
  created_at: string | null;
  updated_at: string | null;
  carrier: {
    name: string | null;
    company_code: string | null;
  } | null;
  created_by_user: {
    first_name: string | null;
    last_name: string | null;
  } | null;
};

type CarrierOption = {
  id: string;
  name: string;
  company_code: string;
  payment_term_days: number | null;
};

export default function TripPage() {
  const params = useParams();
  const router = useRouter();
  const tripId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [trip, setTrip] = useState<TripDetails | null>(null);
  const [orderDraft, setOrderDraft] = useState<{
    exists: boolean;
    status: string | null;
    updated_at: string | null;
  } | null>(null);
  const [carriers, setCarriers] = useState<CarrierOption[]>([]);
const [carriersLoading, setCarriersLoading] = useState(false);
const [carrierSearch, setCarrierSearch] = useState('');
  const [editing, setEditing] = useState(false);
const [saving, setSaving] = useState(false);

const [form, setForm] = useState({
  id: '',
  status: 'unconfirmed' as 'unconfirmed' | 'confirmed' | 'completed',
  carrier_company_id: '',
  truck_plate: '',
  trailer_plate: '',
  driver_name: '',
  price: '',
  payment_term_days: '',
  payment_type: '',
  vat_rate: '',
  notes: '',
  is_groupage: false,
});

const update = (field: string, value: any) => {
  setForm((prev) => ({ ...prev, [field]: value }));
};

  useEffect(() => {
    fetchTrip();
  }, [tripId]);

  useEffect(() => {
    fetchCarriers();
  }, []);

  const fetchTrip = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('trips')
        .select(`
          id,
          trip_number,
          status,
          carrier_company_id,
          truck_plate,
          trailer_plate,
          driver_name,
          price,
          payment_term_days,
          payment_type,
          vat_rate,
          notes,
          is_groupage,
          created_at,
          updated_at,
          carrier:carrier_company_id (
            name,
            company_code
          ),
          created_by_user:created_by (
            first_name,
            last_name
          )
        `)
        .eq('id', tripId)
        .single();

      if (error) {
        toast.error('Failed to load trip');
        return;
      }

      const normalized = {
        id: (data as any).id,
        trip_number: (data as any).trip_number,
        status: (data as any).status,
        carrier_company_id: (data as any).carrier_company_id ?? null,
        truck_plate: (data as any).truck_plate ?? null,
        trailer_plate: (data as any).trailer_plate ?? null,
        driver_name: (data as any).driver_name ?? null,
        price: (data as any).price ?? null,
        payment_term_days: (data as any).payment_term_days ?? null,
        payment_type: (data as any).payment_type ?? null,
        vat_rate: (data as any).vat_rate ?? null,
        notes: (data as any).notes ?? null,
        is_groupage: !!(data as any).is_groupage,
        created_at: (data as any).created_at ?? null,
        updated_at: (data as any).updated_at ?? null,
        carrier: Array.isArray((data as any).carrier)
          ? (data as any).carrier[0] ?? null
          : (data as any).carrier,
        created_by_user: Array.isArray((data as any).created_by_user)
          ? (data as any).created_by_user[0] ?? null
          : (data as any).created_by_user,
      };


      setTrip(normalized as TripDetails);
      const draftRes = await fetch(`/api/trips/order-draft?tripId=${tripId}`);
const draftData = await draftRes.json();

if (draftRes.ok && draftData?.draft) {
  setOrderDraft({
    exists: true,
    status: draftData.draft.status ?? null,
    updated_at: draftData.draft.updated_at ?? null,
  });
} else {
  setOrderDraft({
    exists: false,
    status: null,
    updated_at: null,
  });
}
      setForm({
        id: normalized.id,
        status: normalized.status,
        carrier_company_id: normalized.carrier_company_id ?? '',
        truck_plate: normalized.truck_plate ?? '',
        trailer_plate: normalized.trailer_plate ?? '',
        driver_name: normalized.driver_name ?? '',
        price:
          normalized.price !== null && normalized.price !== undefined
            ? String(normalized.price)
            : '',
        payment_term_days:
          normalized.payment_term_days !== null && normalized.payment_term_days !== undefined
            ? String(normalized.payment_term_days)
            : '',
        payment_type: normalized.payment_type ?? '',
        vat_rate: normalized.vat_rate ?? '',
        notes: normalized.notes ?? '',
        is_groupage: !!normalized.is_groupage,
      });

      setCarrierSearch(
        normalized.carrier
          ? `${normalized.carrier.name}${normalized.carrier.company_code ? ` (${normalized.carrier.company_code})` : ''}`
          : ''
      );
      
    } catch (error) {
      toast.error('Failed to load trip');
    } finally {
      setLoading(false);
    }
  };


  const fetchCarriers = async () => {
    try {
      setCarriersLoading(true);
  
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, company_code, payment_term_days')
        .eq('is_carrier', true)
        .order('name', { ascending: true });
  
      if (error) {
        toast.error('Failed to load carriers');
        return;
      }
  
      setCarriers((data || []) as CarrierOption[]);
    } catch (error) {
      toast.error('Failed to load carriers');
    } finally {
      setCarriersLoading(false);
    }
  };

  const getStatusLabel = (status: TripDetails['status']) => {
    if (status === 'unconfirmed') return 'Unconfirmed';
    if (status === 'confirmed') return 'Confirmed';
    if (status === 'completed') return 'Completed';
    return status;
  };

  const getStatusBadgeClass = (status: TripDetails['status']) => {
    if (status === 'unconfirmed') {
      return 'bg-yellow-100 text-yellow-800';
    }
    if (status === 'confirmed') {
      return 'bg-blue-100 text-blue-800';
    }
    return 'bg-green-100 text-green-800';
  };

  const filteredCarriers = useMemo(() => {
    const q = carrierSearch.trim().toLowerCase();
  
    if (!q) return carriers.slice(0, 20);
  
    return carriers
      .filter((carrier) =>
        carrier.name?.toLowerCase().includes(q) ||
        carrier.company_code?.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [carriers, carrierSearch]);

  const selectedCarrier = carriers.find(
    (carrier) => carrier.id === form.carrier_company_id
  );
  
  const selectedCarrierLabel = selectedCarrier
    ? `${selectedCarrier.name}${selectedCarrier.company_code ? ` (${selectedCarrier.company_code})` : ''}`
    : '';

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="p-6 space-y-4">
        <button
          onClick={() => router.push('/app/trips')}
          className="inline-flex items-center gap-2 border px-4 py-2 rounded-md hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          Back to Trips
        </button>

        <div className="rounded-2xl border bg-white p-6">
          <div className="text-lg font-semibold">Trip not found</div>
        </div>
      </div>
    );
  }

  const createdBy =
    trip.created_by_user?.first_name || trip.created_by_user?.last_name
      ? `${trip.created_by_user?.first_name || ''} ${trip.created_by_user?.last_name || ''}`.trim()
      : '-';

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <button
        onClick={() => router.push('/app/trips')}
        className="inline-flex items-center gap-2 border px-4 py-2 rounded-md hover:bg-slate-50"
      >
        <ArrowLeft size={16} />
        Back to Trips
      </button>

      <div className="rounded-2xl border bg-white p-6">
  <div className="flex items-start justify-between gap-6">
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Truck className="h-6 w-6 text-slate-500" />
        <h1 className="text-3xl font-bold">{trip.trip_number}</h1>
      </div>

      <div>
        <span
          className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${getStatusBadgeClass(
            trip.status
          )}`}
        >
          {getStatusLabel(trip.status)}
        </span>
      </div>

      <div className="text-sm text-slate-500">
        Created by <span className="font-medium text-slate-700">{createdBy}</span>
      </div>

      <div className="text-sm text-slate-500">
        Created at{' '}
        <span className="font-medium text-slate-700">
          {trip.created_at ? new Date(trip.created_at).toLocaleString() : '-'}
        </span>
      </div>

      <div className="text-sm text-slate-500">
        Updated at{' '}
        <span className="font-medium text-slate-700">
          {trip.updated_at ? new Date(trip.updated_at).toLocaleString() : '-'}
        </span>
      </div>
      <div className="text-sm text-slate-500">
  Order draft{' '}
  <span className="font-medium text-slate-700">
    {orderDraft?.exists ? 'Saved' : 'Not created'}
  </span>
</div>

{orderDraft?.exists && orderDraft?.updated_at && (
  <div className="text-sm text-slate-500">
    Order draft updated{' '}
    <span className="font-medium text-slate-700">
      {new Date(orderDraft.updated_at).toLocaleString()}
    </span>
  </div>
)}
    </div>

    {!editing ? (
  <div className="flex items-center gap-3">
<button
  type="button"
  onClick={async () => {
    try {
      const res = await fetch('/api/trips/create-order-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to create order');
        return;
      }

      const html = await res.text();
      const newWindow = window.open('', '_blank');

      if (!newWindow) {
        toast.error('Popup blocked');
        return;
      }

      newWindow.document.open();
      newWindow.document.write(html);
      newWindow.document.close();
    } catch (error) {
      toast.error('Unexpected error');
    }
  }}
  className="inline-flex items-center gap-2 border px-4 py-2 rounded-md hover:bg-slate-50"
>
  {orderDraft?.exists ? 'Edit Order' : 'Create Order'}
</button>

    <button
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-2 border px-4 py-2 rounded-md hover:bg-slate-50"
    >
      <Pencil size={16} />
      Edit
    </button>
  </div>
) : (
      <div className="flex items-center gap-3">
        <button
          onClick={async () => {
            try {
              setSaving(true);
          
              const payload = {
                ...form,
                price: form.price === '' ? null : Number(form.price),
                payment_term_days:
                  form.payment_term_days === '' ? null : Number(form.payment_term_days),
              };
          
              const res = await fetch('/api/trips/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });
          
              const data = await res.json();
          
              if (!res.ok) {
                toast.error(data.error || 'Failed to update trip');
                return;
              }
          
              toast.success('Trip updated');
              setEditing(false);
              await fetchTrip();
            } catch (error) {
              toast.error('Unexpected error');
            } finally {
              setSaving(false);
            }
          }}
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
          onClick={() => {
            setEditing(false);
            if (trip) {
              setForm({
                id: trip.id,
                status: trip.status,
                carrier_company_id: '',
                truck_plate: trip.truck_plate ?? '',
                trailer_plate: trip.trailer_plate ?? '',
                driver_name: trip.driver_name ?? '',
                price:
                  trip.price !== null && trip.price !== undefined ? String(trip.price) : '',
                payment_term_days:
                  trip.payment_term_days !== null && trip.payment_term_days !== undefined
                    ? String(trip.payment_term_days)
                    : '',
                payment_type: trip.payment_type ?? '',
                vat_rate: trip.vat_rate ?? '',
                notes: trip.notes ?? '',
                is_groupage: !!trip.is_groupage,
              });
            }
          }}
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
    <h2 className="text-xl font-semibold">Trip Information</h2>

    {!editing ? (
      <div className="grid grid-cols-1 gap-4 text-sm">
        <div>
          <div className="text-slate-500">Carrier</div>
          <div className="font-medium">
            {trip.carrier?.name || '-'}
            {trip.carrier?.company_code ? ` (${trip.carrier.company_code})` : ''}
          </div>
        </div>

        <div>
          <div className="text-slate-500">Status</div>
          <div className="font-medium">{getStatusLabel(trip.status)}</div>
        </div>

        <div>
          <div className="text-slate-500">Driver</div>
          <div className="font-medium">{trip.driver_name || '-'}</div>
        </div>

        <div>
          <div className="text-slate-500">Truck plate</div>
          <div className="font-medium">{trip.truck_plate || '-'}</div>
        </div>

        <div>
          <div className="text-slate-500">Trailer plate</div>
          <div className="font-medium">{trip.trailer_plate || '-'}</div>
        </div>

        <div>
          <div className="text-slate-500">Groupage</div>
          <div className="font-medium">{trip.is_groupage ? 'Yes' : 'No'}</div>
        </div>
      </div>
    ) : (
      <div className="grid grid-cols-1 gap-4 text-sm">
<div className="space-y-2">
  <div className="text-slate-500 mb-1">Carrier</div>

  <input
    placeholder="Start typing carrier name or code..."
    value={carrierSearch}
    onChange={(e) => setCarrierSearch(e.target.value)}
    className="w-full border rounded-md px-3 py-2"
    disabled={carriersLoading}
  />

{carrierSearch.trim() !== '' && carrierSearch !== selectedCarrierLabel && (
    <div className="border rounded-md bg-white max-h-56 overflow-y-auto">
      {filteredCarriers.length === 0 ? (
        <div className="px-3 py-2 text-sm text-slate-500">No carriers found</div>
      ) : (
        filteredCarriers.map((carrier) => (
          <button
            key={carrier.id}
            type="button"
            onClick={() => {
              update('carrier_company_id', carrier.id);
              update(
                'payment_term_days',
                carrier.payment_term_days !== null && carrier.payment_term_days !== undefined
                  ? String(carrier.payment_term_days)
                  : ''
              );
              setCarrierSearch(
                `${carrier.name}${carrier.company_code ? ` (${carrier.company_code})` : ''}`
              );
            }}
            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b last:border-b-0"
          >
            {carrier.name}
            {carrier.company_code ? ` (${carrier.company_code})` : ''}
          </button>
        ))
      )}
    </div>
  )}
</div>

        <div>
          <div className="text-slate-500 mb-1">Status</div>
          <select
            value={form.status}
            onChange={(e) => update('status', e.target.value)}
            className="w-full border rounded-md px-3 py-2"
          >
            <option value="unconfirmed">Unconfirmed</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        <div>
          <div className="text-slate-500 mb-1">Driver</div>
          <input
            value={form.driver_name}
            onChange={(e) => update('driver_name', e.target.value)}
            className="w-full border rounded-md px-3 py-2"
          />
        </div>

        <div>
          <div className="text-slate-500 mb-1">Truck plate</div>
          <input
            value={form.truck_plate}
            onChange={(e) => update('truck_plate', e.target.value)}
            className="w-full border rounded-md px-3 py-2"
          />
        </div>

        <div>
          <div className="text-slate-500 mb-1">Trailer plate</div>
          <input
            value={form.trailer_plate}
            onChange={(e) => update('trailer_plate', e.target.value)}
            className="w-full border rounded-md px-3 py-2"
          />
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.is_groupage}
            onChange={(e) => update('is_groupage', e.target.checked)}
          />
          Groupage trip
        </label>
      </div>
    )}
  </div>

  <div className="rounded-2xl border bg-white p-6 space-y-4">
    <h2 className="text-xl font-semibold">Financial Information</h2>

    {!editing ? (
      <div className="grid grid-cols-1 gap-4 text-sm">
        <div>
          <div className="text-slate-500">Price</div>
          <div className="font-medium">
            {trip.price !== null && trip.price !== undefined ? `${trip.price} €` : '-'}
          </div>
        </div>

        <div>
          <div className="text-slate-500">Payment term</div>
          <div className="font-medium">
            {trip.payment_term_days !== null && trip.payment_term_days !== undefined
              ? `${trip.payment_term_days} days`
              : '-'}
          </div>
        </div>

        <div>
          <div className="text-slate-500">Payment type</div>
          <div className="font-medium">{trip.payment_type || '-'}</div>
        </div>

        <div>
          <div className="text-slate-500">VAT</div>
          <div className="font-medium">{trip.vat_rate || '-'}</div>
        </div>
      </div>
    ) : (
      <div className="grid grid-cols-1 gap-4 text-sm">
        <div>
          <div className="text-slate-500 mb-1">Price</div>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.price}
            onChange={(e) => update('price', e.target.value)}
            className="w-full border rounded-md px-3 py-2"
          />
        </div>

        <div>
          <div className="text-slate-500 mb-1">Payment term</div>
          <input
            type="number"
            min="0"
            value={form.payment_term_days}
            onChange={(e) => update('payment_term_days', e.target.value)}
            className="w-full border rounded-md px-3 py-2"
          />
        </div>

        <div>
          <div className="text-slate-500 mb-1">Payment type</div>
          <select
            value={form.payment_type}
            onChange={(e) => update('payment_type', e.target.value)}
            className="w-full border rounded-md px-3 py-2"
          >
            <option value="">Select payment type</option>
            <option value="bank_after_scan">Bank transfer after scan</option>
            <option value="bank_after_originals">Bank transfer after original documents</option>
            <option value="cash">Cash</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <div className="text-slate-500 mb-1">VAT</div>
          <select
            value={form.vat_rate}
            onChange={(e) => update('vat_rate', e.target.value)}
            className="w-full border rounded-md px-3 py-2"
          >
            <option value="">Select VAT</option>
            <option value="21%">21%</option>
            <option value="0%">0%</option>
          </select>
        </div>
      </div>
    )}
  </div>
</div>

      <div className="rounded-2xl border bg-white p-6 space-y-4">
  <h2 className="text-xl font-semibold">Notes</h2>

  {!editing ? (
    <div className="text-sm text-slate-700 whitespace-pre-wrap">
      {trip.notes || '-'}
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
    </div>
  );
}