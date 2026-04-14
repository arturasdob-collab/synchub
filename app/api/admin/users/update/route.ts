import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { UserRole } from '@/lib/types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const ROLE_OPTIONS: UserRole[] = ['OWNER', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'FINANCE'];
const ADMIN_ROLES: UserRole[] = ['OWNER', 'ADMIN'];

function normalizeNullableString(value: unknown) {
  if (typeof value !== 'string') return null;
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
      .select('id, email, role, organization_id, disabled, is_super_admin, is_creator, first_name, last_name')
      .eq('id', caller.id)
      .maybeSingle();

    if (callerProfileErr || !callerProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
    }

    if (callerProfile.disabled) {
      return NextResponse.json({ error: 'Account disabled' }, { status: 403 });
    }

    const isSuperAdmin = !!callerProfile.is_super_admin;
    const isOwner = callerProfile.role === 'OWNER';
    const isAdmin = callerProfile.role === 'ADMIN';

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await req.json();
    const userId = String(body?.userId || '').trim();
    const firstName = normalizeNullableString(body?.first_name ?? body?.firstName);
    const lastName = normalizeNullableString(body?.last_name ?? body?.lastName);
    const phone = normalizeNullableString(body?.phone);
    const position = normalizeNullableString(body?.position);
    const requestedRole = String(body?.role || '').trim().toUpperCase() as UserRole | '';

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    if (!firstName || !lastName) {
      return NextResponse.json({ error: 'First name and last name are required' }, { status: 400 });
    }

    if (!requestedRole || !ROLE_OPTIONS.includes(requestedRole as UserRole)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const { data: targetUser, error: targetErr } = await adminClient
      .from('user_profiles')
      .select('id, email, role, organization_id, disabled, is_super_admin, is_creator, first_name, last_name')
      .eq('id', userId)
      .maybeSingle();

    if (targetErr || !targetUser) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }

    if (!isSuperAdmin && targetUser.organization_id !== callerProfile.organization_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (targetUser.is_creator) {
      return NextResponse.json({ error: 'Creator account cannot be modified' }, { status: 403 });
    }

    if (targetUser.is_super_admin && !isSuperAdmin) {
      return NextResponse.json({ error: 'Only SUPER_ADMIN can modify SUPER_ADMIN' }, { status: 403 });
    }

    if (!isSuperAdmin) {
      if ((requestedRole === 'OWNER' || requestedRole === 'ADMIN') && !isOwner) {
        return NextResponse.json({ error: 'Only OWNER can assign ADMIN and OWNER roles' }, { status: 403 });
      }

      if (ADMIN_ROLES.includes(targetUser.role) && !isOwner) {
        return NextResponse.json({ error: 'Only OWNER can modify ADMIN and OWNER users' }, { status: 403 });
      }
    }

    const { data: updatedUser, error: updateErr } = await adminClient
      .from('user_profiles')
      .update({
        first_name: firstName,
        last_name: lastName,
        phone,
        position,
        role: requestedRole,
      })
      .eq('id', userId)
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
      .single();

    if (updateErr || !updatedUser) {
      return NextResponse.json(
        { error: updateErr?.message || 'Failed to update user' },
        { status: 500 }
      );
    }

    const actorName =
      `${callerProfile.first_name ?? ''} ${callerProfile.last_name ?? ''}`.trim() || null;
    const targetName =
      `${updatedUser.first_name ?? ''} ${updatedUser.last_name ?? ''}`.trim() || null;

    const { error: auditError } = await adminClient.from('audit_logs').insert({
      action: 'user_update',
      actor_id: caller.id,
      target_id: userId,
      organization_id: updatedUser.organization_id ?? null,
      details: {
        message: 'User updated',
        actor_name: actorName,
        actor_email: callerProfile.email,
        target_name: targetName,
        target_email: updatedUser.email,
        role: requestedRole,
      },
    });

    if (auditError) {
      console.error('Audit log insert failed:', auditError);
    }

    return NextResponse.json({ ok: true, user: updatedUser });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to update user' },
      { status: 500 }
    );
  }
}
