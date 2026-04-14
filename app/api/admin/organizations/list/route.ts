import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function formatOrganizationType(value: string | null) {
  if (!value) return '-';

  if (value === 'terminal') return 'Terminal';
  if (value === 'warehouse') return 'Warehouse';
  if (value === 'partner') return 'Partner';
  if (value === 'company') return 'Company';

  return value;
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

    const { data: authRes, error: authErr } = await adminClient.auth.getUser(token);
    const caller = authRes?.user;

    if (authErr || !caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: callerProfile, error: profileErr } = await adminClient
      .from('user_profiles')
      .select('disabled, is_super_admin, is_creator, role')
      .eq('id', caller.id)
      .maybeSingle();

    if (profileErr || !callerProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
    }

    if (callerProfile.disabled) {
      return NextResponse.json({ error: 'Account disabled' }, { status: 403 });
    }

    const canViewOrganizations =
      callerProfile.is_super_admin ||
      callerProfile.is_creator ||
      callerProfile.role === 'OWNER' ||
      callerProfile.role === 'ADMIN';

    if (!canViewOrganizations) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { data: organizations, error: organizationsError } = await adminClient
      .from('organizations')
      .select(
        'id, name, type, company_code, address, city, postal_code, country, created_at'
      )
      .order('name', { ascending: true });

    if (organizationsError) {
      return NextResponse.json(
        {
          error: 'Failed to fetch organizations',
          message: organizationsError.message,
          details: organizationsError.details,
          hint: organizationsError.hint,
          code: organizationsError.code,
        },
        { status: 500 }
      );
    }

    const organizationsWithCounts = await Promise.all(
      (organizations ?? []).map(async (org) => {
        const { count: usersCount, error: usersCountError } = await adminClient
          .from('user_profiles')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', org.id);

        if (usersCountError) {
          throw new Error(
            `Failed to count users for organization ${org.name}: ${usersCountError.message}`
          );
        }

        const { count: invitesCount, error: invitesCountError } = await adminClient
          .from('pending_invites')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', org.id);

        if (invitesCountError) {
          throw new Error(
            `Failed to count invites for organization ${org.name}: ${invitesCountError.message}`
          );
        }

        return {
          ...org,
          display_type: formatOrganizationType(org.type ?? null),
          users_count: usersCount ?? 0,
          pending_invites_count: invitesCount ?? 0,
        };
      })
    );

    return NextResponse.json(
      {
        viewer_user_id: caller.id,
        organizations: organizationsWithCounts,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to fetch organizations' },
      { status: 500 }
    );
  }
}
