import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

    const organizationId =
      typeof req.nextUrl.searchParams.get('organizationId') === 'string'
        ? req.nextUrl.searchParams.get('organizationId')!.trim()
        : '';

    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId is required' },
        { status: 400 }
      );
    }

    const { data: organization, error: organizationError } = await adminClient
      .from('organizations')
      .select(
        `
          id,
          name,
          type,
          company_code,
          vat_code,
          address,
          city,
          postal_code,
          country,
          contact_phone,
          contact_email,
          notes,
          created_at
        `
      )
      .eq('id', organizationId)
      .single();

    if (organizationError) {
      return NextResponse.json(
        { error: organizationError.message || 'Failed to load organization' },
        { status: 500 }
      );
    }

    if (!organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const { data: employees, error: employeesError } = await adminClient
      .from('user_profiles')
      .select(
        `
          id,
          first_name,
          last_name,
          email,
          phone,
          position,
          role,
          disabled,
          created_at
        `
      )
      .eq('organization_id', organizationId)
      .order('first_name', { ascending: true })
      .order('last_name', { ascending: true });

    if (employeesError) {
      return NextResponse.json(
        { error: employeesError.message },
        { status: 500 }
      );
    }

    const { count: pendingInvitesCount, error: invitesError } = await adminClient
      .from('pending_invites')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId);

    if (invitesError) {
      return NextResponse.json(
        { error: invitesError.message },
        { status: 500 }
      );
    }

    const { data: warehouses, error: warehousesError } = await adminClient
      .from('organization_warehouses')
      .select('id, name, address, city, postal_code, country, created_at, updated_at')
      .eq('organization_id', organizationId)
      .order('name', { ascending: true });

    if (warehousesError) {
      return NextResponse.json(
        { error: warehousesError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      organization: {
        ...organization,
        updated_at: null,
      },
      employees: employees || [],
      warehouses: warehouses || [],
      pending_invites_count: pendingInvitesCount ?? 0,
      can_manage:
        !!callerProfile.is_super_admin || !!callerProfile.is_creator,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to fetch organization details' },
      { status: 500 }
    );
  }
}
