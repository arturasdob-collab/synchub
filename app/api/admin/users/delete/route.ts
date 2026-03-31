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

    const { data: authUserRes, error: authErr } = await adminClient.auth.getUser(token);
    const caller = authUserRes?.user;

    if (authErr || !caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: callerProfile, error: callerProfileErr } = await adminClient
      .from('user_profiles')
      .select('id, email, role, disabled, is_super_admin, is_creator, first_name, last_name')
      .eq('id', caller.id)
      .maybeSingle();

    if (callerProfileErr || !callerProfile) {
      return NextResponse.json({ error: 'Caller profile not found' }, { status: 403 });
    }

    if (callerProfile.disabled) {
      return NextResponse.json({ error: 'Account disabled' }, { status: 403 });
    }

    const isAllowedCaller =
      callerProfile.is_super_admin ||
      callerProfile.role === 'OWNER' ||
      callerProfile.role === 'ADMIN';

    if (!isAllowedCaller) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await req.json();
    const userId = String(body.userId || '').trim();

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    if (userId === caller.id) {
      return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
    }

    const { data: targetUser, error: targetErr } = await adminClient
      .from('user_profiles')
      .select('id, email, role, is_super_admin, is_creator, organization_id, first_name, last_name')
      .eq('id', userId)
      .maybeSingle();

    if (targetErr || !targetUser) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }

    if (targetUser.is_creator) {
      return NextResponse.json({ error: 'Creator cannot be deleted' }, { status: 403 });
    }

    if (targetUser.is_super_admin) {
      return NextResponse.json({ error: 'SUPER_ADMIN cannot be deleted' }, { status: 403 });
    }

    const { error: deleteProfileError } = await adminClient
      .from('user_profiles')
      .delete()
      .eq('id', userId);

    if (deleteProfileError) {
      return NextResponse.json(
        { error: 'Failed to delete user profile', message: deleteProfileError.message },
        { status: 500 }
      );
    }

    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId);
    await adminClient
  .from('pending_invites')
  .delete()
  .eq('email', targetUser.email);

    if (deleteAuthError) {
      return NextResponse.json(
        { error: 'Profile deleted, but auth user delete failed', message: deleteAuthError.message },
        { status: 500 }
      );
    }

    const actorName = `${callerProfile.first_name ?? ''} ${callerProfile.last_name ?? ''}`.trim() || null;
    const targetName = `${targetUser.first_name ?? ''} ${targetUser.last_name ?? ''}`.trim() || null;

    const { data: org } = await adminClient
    .from('organizations')
    .select('name')
    .eq('id', targetUser.organization_id)
    .single();
  
  const { error: auditError } = await adminClient.from('audit_logs').insert({
    action: 'user_delete',
    actor_id: caller.id,
    target_id: null,
    organization_id: targetUser.organization_id ?? null,
    details: {
      message: 'Account deleted',
      actor_name: actorName,
      actor_email: caller.email,
      target_name: targetName,
      target_email: targetUser.email,
      organization_name: org?.name || null
    },
  });

    if (auditError) {
      console.error('Audit log insert failed:', auditError);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'Unexpected', message: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}