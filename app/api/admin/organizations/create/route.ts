import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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
    const name = String(body?.name || '').trim();

    if (!name) {
      return NextResponse.json({ error: 'Organization name is required' }, { status: 400 });
    }

    const { data: existingOrg, error: existingErr } = await adminClient
      .from('organizations')
      .select('id, name')
      .ilike('name', name)
      .maybeSingle();

    if (existingErr) {
      return NextResponse.json(
        {
          error: 'Failed to check existing organization',
          message: existingErr.message,
          details: existingErr.details,
          hint: existingErr.hint,
          code: existingErr.code,
        },
        { status: 500 }
      );
    }

    if (existingOrg) {
      return NextResponse.json(
        { error: 'Organization already exists' },
        { status: 400 }
      );
    }

    const { data: newOrg, error: createErr } = await adminClient
      .from('organizations')
      .insert({
        name,
      })
      .select('id, name')
      .single();

    if (createErr || !newOrg) {
      return NextResponse.json(
        {
          error: 'Failed to create organization',
          message: createErr?.message,
          details: createErr?.details,
          hint: createErr?.hint,
          code: createErr?.code,
        },
        { status: 500 }
      );
    }

    const actorName =
      `${callerProfile.first_name ?? ''} ${callerProfile.last_name ?? ''}`.trim() || null;

    const { error: auditError } = await adminClient.from('audit_logs').insert({
      action: 'organization_create',
      actor_id: caller.id,
      target_id: null,
      organization_id: newOrg.id,
      details: {
        message: 'Organization created',
        actor_name: actorName,
        actor_email: caller.email,
        organization_name: newOrg.name,
      },
    });

    if (auditError) {
      console.error('Audit log insert failed:', auditError);
    }

    return NextResponse.json(
      {
        ok: true,
        organization: newOrg,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to create organization' },
      { status: 500 }
    );
  }
}