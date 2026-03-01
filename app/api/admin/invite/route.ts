import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await adminClient
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
    }

    if (!['OWNER', 'ADMIN'].includes(profile.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { email, role } = body;

    if (!email || !role) {
      return NextResponse.json({ error: 'Email and role are required' }, { status: 400 });
    }

    const validRoles = ['OWNER', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'FINANCE'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    if (role === 'OWNER' && profile.role !== 'OWNER') {
      return NextResponse.json({ error: 'Only OWNER can invite other OWNERs' }, { status: 403 });
    }

    const { data: existingUser, error: checkError } = await adminClient
      .from('user_profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json({ error: 'User already exists' }, { status: 400 });
    }

    const { data: existingInvite } = await adminClient
      .from('pending_invites')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingInvite) {
      return NextResponse.json({ error: 'Invite already sent to this email' }, { status: 400 });
    }

    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: {
        role: role
      },
      redirectTo: `${request.headers.get('origin')}/set-password`
    });

    if (inviteError) {
      console.error('Invite error:', inviteError);
      return NextResponse.json({ error: inviteError.message }, { status: 500 });
    }

    const { error: pendingError } = await adminClient
      .from('pending_invites')
      .insert({
        email,
        role,
        invited_by: user.id
      });

    if (pendingError) {
      console.error('Pending invite error:', pendingError);
    }

    return NextResponse.json({
      success: true,
      message: 'Invite sent successfully',
      user: inviteData.user
    });

  } catch (error: any) {
    console.error('Invite API error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to send invite'
    }, { status: 500 });
  }
}
