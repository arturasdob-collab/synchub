import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: NextRequest) {
  try {
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "Server misconfigured (missing env vars)" },
        { status: 500 }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userRes, error: authErr } = await adminClient.auth.getUser(token);
    const caller = userRes?.user;

    if (authErr || !caller) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: callerProfile, error: callerProfileErr } = await adminClient
      .from("user_profiles")
      .select("role, organization_id, disabled, is_super_admin")
      .eq("id", caller.id)
      .maybeSingle();

    if (callerProfileErr || !callerProfile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }

    if (callerProfile.disabled) {
      return NextResponse.json({ error: "Account disabled" }, { status: 403 });
    }

    const isSuperAdmin = !!callerProfile.is_super_admin;
    const isOwner = callerProfile.role === "OWNER";
    const isAdmin = callerProfile.role === "ADMIN";

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    let query = adminClient
      .from("user_profiles")
      .select(`
        id,
        email,
        first_name,
        last_name,
        role,
        organization_id,
        disabled,
        created_at,
        is_super_admin,
        is_creator,
        organizations(name)
      `)
      .order("created_at", { ascending: false });

    if (!isSuperAdmin) {
      query = query.eq("organization_id", callerProfile.organization_id);
    }

    const { data, error } = await query;
    const userEmails = (data ?? []).map((u: any) => u.email).filter(Boolean);

const { data: pendingInvites } = await adminClient
  .from("pending_invites")
  .select("email")
  .in("email", userEmails);

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch users", message: error.message },
        { status: 500 }
      );
    }

    const pendingEmailSet = new Set(
      (pendingInvites ?? []).map((invite: any) => invite.email?.toLowerCase())
    );
    
    const usersWithPending = (data ?? []).map((user: any) => ({
      ...user,
      is_pending: pendingEmailSet.has(user.email?.toLowerCase()),
    }));
    
    return NextResponse.json({ users: usersWithPending }, { status: 200 });

  } catch (e: any) {
    return NextResponse.json(
      { error: "Unexpected", message: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}