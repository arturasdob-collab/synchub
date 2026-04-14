import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function canViewTarget(caller: any, target: any) {
  if (!caller || !target) return false;
  if (caller.is_super_admin) return true;
  if (caller.role === 'OWNER' || caller.role === 'ADMIN') {
    return caller.organization_id === target.organization_id;
  }
  return false;
}

export async function GET(req: NextRequest) {
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
      .select('id, role, organization_id, disabled, is_super_admin, is_creator')
      .eq('id', caller.id)
      .maybeSingle();

    if (callerProfileErr || !callerProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
    }

    if (callerProfile.disabled) {
      return NextResponse.json({ error: 'Account disabled' }, { status: 403 });
    }

    const userId =
      typeof req.nextUrl.searchParams.get('userId') === 'string'
        ? req.nextUrl.searchParams.get('userId')!.trim()
        : '';

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const { data: targetUser, error: targetErr } = await adminClient
      .from('user_profiles')
      .select(`
        id,
        email,
        first_name,
        last_name,
        phone,
        position,
        role,
        organization_id,
        disabled,
        created_at,
        is_super_admin,
        is_creator,
        organizations(name)
      `)
      .eq('id', userId)
      .maybeSingle();

    if (targetErr) {
      return NextResponse.json({ error: targetErr.message }, { status: 500 });
    }

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!canViewTarget(callerProfile, targetUser)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: pendingInvite } = await adminClient
      .from('pending_invites')
      .select('id')
      .eq('email', targetUser.email)
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      user: {
        ...targetUser,
        is_pending: !!pendingInvite,
      },
      can_manage:
        !!callerProfile.is_super_admin ||
        callerProfile.role === 'OWNER' ||
        callerProfile.role === 'ADMIN',
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to fetch user details' },
      { status: 500 }
    );
  }
}
