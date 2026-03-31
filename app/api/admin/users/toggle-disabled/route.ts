// app/api/admin/users/toggle-disabled/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, disabled } = body as { userId?: string; disabled?: boolean };

    if (!userId || typeof disabled !== 'boolean') {
      return NextResponse.json({ error: 'userId and disabled are required' }, { status: 400 });
    }

    // Service role client (SERVER ONLY)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1) update profile flag
    const { data: profileData, error: profileErr } = await supabaseAdmin
      .from('user_profiles')
      .update({ disabled })
      .eq('id', userId)
      .select('id,disabled')
      .single();

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 400 });
    }

    // 2) ban/unban auth user
    // disabled=true  -> ban (pvz. 10 metų)
    // disabled=false -> unban (ban_duration: 'none')
    const ban_duration = disabled ? '87600h' : 'none';

    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      ban_duration,
    });

    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, profile: profileData });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}