import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

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

  const {
    company_code,
    name,
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
    cmr_insurance_number,
    cmr_insurance_valid_from,
    cmr_insurance_valid_until,
    cmr_insurance_amount,
    notes,
  } = body;

  if (!company_code || !name) {
    return NextResponse.json(
      { error: 'Company code and name are required' },
      { status: 400 }
    );
  }

  if (is_carrier) {
    if (
      !cmr_insurance_number ||
      !cmr_insurance_valid_from ||
      !cmr_insurance_valid_until ||
      cmr_insurance_amount === '' ||
      cmr_insurance_amount === null ||
      cmr_insurance_amount === undefined
    ) {
      return NextResponse.json(
        {
          error:
            'Carrier cannot be saved: CMR insurance number, valid until date and amount are required',
        },
        { status: 400 }
      );
    }
  }

  const { data: profile } = await serviceSupabase
  .from('user_profiles')
  .select('organization_id')
  .eq('id', user.id)
  .single();

  if (!profile?.organization_id) {
    return NextResponse.json(
      { error: 'User organization not found' },
      { status: 400 }
    );
  }
  const normalizedName = name.trim();
const normalizedCode = company_code.trim();

const { data: existingByName } = await serviceSupabase
  .from('companies')
  .select('id')
  .eq('organization_id', profile.organization_id)
  .ilike('name', normalizedName)
  .limit(1);

if (existingByName && existingByName.length > 0) {
  return NextResponse.json(
    { error: 'Company with this name already exists' },
    { status: 400 }
  );
}

const { data: existingByCode } = await serviceSupabase
  .from('companies')
  .select('id')
  .eq('organization_id', profile.organization_id)
  .ilike('company_code', normalizedCode)
  .limit(1);

if (existingByCode && existingByCode.length > 0) {
  return NextResponse.json(
    { error: 'Company with this code already exists' },
    { status: 400 }
  );
}

  const { data, error } = await serviceSupabase.from('companies').insert({
    organization_id: profile.organization_id,
    company_code,
    name,
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
    cmr_insurance_number: is_carrier ? cmr_insurance_number : null,
    cmr_insurance_valid_from: is_carrier ? cmr_insurance_valid_from : null,
    cmr_insurance_valid_until: is_carrier ? cmr_insurance_valid_until : null,
    cmr_insurance_amount: is_carrier ? Number(cmr_insurance_amount) : null,
    notes,
    created_by: user.id,
  }).select('id, name, company_code').single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, company: data });
}
