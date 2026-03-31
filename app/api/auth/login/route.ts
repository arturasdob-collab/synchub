import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Vienodas tekstas visiems login failams (banned / wrong pass / user not found / disabled)
const GENERIC_LOGIN_ERROR = 'Account not found or invalid credentials.';

function ipFromRequest(req: Request) {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

type RateRow = {
  key: string;
  fail_count: number;
  first_fail_at: string;
  locked_until: string | null;
};

async function getOrCreateRateRow(key: string): Promise<RateRow> {
  const { data } = await supabaseAdmin
    .from('login_rate_limits')
    .select('key, fail_count, first_fail_at, locked_until')
    .eq('key', key)
    .maybeSingle();

  if (data) return data as RateRow;

  const { data: created } = await supabaseAdmin
    .from('login_rate_limits')
    .insert({ key, fail_count: 0, first_fail_at: new Date().toISOString(), locked_until: null })
    .select('key, fail_count, first_fail_at, locked_until')
    .single();

  return created as RateRow;
}

async function setLock(key: string, seconds: number) {
  const lockedUntil = new Date(Date.now() + seconds * 1000).toISOString();
  await supabaseAdmin
    .from('login_rate_limits')
    .update({ locked_until: lockedUntil })
    .eq('key', key);
}

async function resetRate(key: string) {
  await supabaseAdmin
    .from('login_rate_limits')
    .update({ fail_count: 0, first_fail_at: new Date().toISOString(), locked_until: null })
    .eq('key', key);
}

async function incFail(key: string) {
  const row = await getOrCreateRateRow(key);

  const first = new Date(row.first_fail_at).getTime();
  const now = Date.now();
  const windowMs = 10 * 60 * 1000; // 10 min
  const inWindow = now - first <= windowMs;

  const newCount = inWindow ? row.fail_count + 1 : 1;
  const newFirst = inWindow ? row.first_fail_at : new Date().toISOString();

  await supabaseAdmin
    .from('login_rate_limits')
    .update({ fail_count: newCount, first_fail_at: newFirst })
    .eq('key', key);

  // lock logika (soft, kad nebūtų bruteforce)
  // 5 fail per 10 min -> lock 2 min
  // 10 fail per 10 min -> lock 10 min
  if (newCount >= 10) await setLock(key, 10 * 60);
  else if (newCount >= 5) await setLock(key, 2 * 60);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const emailRaw = (body?.email || '').toString().trim().toLowerCase();
    const password = (body?.password || '').toString();

    // Privalomi laukai -> vis tiek ta pati klaida
    if (!emailRaw || !password) {
      return NextResponse.json({ ok: false, error: GENERIC_LOGIN_ERROR }, { status: 401 });
    }

    // rate key: IP + email (kad neblokuotų viso IP visiems)
    const ip = ipFromRequest(req);
    const rateKey = `ip:${ip}|email:${emailRaw}`;

    const rate = await getOrCreateRateRow(rateKey);
    if (rate.locked_until && new Date(rate.locked_until).getTime() > Date.now()) {
      // tyčia ta pati klaida
      return NextResponse.json({ ok: false, error: GENERIC_LOGIN_ERROR }, { status: 401 });
    }

    // Bandome login su paprastu anon client
    const supabaseAnon = createClient(
      SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    const { data, error } = await supabaseAnon.auth.signInWithPassword({
      email: emailRaw,
      password,
    });

    // Bet kokia auth klaida -> increment fail + generic
    if (error || !data?.session || !data?.user) {
      await incFail(rateKey);
      return NextResponse.json({ ok: false, error: GENERIC_LOGIN_ERROR }, { status: 401 });
    }

    // Patikrinam disabled (profile)
    const { data: profile, error: profErr } = await supabaseAdmin
      .from('user_profiles')
      .select('disabled')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profErr) {
      // saugiau: neduodam detalių
      await supabaseAnon.auth.signOut();
      await incFail(rateKey);
      return NextResponse.json({ ok: false, error: GENERIC_LOGIN_ERROR }, { status: 401 });
    }

    if (profile?.disabled) {
      await supabaseAnon.auth.signOut();
      await incFail(rateKey);
      return NextResponse.json({ ok: false, error: GENERIC_LOGIN_ERROR }, { status: 401 });
    }

    // Success -> reset fail counter
    await resetRate(rateKey);

    // Gražinam session tokens, kad frontas galėtų susetinti session
    return NextResponse.json({
      ok: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: GENERIC_LOGIN_ERROR }, { status: 401 });
  }
}