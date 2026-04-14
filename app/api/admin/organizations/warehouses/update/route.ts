import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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
      .select('disabled, is_super_admin, is_creator')
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
    const warehouseId = String(body?.warehouseId || '').trim();
    const name = String(body?.name || '').trim();
    const address = normalizeNullableString(body?.address);
    const city = normalizeNullableString(body?.city);
    const postalCode = normalizeNullableString(body?.postal_code ?? body?.postalCode);
    const country = normalizeNullableString(body?.country);

    if (!warehouseId) {
      return NextResponse.json({ error: 'warehouseId is required' }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: 'Warehouse name is required' }, { status: 400 });
    }

    const { data: warehouse, error: warehouseError } = await adminClient
      .from('organization_warehouses')
      .update({
        name,
        address,
        city,
        postal_code: postalCode,
        country,
      })
      .eq('id', warehouseId)
      .select('id, name, address, city, postal_code, country, created_at, updated_at')
      .single();

    if (warehouseError || !warehouse) {
      return NextResponse.json(
        { error: warehouseError?.message || 'Failed to update warehouse' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, warehouse });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}
