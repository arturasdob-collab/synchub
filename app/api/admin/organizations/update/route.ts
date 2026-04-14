import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ALLOWED_ORGANIZATION_TYPES = ['company', 'partner', 'terminal', 'warehouse'] as const;

function normalizeNullableString(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export async function POST(req: NextRequest) {
  try {
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: 'Server misconfigured (missing env vars)' },
        { status: 500 }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: authRes, error: authErr } = await adminClient.auth.getUser(token);
    const caller = authRes?.user;

    if (authErr || !caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: callerProfile, error: callerProfileErr } = await adminClient
      .from('user_profiles')
      .select('id, email, disabled, is_super_admin, is_creator, first_name, last_name')
      .eq('id', caller.id)
      .maybeSingle();

    if (callerProfileErr || !callerProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
    }

    if (callerProfile.disabled) {
      return NextResponse.json({ error: 'Account disabled' }, { status: 403 });
    }

    if (!callerProfile.is_super_admin && !callerProfile.is_creator) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await req.json();
    const organizationId = String(body?.organizationId || '').trim();
    const name = String(body?.name || '').trim();
    const type = normalizeNullableString(body?.type);
    const companyCode = normalizeNullableString(body?.company_code ?? body?.companyCode);
    const vatCode = normalizeNullableString(body?.vat_code ?? body?.vatCode);
    const address = normalizeNullableString(body?.address);
    const city = normalizeNullableString(body?.city);
    const postalCode = normalizeNullableString(body?.postal_code ?? body?.postalCode);
    const country = normalizeNullableString(body?.country);
    const contactPhone = normalizeNullableString(body?.contact_phone ?? body?.contactPhone);
    const contactEmail = normalizeNullableString(body?.contact_email ?? body?.contactEmail);
    const notes = normalizeNullableString(body?.notes);

    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId is required' }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: 'Organization name is required' }, { status: 400 });
    }

    if (type && !ALLOWED_ORGANIZATION_TYPES.includes(type as any)) {
      return NextResponse.json({ error: 'Invalid organization type' }, { status: 400 });
    }

    const { data: existingOrg, error: existingOrgErr } = await adminClient
      .from('organizations')
      .select('id, name')
      .eq('id', organizationId)
      .maybeSingle();

    if (existingOrgErr || !existingOrg) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const { data: duplicateOrg, error: duplicateErr } = await adminClient
      .from('organizations')
      .select('id, name')
      .ilike('name', name)
      .neq('id', organizationId)
      .maybeSingle();

    if (duplicateErr) {
      return NextResponse.json(
        {
          error: 'Failed to check existing organization',
          message: duplicateErr.message,
          details: duplicateErr.details,
          hint: duplicateErr.hint,
          code: duplicateErr.code,
        },
        { status: 500 }
      );
    }

    if (duplicateOrg) {
      return NextResponse.json(
        { error: 'Organization with this name already exists' },
        { status: 400 }
      );
    }

    const { data: updatedOrg, error: updateErr } = await adminClient
      .from('organizations')
      .update({
        name,
        type,
        company_code: companyCode,
        vat_code: vatCode,
        address,
        city,
        postal_code: postalCode,
        country,
        contact_phone: contactPhone,
        contact_email: contactEmail,
        notes,
      })
      .eq('id', organizationId)
      .select('id, name')
      .single();

    if (updateErr || !updatedOrg) {
      return NextResponse.json(
        {
          error: 'Failed to update organization',
          message: updateErr?.message,
          details: updateErr?.details,
          hint: updateErr?.hint,
          code: updateErr?.code,
        },
        { status: 500 }
      );
    }

    const actorName =
      `${callerProfile.first_name ?? ''} ${callerProfile.last_name ?? ''}`.trim() || null;

    const { error: auditError } = await adminClient.from('audit_logs').insert({
      action: 'organization_update',
      actor_id: caller.id,
      target_id: null,
      organization_id: updatedOrg.id,
      details: {
        message: `Organization renamed: ${existingOrg.name} → ${updatedOrg.name}`,
        actor_name: actorName,
        actor_email: caller.email,
        organization_name: updatedOrg.name,
        old_name: existingOrg.name,
        new_name: updatedOrg.name,
      },
    });

    if (auditError) {
      console.error('Audit log insert failed:', auditError);
    }

    return NextResponse.json(
      {
        ok: true,
        organization: updatedOrg,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to update organization' },
      { status: 500 }
    );
  }
}
