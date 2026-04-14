export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

function text(value: string | number | null | undefined) {
  return value === null || value === undefined || value === '' ? '-' : String(value);
}

function empty(value?: string | null) {
  return value && value.trim() !== '' ? value : '';
}

function safeText(value: string | number | null | undefined) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function formatTimeValue(value: string | null | undefined) {
  const normalized = safeText(value);

  if (!normalized) return '';

  const match = normalized.match(/^(\d{1,2}:\d{2})/);
  return match ? match[1] : normalized;
}

function joinParts(
  parts: Array<string | number | null | undefined>,
  separator = ', '
) {
  return parts
    .map((part) => safeText(part))
    .filter(Boolean)
    .join(separator);
}

function joinLines(lines: Array<string | null | undefined>) {
  return lines
    .map((line) => safeText(line))
    .filter(Boolean)
    .join('\n');
}

function buildAlignedStopText(
  lines: Array<string | number | null | undefined>
) {
  const normalized = lines.map((line) => safeText(line));
  let lastNonEmptyIndex = -1;

  normalized.forEach((line, index) => {
    if (line !== '') {
      lastNonEmptyIndex = index;
    }
  });

  if (lastNonEmptyIndex === -1) {
    return '';
  }

  return normalized.slice(0, lastNonEmptyIndex + 1).join('\n');
}

