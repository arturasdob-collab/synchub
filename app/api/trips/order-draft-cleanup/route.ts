export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function GET(req: Request) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
  
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  const cookieStore = cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile, error: profileError } = await serviceSupabase
    .from('user_profiles')
    .select('role, is_super_admin, is_creator')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
  }

  const canCleanup =
    profile.is_super_admin === true ||
    profile.is_creator === true ||
    profile.role === 'OWNER';

  if (!canCleanup) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const cutoffIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: oldDrafts, error: oldDraftsError } = await serviceSupabase
    .from('trip_order_drafts')
    .select('id')
    .lt('updated_at', cutoffIso);

  if (oldDraftsError) {
    return NextResponse.json({ error: oldDraftsError.message }, { status: 500 });
  }

  if (!oldDrafts || oldDrafts.length === 0) {
    return NextResponse.json({
      success: true,
      deletedCount: 0,
      message: 'No old drafts found',
    });
  }

  const ids = oldDrafts.map((d) => d.id);

  const { error: deleteError } = await serviceSupabase
    .from('trip_order_drafts')
    .delete()
    .in('id', ids);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    deletedCount: ids.length,
    message: 'Old drafts deleted successfully',
  });
}