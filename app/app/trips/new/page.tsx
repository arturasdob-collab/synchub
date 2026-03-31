'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';

type CarrierOption = {
  id: string;
  name: string;
  company_code: string;
  payment_term_days: number | null;
};

export default function NewTripPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [carriersLoading, setCarriersLoading] = useState(true);
  const [carriers, setCarriers] = useState<CarrierOption[]>([]);

  const [form, setForm] = useState({
    status: 'unconfirmed',
    carrier_company_id: '',
    assigned_manager_id: '',
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

  const [carrierSearch, setCarrierSearch] = useState('');

  const update = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    fetchCarriers();
  }, []);

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

  const handleCarrierChange = (carrierId: string) => {
    const selectedCarrier = carriers.find((c) => c.id === carrierId);

    setForm((prev) => ({
      ...prev,
      carrier_company_id: carrierId,
      payment_term_days:
        selectedCarrier?.payment_term_days !== null &&
        selectedCarrier?.payment_term_days !== undefined
          ? String(selectedCarrier.payment_term_days)
          : '',
    }));
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

  const saveTrip = async () => {
    setLoading(true);

    try {
      const payload = {
        ...form,
        price: form.price === '' ? null : Number(form.price),
        payment_term_days:
          form.payment_term_days === '' ? null : Number(form.payment_term_days),
      };

      const res = await fetch('/api/trips/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to create trip');
        return;
      }

      toast.success(`Trip created: ${data.trip_number}`);
      router.push('/app/trips');
    } catch (error) {
      toast.error('Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">New Trip</h1>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Status</label>
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

        <div className="space-y-2">
  <label className="block text-sm font-medium">Carrier</label>

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
              handleCarrierChange(carrier.id);
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

        <input
          placeholder="Truck plate"
          value={form.truck_plate}
          onChange={(e) => update('truck_plate', e.target.value)}
          className="w-full border rounded-md px-3 py-2"
        />

        <input
          placeholder="Trailer plate"
          value={form.trailer_plate}
          onChange={(e) => update('trailer_plate', e.target.value)}
          className="w-full border rounded-md px-3 py-2"
        />

        <input
          placeholder="Driver name"
          value={form.driver_name}
          onChange={(e) => update('driver_name', e.target.value)}
          className="w-full border rounded-md px-3 py-2"
        />

        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Price"
          value={form.price}
          onChange={(e) => update('price', e.target.value)}
          className="w-full border rounded-md px-3 py-2"
        />

        <input
          type="number"
          min="0"
          placeholder="Payment term (days)"
          value={form.payment_term_days}
          onChange={(e) => update('payment_term_days', e.target.value)}
          className="w-full border rounded-md px-3 py-2"
        />

        <div>
          <label className="block text-sm font-medium mb-1">Payment type</label>
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
          <label className="block text-sm font-medium mb-1">VAT</label>
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

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.is_groupage}
            onChange={(e) => update('is_groupage', e.target.checked)}
          />
          Groupage trip
        </label>

        <textarea
          placeholder="Notes"
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
          className="w-full border rounded-md px-3 py-2 min-h-[120px]"
        />
      </div>

      <div className="flex gap-4">
        <button
          onClick={saveTrip}
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
         onClick={() => router.push('/app/trips')}
          className="border px-6 py-2 rounded-md"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}