function esc(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function POST(req: Request) {
  const cookieStore = cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { tripId } = body;

  if (!tripId) {
    return NextResponse.json({ error: 'Trip id is required' }, { status: 400 });
  }

  const { data: profile, error: profileError } = await serviceSupabase
    .from('user_profiles')
    .select('id, organization_id, role, is_super_admin, is_creator, first_name, last_name')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    return NextResponse.json({ error: 'User organization not found' }, { status: 400 });
  }

  const { data: trip, error: tripError } = await serviceSupabase
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
      created_by,
      carrier:carrier_company_id (
        name,
        company_code,
        vat_code,
        address,
        city,
        postal_code,
        country,
        phone
      )
    `)
    .eq('id', tripId)
    .single();

  if (tripError || !trip) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
  }

  const carrier = Array.isArray((trip as any).carrier)
    ? (trip as any).carrier[0] ?? null
    : (trip as any).carrier;

  const canAccess =
    (trip as any).created_by === user.id ||
    profile.is_super_admin === true ||
    profile.is_creator === true ||
    ['OWNER', 'ADMIN'].includes(profile.role);

  if (!canAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: draft } = await serviceSupabase
    .from('trip_order_drafts')
    .select(`
      id,
      trip_id,
      loading_date,
      loading_time_from,
      loading_time_to,
      loading_text,
      unloading_date,
      unloading_time_from,
      unloading_time_to,
      unloading_text,
      cargo_text,
      additional_conditions,
      carrier_representative,
      status,
      updated_by,
      created_at,
      updated_at
    `)
    .eq('trip_id', tripId)
    .maybeSingle();

  const { data: linkedOrderRows, error: linkedOrdersError } = await serviceSupabase
    .from('order_trip_links')
    .select(`
      id,
      linked_order:order_id (
        id,
        internal_order_number,
        client_order_number,
        loading_date,
        loading_time_from,
        loading_time_to,
        loading_address,
        loading_city,
        loading_postal_code,
        loading_country,
        loading_contact,
        loading_reference,
        loading_customs_info,
        unloading_date,
        unloading_time_from,
        unloading_time_to,
        unloading_address,
        unloading_city,
        unloading_postal_code,
        unloading_country,
        unloading_contact,
        unloading_reference,
        unloading_customs_info,
        shipper_name,
        consignee_name,
        cargo_kg,
        cargo_quantity,
        cargo_description,
        cargo_ldm
      )
    `)
    .eq('trip_id', tripId)
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: true });

  if (linkedOrdersError) {
    return NextResponse.json({ error: linkedOrdersError.message }, { status: 500 });
  }

  const linkedOrders = (linkedOrderRows || [])
    .map((row: any) =>
      Array.isArray(row.linked_order) ? row.linked_order[0] ?? null : row.linked_order
    )
    .filter(Boolean) as Array<{
    id: string;
    internal_order_number: string;
    client_order_number: string | null;
    loading_date: string | null;
    loading_time_from: string | null;
    loading_time_to: string | null;
    loading_address: string | null;
    loading_city: string | null;
    loading_postal_code: string | null;
    loading_country: string | null;
    loading_contact: string | null;
    loading_reference: string | null;
    loading_customs_info: string | null;
    unloading_date: string | null;
    unloading_time_from: string | null;
    unloading_time_to: string | null;
    unloading_address: string | null;
    unloading_city: string | null;
    unloading_postal_code: string | null;
    unloading_country: string | null;
    unloading_contact: string | null;
    unloading_reference: string | null;
    unloading_customs_info: string | null;
    shipper_name: string | null;
    consignee_name: string | null;
    cargo_kg: number | null;
    cargo_quantity: string | null;
    cargo_description: string | null;
    cargo_ldm: number | null;
  }>;

  const prefillOrder = !draft?.id && linkedOrders.length === 1 ? linkedOrders[0] : null;

  const prefilledLoadingDate = prefillOrder?.loading_date ?? '';
  const prefilledLoadingTimeFrom = prefillOrder?.loading_time_from ?? '';
  const prefilledLoadingTimeTo = prefillOrder?.loading_time_to ?? '';
  const prefilledUnloadingDate = prefillOrder?.unloading_date ?? '';
  const prefilledUnloadingTimeFrom = prefillOrder?.unloading_time_from ?? '';
  const prefilledUnloadingTimeTo = prefillOrder?.unloading_time_to ?? '';
  const prefilledCargoText = prefillOrder
    ? joinLines([
        prefillOrder.cargo_description,
        joinParts(
          [
            prefillOrder.cargo_quantity
              ? `Qty: ${prefillOrder.cargo_quantity}`
              : null,
            prefillOrder.cargo_kg !== null && prefillOrder.cargo_kg !== undefined
              ? `KG: ${prefillOrder.cargo_kg}`
              : null,
            prefillOrder.cargo_ldm !== null && prefillOrder.cargo_ldm !== undefined
              ? `LDM: ${prefillOrder.cargo_ldm}`
              : null,
          ],
          ' / '
        ),
      ])
    : '';
  const prefilledLoadingText = prefillOrder
    ? buildAlignedStopText([
        '',
        prefillOrder.shipper_name,
        prefillOrder.loading_address,
        joinParts(
          [
            prefillOrder.loading_postal_code,
            prefillOrder.loading_city,
            prefillOrder.loading_country,
          ],
          ', '
        ),
        prefillOrder.loading_contact,
        prefillOrder.loading_customs_info,
        prefillOrder.loading_reference,
      ])
    : '';
  const prefilledUnloadingText = prefillOrder
    ? buildAlignedStopText([
        '',
        prefillOrder.consignee_name,
        prefillOrder.unloading_address,
        joinParts(
          [
            prefillOrder.unloading_postal_code,
            prefillOrder.unloading_city,
            prefillOrder.unloading_country,
          ],
          ', '
        ),
        prefillOrder.unloading_contact,
        prefillOrder.unloading_customs_info,
        prefillOrder.unloading_reference,
      ])
    : '';

  const createdDate = trip.created_at
    ? new Date(trip.created_at).toLocaleDateString('en-GB')
    : '-';

  const updatedDate = draft?.updated_at
    ? new Date(draft.updated_at).toLocaleString('en-GB')
    : '';

  const orderNumber = trip.trip_number || `TRIP-${trip.id}`;

  const carrierAddress = [
    carrier?.address,
    carrier?.postal_code,
    carrier?.city,
    carrier?.country,
  ]
    .filter(Boolean)
    .join(', ');

  const paymentDays =
    trip.payment_term_days !== null && trip.payment_term_days !== undefined
      ? `${trip.payment_term_days}`
      : '___';

  const paymentSummary = `${paymentDays} days after receipt of complete and valid documents by email at INVOICES@TEMPUS.LT. Documents must be sent in PDF format. If originals are required by post, use the company details above.`;

  const representative = `${text(profile.first_name)} ${text(profile.last_name)}`.trim();
  const loadingDateValue = draft?.id ? draft.loading_date ?? '' : prefilledLoadingDate;
  const loadingTimeFromValue = draft?.id
    ? formatTimeValue(draft.loading_time_from)
    : formatTimeValue(prefilledLoadingTimeFrom);
  const loadingTimeToValue = draft?.id
    ? formatTimeValue(draft.loading_time_to)
    : formatTimeValue(prefilledLoadingTimeTo);
  const loadingTextValue = draft?.id ? draft.loading_text ?? '' : prefilledLoadingText;
  const unloadingDateValue = draft?.id
    ? draft.unloading_date ?? ''
    : prefilledUnloadingDate;
  const unloadingTimeFromValue = draft?.id
    ? formatTimeValue(draft.unloading_time_from)
    : formatTimeValue(prefilledUnloadingTimeFrom);
  const unloadingTimeToValue = draft?.id
    ? formatTimeValue(draft.unloading_time_to)
    : formatTimeValue(prefilledUnloadingTimeTo);
  const unloadingTextValue = draft?.id
    ? draft.unloading_text ?? ''
    : prefilledUnloadingText;
  const cargoTextValue = draft?.id ? draft.cargo_text ?? '' : prefilledCargoText;

  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Transport Order ${esc(orderNumber)}</title>
  <style>
    @page {
      size: A4;
      margin: 12mm;
    }

    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #111;
      margin: 0;
      background: #fff;
      font-size: 13px;
      line-height: 1.25;
    }

    .page {
      width: 100%;
      max-width: 190mm;
      margin: 0 auto;
      box-sizing: border-box;
    }

    .actions {
      position: sticky;
      top: 0;
      background: #fff;
      padding: 8px 0 10px;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      border-bottom: 1px solid #ddd;
      margin-bottom: 10px;
      z-index: 2;
    }

    .btn {
      border: 1px solid #222;
      background: #fff;
      padding: 8px 12px;
      cursor: pointer;
      font-size: 13px;
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: default;
    }

    .header {
      text-align: center;
      margin-bottom: 12px;
    }

    .logo {
      font-size: 30px;
      font-weight: 800;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }

    .subtitle {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .meta {
      font-size: 13px;
      font-weight: 700;
    }

    .meta span {
      font-weight: 400;
    }

    .meta-note {
      margin-top: 6px;
      font-size: 12px;
      color: #444;
    }

    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 10px;
    }

    .section-title {
      text-align: center;
      font-size: 14px;
      font-weight: 700;
      margin: 0 0 4px;
    }

    .box {
      border: 1px solid #222;
      padding: 10px 12px;
      box-sizing: border-box;
      background: #fff;
    }

    .party-box {
      min-height: 118px;
    }

    .kv {
      display: grid;
      grid-template-columns: 120px 1fr;
      column-gap: 8px;
      margin-bottom: 4px;
    }

    .kv b {
      display: block;
    }

 .fill-wrap {
  border: 1px solid #222;
  display: grid;
  grid-template-columns: 130px 1fr;
  min-height: 190px;
  box-sizing: border-box;
  background: #fff;
  align-items: stretch;
}

    .fill-labels {
      border-right: 1px solid #222;
      padding: 10px 10px 8px;
      box-sizing: border-box;
    }

    .fill-labels div {
      margin-bottom: 7px;
    }

 .fill-write {
  padding: 10px;
  box-sizing: border-box;
  white-space: pre-wrap;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

    .edit-input,
    .edit-textarea {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid #bbb;
      padding: 6px 8px;
      font: inherit;
      background: #fff;
    }

.edit-input {
  height: 32px;
  margin-bottom: 8px;
  margin-top: 0;
 }

.date-time-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 48px 48px;
  gap: 4px;
  width: 100%;
}

.date-time-row .edit-input {
  margin-bottom: 8px;
}

.date-time-row .edit-input:nth-child(n+2) {
  padding-left: 4px;
  padding-right: 4px;
  text-align: center;
}

.edit-textarea {
  min-height: 145px;
  resize: vertical;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

    .cargo-box {
      min-height: 56px;
    }

    .vehicle-box {
      min-height: 95px;
    }

    .payment-box {
      min-height: 200px;
    }

    .full-title {
      text-align: center;
      font-size: 14px;
      font-weight: 700;
      margin: 8px 0 4px;
    }

.full-box {
  border: 1px solid #222;
  min-height: 56px;
  padding: 10px 12px;
  box-sizing: border-box;
  white-space: pre-wrap;
  margin-bottom: 10px;
}

.full-box .edit-textarea {
  min-height: 56px;
  margin: 0;
}

    .sign-box {
      border: 1px solid #222;
      min-height: 120px;
      padding: 10px 12px;
      box-sizing: border-box;
    }

    .sign-box .edit-input {
      margin-top: 6px;
      margin-bottom: 0;
    }

    .terms-page {
      page-break-before: always;
    }

    .terms-title {
      text-align: center;
      font-size: 18px;
      font-weight: 700;
      margin: 0 0 10px;
    }

    .terms-box {
      border: 1px solid #222;
      padding: 12px;
      box-sizing: border-box;
      font-size: 12px;
      line-height: 1.4;
      white-space: pre-wrap;
      margin-bottom: 14px;
    }

    .status-line {
      margin-top: 6px;
      font-size: 12px;
      color: #444;
      text-align: right;
    }

    @media print {
      .actions {
        display: none;
      }

      .edit-input,
      .edit-textarea {
        border: none;
        padding: 0;
        background: transparent;
      }

      body {
        margin: 0;
      }
    }
  </style>
</head>
<body>
  <div class="page">
<div class="actions">
  <button class="btn" id="saveBtn" onclick="saveDraft()">Save Draft</button>
  <button class="btn" type="button" onclick="cancelChanges()">Cancel</button>
  <button class="btn" onclick="window.print()">Print / Save PDF</button>
</div>

    <div class="header">
      <div class="logo">TEMPUS TRANS</div>
      <div class="subtitle">TRANSPORT ORDER</div>
      <div class="meta">
        Order No. <span>${esc(orderNumber)}</span>
        &nbsp;&nbsp;&nbsp;
        Date: <span>${esc(createdDate)}</span>
      </div>
    </div>

    <div class="grid-2">
      <div>
        <div class="section-title">CLIENT</div>
        <div class="box party-box">
          <div class="kv"><b>Company:</b><span>UAB "TEMPUS TRANS"</span></div>
          <div class="kv"><b>Address:</b><span>Paneriu g. 45-3, Vilnius, LT-03202</span></div>
          <div class="kv"><b>Code:</b><span>300570206</span></div>
          <div class="kv"><b>VAT:</b><span>LT100002407511</span></div>
          <div class="kv"><b>Phone:</b><span>+370 5 2000570</span></div>
        </div>
      </div>

      <div>
        <div class="section-title">CARRIER</div>
        <div class="box party-box">
          <div class="kv"><b>Company:</b><span>${esc(empty(carrier?.name))}</span></div>
          <div class="kv"><b>Address:</b><span>${esc(empty(carrierAddress))}</span></div>
          <div class="kv"><b>Code:</b><span>${esc(empty(carrier?.company_code))}</span></div>
          <div class="kv"><b>VAT:</b><span>${esc(empty(carrier?.vat_code))}</span></div>
          <div class="kv"><b>Phone:</b><span>${esc(empty(carrier?.phone))}</span></div>
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div>
        <div class="section-title">LOADING INFORMATION</div>
        <div class="fill-wrap">
          <div class="fill-labels">
            <div>Loading date:</div>
            <div>Shipper:</div>
            <div>Address:</div>
            <div>City, Country:</div>
            <div>Contact person:</div>
            <div>Customs info:</div>
            <div>Reference:</div>
          </div>
          <div class="fill-write">
            <div class="date-time-row">
              <input class="edit-input" id="loading_date" value="${esc(loadingDateValue)}" />
              <input class="edit-input" id="loading_time_from" value="${esc(loadingTimeFromValue)}" placeholder="08:30" />
              <input class="edit-input" id="loading_time_to" value="${esc(loadingTimeToValue)}" placeholder="16:30" />
            </div>
            <textarea class="edit-textarea" id="loading_text">${esc(loadingTextValue)}</textarea>
          </div>
        </div>
      </div>

      <div>
        <div class="section-title">UNLOADING INFORMATION</div>
        <div class="fill-wrap">
          <div class="fill-labels">
            <div>Unloading date:</div>
            <div>Consignee:</div>
            <div>Address:</div>
            <div>City, Country:</div>
            <div>Contact person:</div>
            <div>Customs info:</div>
            <div>Reference:</div>
          </div>
          <div class="fill-write">
            <div class="date-time-row">
              <input class="edit-input" id="unloading_date" value="${esc(unloadingDateValue)}" />
              <input class="edit-input" id="unloading_time_from" value="${esc(unloadingTimeFromValue)}" placeholder="08:30" />
              <input class="edit-input" id="unloading_time_to" value="${esc(unloadingTimeToValue)}" placeholder="16:30" />
            </div>
            <textarea class="edit-textarea" id="unloading_text">${esc(unloadingTextValue)}</textarea>
          </div>
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div>
        <div class="section-title">CARGO DETAILS</div>
        <div class="box cargo-box">
          <textarea class="edit-textarea" id="cargo_text" style="min-height:56px;">${esc(cargoTextValue)}</textarea>
        </div>

        <div class="section-title" style="margin-top:8px;">VEHICLE INFORMATION</div>
        <div class="box vehicle-box">
          <div class="kv"><b>Truck plate:</b><span>${esc(text(trip.truck_plate))}</span></div>
          <div class="kv"><b>Trailer plate:</b><span>${esc(text(trip.trailer_plate))}</span></div>
          <div class="kv"><b>Driver:</b><span>${esc(text(trip.driver_name))}</span></div>
        </div>
      </div>

      <div>
        <div class="section-title">PRICE AND PAYMENT</div>
        <div class="box payment-box">
          <div class="kv"><b>Transport price:</b><span>${esc(
            trip.price !== null && trip.price !== undefined ? `${trip.price} EUR` : '________________'
          )}</span></div>
          <div class="kv"><b>Payment terms:</b><span>${esc(paymentSummary)}</span></div>
          <div class="kv"><b>Payment method:</b><span>${esc(empty(trip.payment_type))}</span></div>
          <div class="kv"><b>VAT:</b><span>${esc(empty(trip.vat_rate))}</span></div>
        </div>
      </div>
    </div>

    <div class="full-title">ADDITIONAL CONDITIONS</div>
    <div class="full-box">
      <textarea class="edit-textarea" id="additional_conditions">${esc(draft?.additional_conditions ?? '')}</textarea>
    </div>

    <div class="terms-page">
      <div class="terms-title">TRANSPORT TERMS</div>
      <div class="terms-box">
Transport shall be carried out in accordance with applicable CMR requirements and other valid transport regulations. The Carrier confirms that it has read and accepts the transport terms stated below.

1. The Carrier undertakes to provide a suitable vehicle at the agreed time. The vehicle must be technically sound, clean, dry and suitable for the agreed cargo.

2. The Carrier undertakes to have all documents and permits required for the transport, including valid CMR insurance and other documents necessary for execution of the order.

3. The Carrier must follow all transport instructions stated in this order and in the CMR consignment note and is fully responsible for non-performance or improper performance.

4. If the Carrier notices quantity discrepancies, packaging damage, suspicious cargo condition or document mismatches, the Carrier must immediately inform the Client and await further instructions.

5. The Carrier is fully responsible for correct loading supervision, securing, stowage and safe carriage of the cargo, unless otherwise agreed in writing.

6. The Carrier must immediately inform the Client about delays, incidents, additional costs, customs issues or any other circumstances affecting the transport.

7. Transport documents must be sent by email within 14 days after unloading, unless otherwise agreed.

8. All information related to this order and the carried cargo is confidential and may not be disclosed to third parties not involved in execution of the transport.

9. Any disputes shall be settled by negotiation. If no agreement is reached, disputes shall be resolved in accordance with the laws of the Republic of Lithuania.

10. By accepting and executing this order, the Carrier confirms acceptance of all terms and conditions of this transport order.
      </div>

      <div class="section-title">ORDER CONFIRMATION</div>
      <div class="grid-2">
        <div>
          <div class="sign-box">
            <div class="kv"><b>Order submitted by:</b><span>UAB "TEMPUS TRANS"</span></div>
            <div class="kv"><b>Representative:</b><span>${esc(representative)}</span></div>
            <div class="kv"><b>Signature:</b><span></span></div>
          </div>
        </div>

        <div>
          <div class="sign-box">
            <div class="kv"><b>Order accepted by:</b><span>${esc(empty(carrier?.name))}</span></div>
            <div class="kv"><b>Representative:</b><span><input class="edit-input" id="carrier_representative" value="${esc(draft?.carrier_representative ?? '')}" /></span></div>
            <div class="kv"><b>Signature:</b><span></span></div>
          </div>
        </div>
      </div>
      <div class="status-line">Draft status: ${esc(draft?.status ?? 'draft')}</div>
    </div>
  </div>

  <script>
    const tripId = ${JSON.stringify(tripId)};
    const initialDraftState = {
  loading_date: ${JSON.stringify(loadingDateValue)},
  loading_time_from: ${JSON.stringify(loadingTimeFromValue)},
  loading_time_to: ${JSON.stringify(loadingTimeToValue)},
  loading_text: ${JSON.stringify(loadingTextValue)},
  unloading_date: ${JSON.stringify(unloadingDateValue)},
  unloading_time_from: ${JSON.stringify(unloadingTimeFromValue)},
  unloading_time_to: ${JSON.stringify(unloadingTimeToValue)},
  unloading_text: ${JSON.stringify(unloadingTextValue)},
  cargo_text: ${JSON.stringify(cargoTextValue)},
  additional_conditions: ${JSON.stringify(draft?.additional_conditions ?? '')},
  carrier_representative: ${JSON.stringify(draft?.carrier_representative ?? '')},
};

function cancelChanges() {
  document.getElementById('loading_date').value = initialDraftState.loading_date;
  document.getElementById('loading_time_from').value = initialDraftState.loading_time_from;
  document.getElementById('loading_time_to').value = initialDraftState.loading_time_to;
  document.getElementById('loading_text').value = initialDraftState.loading_text;
  document.getElementById('unloading_date').value = initialDraftState.unloading_date;
  document.getElementById('unloading_time_from').value = initialDraftState.unloading_time_from;
  document.getElementById('unloading_time_to').value = initialDraftState.unloading_time_to;
  document.getElementById('unloading_text').value = initialDraftState.unloading_text;
  document.getElementById('cargo_text').value = initialDraftState.cargo_text;
  document.getElementById('additional_conditions').value = initialDraftState.additional_conditions;
  document.getElementById('carrier_representative').value = initialDraftState.carrier_representative;

  window.close();
}

    async function saveDraft() {
      const btn = document.getElementById('saveBtn');

      try {
        btn.disabled = true;
        btn.textContent = 'Saving...';

        const payload = {
          tripId,
          loading_date: document.getElementById('loading_date')?.value || '',
          loading_time_from: document.getElementById('loading_time_from')?.value || '',
          loading_time_to: document.getElementById('loading_time_to')?.value || '',
          loading_text: document.getElementById('loading_text')?.value || '',
          unloading_date: document.getElementById('unloading_date')?.value || '',
          unloading_time_from: document.getElementById('unloading_time_from')?.value || '',
          unloading_time_to: document.getElementById('unloading_time_to')?.value || '',
          unloading_text: document.getElementById('unloading_text')?.value || '',
          cargo_text: document.getElementById('cargo_text')?.value || '',
          additional_conditions: document.getElementById('additional_conditions')?.value || '',
          carrier_representative: document.getElementById('carrier_representative')?.value || '',
          status: 'draft',
        };

        const res = await fetch('/api/trips/order-draft', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (!res.ok) {
          alert(data.error || 'Failed to save draft');
          return;
        }

        alert('Draft saved');
        window.location.reload();
      } catch (error) {
        alert('Unexpected error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save Draft';
      }
    }
  </script>
</body>
</html>
`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
