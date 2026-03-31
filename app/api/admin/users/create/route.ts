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

    const { data: userRes, error: authErr } = await adminClient.auth.getUser(token);
    const caller = userRes?.user;

    if (authErr || !caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: callerProfile, error: callerProfileErr } = await adminClient
      .from('user_profiles')
      .select('id, role, organization_id, disabled, is_super_admin, is_creator, first_name, last_name')
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
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await req.json();

    const organizationId = String(body.organizationId || '').trim();
    const firstName = String(body.firstName || '').trim();
    const lastName = String(body.lastName || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const role = String(body.role || '').trim();

    if (!organizationId) {
      return NextResponse.json({ error: 'Organization is required' }, { status: 400 });
    }

    if (!firstName) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    if (!lastName) {
      return NextResponse.json({ error: 'Surname is required' }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    if (!password) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    if (!role) {
      return NextResponse.json({ error: 'Role is required' }, { status: 400 });
    }

    const allowedRoles = ['OWNER', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'FINANCE'];

    if (!allowedRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    if (!isSuperAdmin && role === 'OWNER') {
      return NextResponse.json(
        { error: 'Only SUPER_ADMIN can create OWNER users' },
        { status: 403 }
      );
    }

    const { data: selectedOrg, error: selectedOrgError } = await adminClient
      .from('organizations')
      .select('id, name')
      .eq('id', organizationId)
      .maybeSingle();

    if (selectedOrgError || !selectedOrg) {
      return NextResponse.json(
        { error: 'Selected organization not found' },
        { status: 400 }
      );
    }

    const { data: existingUser, error: existingUserErr } = await adminClient
      .from('user_profiles')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();

    if (existingUserErr) {
      return NextResponse.json(
        { error: 'Failed to check existing user', message: existingUserErr.message },
        { status: 500 }
      );
    }

    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 400 }
      );
    }

    const { data: createdAuthUser, error: createAuthError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
          role,
          organization_id: organizationId,
        },
      });

    const newUserId = createdAuthUser?.user?.id;

    if (createAuthError || !newUserId) {
      return NextResponse.json(
        { error: 'Failed to create auth user', message: createAuthError?.message },
        { status: 500 }
      );
    }

    const { error: profileUpdateError } = await adminClient
      .from('user_profiles')
      .update({
        email,
        role,
        organization_id: organizationId,
        disabled: false,
        is_super_admin: false,
        is_creator: false,
        first_name: firstName,
        last_name: lastName,
      })
      .eq('id', newUserId);

    if (profileUpdateError) {
      await adminClient.auth.admin.deleteUser(newUserId);

      return NextResponse.json(
        { error: 'Failed to update user profile', message: profileUpdateError.message },
        { status: 500 }
      );
    }

    const { error: auditError } = await adminClient.from('audit_logs').insert({
      action: 'user_create',
      actor_id: caller.id,
      target_id: newUserId,
      organization_id: organizationId,
      details: {
        actor_name: [callerProfile.first_name, callerProfile.last_name].filter(Boolean).join(' ') || null,
        actor_email: caller.email,
        target_name: `${firstName} ${lastName}`.trim(),
        target_email: email,
        role,
        organization_name: selectedOrg.name,
      },
    });

    if (auditError) {
      console.error('Audit log insert failed:', auditError);
    }

    return NextResponse.json(
      {
        ok: true,
        user: {
          id: newUserId,
          email,
          role,
          organization_id: organizationId,
          first_name: firstName,
          last_name: lastName,
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: 'Unexpected', message: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}