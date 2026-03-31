export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

function text(value: string | number | null | undefined) {
  return value === null || value === undefined || value === '' ? '-' : String(value);
}

function empty(value?: string | null) {
  return value && value.trim() !== '' ? value : '________________';
}

function escapeRtf(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')
    .replace(/\n/g, '\\line ');
}

function kv(label: string, value: string) {
  return `\\b ${escapeRtf(label)}\\b0 ${escapeRtf(value)}\\par`;
}

function plain(label: string, value = '') {
  return `${escapeRtf(label)} ${escapeRtf(value)}\\par`;
}

function sectionTitle(title: string) {
  return `\\pard\\qc\\b ${escapeRtf(title)}\\b0\\par`;
}

function box(content: string) {
  return String.raw`{\pard\brdrt\brdrs\brdrw10\brdrl\brdrs\brdrw10\brdrb\brdrs\brdrw10\brdrr\brdrs\brdrw10\sa100\sb100
${content}
\par}`;
}

function titledBox(title: string, content: string) {
  return `${sectionTitle(title)}${box(content)}`;
}

function tableRow(left: string, right: string, leftCell = 5200, rightCell = 10400) {
  return String.raw`{\trowd\trgaph108\trleft0
\cellx${leftCell}\cellx${rightCell}
\intbl ${left}\cell
\intbl ${right}\cell
\row
}`;
}

function spacer(lines = 2) {
  return Array.from({ length: lines }, () => '\\par').join('');
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

  const createdDate = trip.created_at
    ? new Date(trip.created_at).toLocaleDateString('en-GB')
    : '-';

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

  const clientBox = titledBox(
    'CLIENT',
    [
      kv('Company name:', 'UAB "TEMPUS TRANS"'),
      kv('Address:', 'Paneriu g. 45-3, Vilnius, LT-03202'),
      kv('Company code:', '300570206'),
      kv('VAT code:', 'LT100002407511'),
      kv('Phone:', '+370 5 2000570'),
    ].join('')
  );

  const carrierBox = titledBox(
    'CARRIER',
    [
      kv('Company name:', empty(carrier?.name)),
      kv('Address:', empty(carrierAddress)),
      kv('Company code:', empty(carrier?.company_code)),
      kv('VAT code:', empty(carrier?.vat_code)),
      kv('Phone:', empty(carrier?.phone)),
    ].join('')
  );

  const loadingBox = titledBox(
    'LOADING INFORMATION',
    [
      plain('Loading date / time:'),
      plain(''),
      plain('Loading place:'),
      plain('Shipper:'),
      plain('Address:'),
      plain('City, Country:'),
      plain('Contact person:'),
      plain(''),
      spacer(2),
    ].join('')
  );

  const unloadingBox = titledBox(
    'UNLOADING INFORMATION',
    [
      plain('Unloading date / time:'),
      plain(''),
      plain('Unloading place:'),
      plain('Consignee:'),
      plain('Address:'),
      plain('City, Country:'),
      plain('Contact person:'),
      plain(''),
      spacer(2),
    ].join('')
  );

  const cargoBox = titledBox(
    'CARGO DETAILS',
    [
      plain('Cargo type:'),
      plain('Cargo quantity:'),
      plain('Cargo weight:'),
      spacer(4),
    ].join('')
  );

  const vehicleBox = titledBox(
    'VEHICLE INFORMATION',
    [
      kv('Truck plate:', text(trip.truck_plate)),
      kv('Trailer plate:', text(trip.trailer_plate)),
      kv('Driver:', text(trip.driver_name)),
      spacer(4),
    ].join('')
  );

  const priceBox = titledBox(
    'PRICE AND PAYMENT',
    [
      kv(
        'Transport price:',
        trip.price !== null && trip.price !== undefined ? `${trip.price} EUR` : '________________'
      ),
      kv('Payment terms:', paymentSummary),
      kv('Payment method:', empty(trip.payment_type)),
      kv('VAT:', empty(trip.vat_rate)),
    ].join('')
  );

  const additionalConditionsBox = titledBox(
    'ADDITIONAL CONDITIONS',
    trip.notes && trip.notes.trim() !== ''
      ? `${escapeRtf(trip.notes)}\\par\\par\\par`
      : `${spacer(6)}`
  );

  const signaturesLeft = titledBox(
    'SIGNATURES',
    [
      kv('Order submitted by:', 'UAB "TEMPUS TRANS"'),
      kv('Representative:', representative),
      kv('Client signature:', '________________'),
    ].join('')
  );

  const signaturesRight = titledBox(
    '',
    [
      kv('Order accepted by:', empty(carrier?.name)),
      kv('Representative:', '________________'),
      kv('Carrier signature:', '________________'),
    ].join('')
  );

  const page1 = String.raw`
{\pard\qc\b\fs40 TEMPUS TRANS\b0\fs24\par}
{\pard\qc\fs24 TRANSPORT ORDER\par}
{\pard\qc\fs18 Order No. ${escapeRtf(orderNumber)}\tab Date: ${escapeRtf(createdDate)}\par}
\par

${tableRow(clientBox, carrierBox)}
\par
${tableRow(loadingBox, unloadingBox)}
\par
${tableRow(cargoBox, vehicleBox)}
\par
${priceBox}
\par
${additionalConditionsBox}
\par
${tableRow(signaturesLeft, signaturesRight)}
`;

  const page2 = String.raw`
${sectionTitle('TRANSPORT TERMS')}
{\pard\fs20
Transport shall be carried out in accordance with applicable CMR requirements and other valid transport regulations. The Carrier confirms that it has read and accepts the transport terms stated below.\par
\par
1. The Carrier undertakes to provide a suitable vehicle at the agreed time. The vehicle must be technically sound, clean, dry and suitable for the agreed cargo.\par
\par
2. The Carrier undertakes to have all documents and permits required for the transport, including valid CMR insurance and other documents necessary for execution of the order.\par
\par
3. The Carrier must follow all transport instructions stated in this order and in the CMR consignment note and is fully responsible for non-performance or improper performance.\par
\par
4. If the Carrier notices quantity discrepancies, packaging damage, suspicious cargo condition or document mismatches, the Carrier must immediately inform the Client and await further instructions.\par
\par
5. The Carrier is fully responsible for correct loading supervision, securing, stowage and safe carriage of the cargo, unless otherwise agreed in writing.\par
\par
6. The Carrier must immediately inform the Client about delays, incidents, additional costs, customs issues or any other circumstances affecting the transport.\par
\par
7. Transport documents must be sent by email within 14 days after unloading, unless otherwise agreed.\par
\par
8. All information related to this order and the carried cargo is confidential and may not be disclosed to third parties not involved in execution of the transport.\par
\par
9. Any disputes shall be settled by negotiation. If no agreement is reached, disputes shall be resolved in accordance with the laws of the Republic of Lithuania.\par
\par
10. By accepting and executing this order, the Carrier confirms acceptance of all terms and conditions of this transport order.\par
}
`;

  const rtf = String.raw`{\rtf1\ansi\deff0
{\fonttbl{\f0 Arial;}}
\paperw11907\paperh16840\margl567\margr567\margt425\margb425
\fs21
${page1}
\page
${page2}
}`;

  return new NextResponse(rtf, {
    status: 200,
    headers: {
      'Content-Type': 'application/rtf; charset=utf-8',
      'Content-Disposition': `attachment; filename="Transport-Order-${orderNumber}.rtf"`,
    },
  });
}