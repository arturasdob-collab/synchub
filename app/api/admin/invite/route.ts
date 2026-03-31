import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const VALID_ROLES = [
  'SUPER_ADMIN',
  'OWNER',
  'ADMIN',
  'MANAGER',
  'ACCOUNTANT',
  'FINANCE',
] as const;

type ValidRole = (typeof VALID_ROLES)[number];

export async function POST(request: NextRequest) {
  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server misconfigured (missing SUPABASE env vars)' },
        { status: 500 }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const { data: userRes, error: authError } = await adminClient.auth.getUser(token);
    const user = userRes?.user;

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: inviterProfile, error: inviterErr } = await adminClient
      .from('user_profiles')
      .select('role, organization_id, disabled, email')
      .eq('id', user.id)
      .maybeSingle();

    if (inviterErr || !inviterProfile) {
      return NextResponse.json(
        {
          error: 'Profile not found',
          message: inviterErr?.message,
          details: inviterErr?.details,
          hint: inviterErr?.hint,
          code: inviterErr?.code,
        },
        { status: 403 }
      );
    }

    if (inviterProfile.disabled) {
      return NextResponse.json({ error: 'Account disabled' }, { status: 403 });
    }

    const inviterRole = (inviterProfile.role as string) || '';
    const inviterOrgId = (inviterProfile.organization_id as string | null) ?? null;

    const isSuperAdmin = inviterRole === 'SUPER_ADMIN';
    const isOwnerOrAdmin = inviterRole === 'OWNER' || inviterRole === 'ADMIN';

    if (!isSuperAdmin && !isOwnerOrAdmin) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    if (!isSuperAdmin && !inviterOrgId) {
      return NextResponse.json({ error: 'Inviter has no organization_id' }, { status: 403 });
    }

    const body = await request.json();
    const emailRaw = (body?.email ?? '').toString().trim().toLowerCase();
    const roleRaw = (body?.role ?? '').toString().trim().toUpperCase();
    const selectedOrganizationId = (body?.organizationId ?? '').toString().trim();

    if (!emailRaw || !roleRaw || !selectedOrganizationId) {
      return NextResponse.json(
        { error: 'Email, role and organization are required' },
        { status: 400 }
      );
    }

    if (!VALID_ROLES.includes(roleRaw as ValidRole)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const inviteRole = roleRaw as ValidRole;
    const targetOrgId = selectedOrganizationId;

    if (inviteRole === 'OWNER' && !(inviterRole === 'OWNER' || isSuperAdmin)) {
      return NextResponse.json({ error: 'Only OWNER can invite other OWNERs' }, { status: 403 });
    }

    const { data: selectedOrg, error: selectedOrgErr } = await adminClient
      .from('organizations')
      .select('id, name')
      .eq('id', targetOrgId)
      .maybeSingle();

    if (selectedOrgErr || !selectedOrg) {
      return NextResponse.json({ error: 'Selected organization not found' }, { status: 400 });
    }

    const { data: existingUser, error: existingUserErr } = await adminClient
      .from('user_profiles')
      .select('id, email')
      .eq('email', emailRaw)
      .maybeSingle();

    if (existingUserErr) {
      return NextResponse.json(
        {
          error: 'Database error checking existing user',
          message: existingUserErr.message,
          details: existingUserErr.details,
          hint: existingUserErr.hint,
          code: existingUserErr.code,
        },
        { status: 500 }
      );
    }

    if (existingUser) {
      return NextResponse.json({ error: 'User already exists' }, { status: 400 });
    }

    const { data: existingInvite, error: existingInviteErr } = await adminClient
      .from('pending_invites')
      .select('id')
      .eq('email', emailRaw)
      .eq('organization_id', targetOrgId)
      .maybeSingle();

    if (existingInviteErr) {
      return NextResponse.json(
        {
          error: 'Database error checking existing invite',
          message: existingInviteErr.message,
          details: existingInviteErr.details,
          hint: existingInviteErr.hint,
          code: existingInviteErr.code,
        },
        { status: 500 }
      );
    }

    if (existingInvite) {
      return NextResponse.json({ error: 'Invite already sent to this email' }, { status: 400 });
    }

    const origin = request.headers.get('origin') || '';
    const redirectTo = `${origin}/auth/callback?next=/set-password`;

    const { data: inviteData, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(emailRaw, {
        data: {
          role: inviteRole,
          organization_id: targetOrgId,
          invited_by: user.id,
        },
        redirectTo,
      });

    if (inviteError) {
      return NextResponse.json(
        {
          error: 'Invite error',
          message: inviteError.message,
          status: (inviteError as any).status,
          code: (inviteError as any).code,
        },
        { status: 500 }
      );
    }

    const invited = inviteData?.user;
    if (!invited?.id) {
      return NextResponse.json({ error: 'Invite failed (no user returned)' }, { status: 500 });
    }

    const { error: upsertErr } = await adminClient.from('user_profiles').upsert(
      {
        id: invited.id,
        email: emailRaw,
        role: inviteRole,
        organization_id: targetOrgId,
        disabled: true,
      },
      { onConflict: 'id' }
    );

    if (upsertErr) {
      return NextResponse.json(
        {
          error: 'user_profiles upsert failed',
          message: upsertErr.message,
          details: upsertErr.details,
          hint: upsertErr.hint,
          code: upsertErr.code,
        },
        { status: 500 }
      );
    }

    const { error: pendingError } = await adminClient.from('pending_invites').insert({
      email: emailRaw,
      role: inviteRole,
      invited_by: user.id,
      organization_id: targetOrgId,
    });

    if (pendingError) {
      return NextResponse.json(
        {
          error: 'pending_invites insert failed',
          message: pendingError.message,
          details: pendingError.details,
          hint: pendingError.hint,
          code: pendingError.code,
        },
        { status: 500 }
      );
    }

    const { error: auditError } = await adminClient.from('audit_logs').insert({
      action: 'user_invite',
      actor_id: user.id,
      target_id: invited.id,
      organization_id: targetOrgId,
      details: {
        message: `Invitation sent: ${inviteRole}`,
        actor_email: user.email,
        target_email: emailRaw,
        organization_name: selectedOrg.name,
      },
    });

    if (auditError) {
      console.error('Audit log insert failed:', auditError);
    }

    return NextResponse.json({
      success: true,
      message: 'Invite sent successfully',
      user: invited,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to send invite' },
      { status: 500 }
    );
  }
}