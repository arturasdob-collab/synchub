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

    const { data: deletedCount, error: cleanupError } = await adminClient
      .rpc('cleanup_expired_invites');

    if (cleanupError) {
      console.error('Cleanup error:', cleanupError);
      return NextResponse.json({ error: cleanupError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      deletedCount: deletedCount || 0,
      message: `Cleaned up ${deletedCount || 0} expired invite(s)`
    });

  } catch (error: any) {
    console.error('Cleanup API error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to cleanup expired invites'
    }, { status: 500 });
  }
}
