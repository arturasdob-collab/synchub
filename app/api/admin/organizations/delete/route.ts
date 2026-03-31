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
    const organizationId = String(body?.organizationId || '').trim();

    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId is required' }, { status: 400 });
    }

    const { data: org, error: orgErr } = await adminClient
      .from('organizations')
      .select('id, name')
      .eq('id', organizationId)
      .maybeSingle();

    if (orgErr || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const { count: usersCount, error: usersCountErr } = await adminClient
      .from('user_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId);

    if (usersCountErr) {
      return NextResponse.json(
        { error: 'Failed to check organization users', message: usersCountErr.message },
        { status: 500 }
      );
    }

    if ((usersCount ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Cannot delete organization with assigned users' },
        { status: 400 }
      );
    }

    const { count: invitesCount, error: invitesCountErr } = await adminClient
      .from('pending_invites')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId);

    if (invitesCountErr) {
      return NextResponse.json(
        { error: 'Failed to check pending invites', message: invitesCountErr.message },
        { status: 500 }
      );
    }

    if ((invitesCount ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Cannot delete organization with pending invites' },
        { status: 400 }
      );
    }

    const { error: deleteErr } = await adminClient
      .from('organizations')
      .delete()
      .eq('id', organizationId);

    if (deleteErr) {
      return NextResponse.json(
        { error: 'Failed to delete organization', message: deleteErr.message },
        { status: 500 }
      );
    }

    const actorName =
      `${callerProfile.first_name ?? ''} ${callerProfile.last_name ?? ''}`.trim() || null;

    const { error: auditError } = await adminClient.from('audit_logs').insert({
      action: 'organization_delete',
      actor_id: caller.id,
      target_id: null,
      organization_id: null,
      details: {
        message: 'Organization deleted',
        actor_name: actorName,
        actor_email: caller.email,
        organization_name: org.name,
      },
    });

    if (auditError) {
      console.error('Audit log insert failed:', auditError);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to delete organization' },
      { status: 500 }
    );
  }
}