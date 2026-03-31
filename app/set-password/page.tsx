"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

function passwordRules(pw: string) {
  const minLen = pw.length >= 10;
  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  return { minLen, hasLower, hasUpper, hasNumber, hasSymbol };
}

function isStrong(pw: string) {
  const r = passwordRules(pw);
  return r.minLen && r.hasLower && r.hasUpper && r.hasNumber && r.hasSymbol;
}

function RequirementItem({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li
      style={{
        margin: "4px 0",
        color: ok ? "#111827" : "#6b7280",
        fontWeight: ok ? 700 : 400,
        opacity: ok ? 1 : 0.75,
        transition: "all 0.15s ease",
      }}
    >
      {text}
    </li>
  );
}

export default function SetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [organization, setOrganization] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const rules = useMemo(() => passwordRules(password), [password]);

  useEffect(() => {
    const loadUserData = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (error || !data.session) {
        router.replace("/login");
        return;
      }

      const userId = data.session.user.id;

      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select(`
          first_name,
          last_name,
          organization_id,
          organizations(name)
        `)
        .eq("id", userId)
        .single();

      if (!profileError && profile) {
        setFirstName((profile as any).first_name || "");
        setLastName((profile as any).last_name || "");

        const orgValue =
          Array.isArray((profile as any).organizations)
            ? (profile as any).organizations?.[0]?.name || ""
            : (profile as any).organizations?.name || "";

        setOrganization(orgValue);
      }

      setInitialLoading(false);
    };

    loadUserData();
  }, [router]);

  const submit = async () => {
    setMsg(null);

    if (!firstName.trim()) {
      setMsg("First name is required.");
      return;
    }

    if (!lastName.trim()) {
      setMsg("Last name is required.");
      return;
    }

    if (!organization.trim()) {
      setMsg("Organization is required.");
      return;
    }

    if (!isStrong(password)) {
      setMsg(
        "Password must be at least 10 characters and include: lowercase, uppercase, number, and symbol."
      );
      return;
    }

    if (password !== confirm) {
      setMsg("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        setMsg("Session not found. Please open the invite link again.");
        setLoading(false);
        return;
      }

      const userId = sessionData.session.user.id;

      const { error: authError } = await supabase.auth.updateUser({
        password,
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          organization_name: organization.trim(),
        },
      });

      if (authError) {
        setMsg(authError.message);
        setLoading(false);
        return;
      }

      const { error: profileError } = await supabase
      .from("user_profiles")
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        disabled: false,
      })
      .eq("id", userId);

      if (profileError) {
        setMsg(profileError.message);
        setLoading(false);
        return;
      }
      
      await supabase
        .from("pending_invites")
        .delete()
        .eq("email", sessionData.session.user.email);
      
      router.replace("/app");
    } catch (error: any) {
      setMsg(error?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f3f4f6",
        }}
      >
        <div style={{ fontSize: "16px", color: "#6b7280" }}>Loading...</div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f3f4f6",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "560px",
          backgroundColor: "#ffffff",
          padding: "32px",
          borderRadius: "14px",
          boxShadow: "0 14px 35px rgba(0,0,0,0.10)",
        }}
      >
        <h1
          style={{
            fontSize: "26px",
            fontWeight: 800,
            marginBottom: "8px",
            textAlign: "center",
          }}
        >
          Complete your account
        </h1>

        <p
          style={{
            marginBottom: "22px",
            color: "#6b7280",
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          Fill in your details and create a strong password to activate your account.
        </p>

        {msg && (
          <div
            style={{
              border: "1px solid #fecaca",
              background: "#fef2f2",
              color: "#b91c1c",
              padding: "10px 12px",
              borderRadius: "10px",
              marginBottom: "14px",
              fontSize: "14px",
            }}
          >
            {msg}
          </div>
        )}

        <div style={{ display: "grid", gap: "14px", marginBottom: "18px" }}>
          <div>
            <label
              style={{
                fontWeight: 700,
                display: "block",
                marginBottom: "8px",
              }}
            >
              First name
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              style={{
                width: "100%",
                padding: "12px",
                border: "1px solid #d1d5db",
                borderRadius: "10px",
                backgroundColor: "#ffffff",
                color: "#111827",
                outline: "none",
              }}
              placeholder="Enter your first name"
            />
          </div>

          <div>
            <label
              style={{
                fontWeight: 700,
                display: "block",
                marginBottom: "8px",
              }}
            >
              Last name
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              style={{
                width: "100%",
                padding: "12px",
                border: "1px solid #d1d5db",
                borderRadius: "10px",
                backgroundColor: "#ffffff",
                color: "#111827",
                outline: "none",
              }}
              placeholder="Enter your last name"
            />
          </div>

          <div>
            <label
              style={{
                fontWeight: 700,
                display: "block",
                marginBottom: "8px",
              }}
            >
              Organization
            </label>
            <input
  type="text"
  value={organization}
  readOnly
  style={{
    width: "100%",
    padding: "12px",
    border: "1px solid #d1d5db",
    borderRadius: "10px",
    backgroundColor: "#f3f4f6",
    color: "#111827",
    outline: "none",
    cursor: "not-allowed",
  }}
/>
          </div>
        </div>

        <label
          style={{
            fontWeight: 700,
            display: "block",
            marginBottom: "8px",
          }}
        >
          Password
        </label>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: "100%",
            padding: "12px",
            margin: "0 0 14px",
            border: "1px solid #d1d5db",
            borderRadius: "10px",
            backgroundColor: "#ffffff",
            color: "#111827",
            outline: "none",
          }}
          autoComplete="new-password"
        />

        <ul
          style={{
            fontSize: "13px",
            marginBottom: "18px",
            textAlign: "center",
            listStylePosition: "inside",
            padding: 0,
          }}
        >
          <RequirementItem ok={rules.minLen} text="At least 10 characters" />
          <RequirementItem ok={rules.hasLower} text="1 lowercase letter" />
          <RequirementItem ok={rules.hasUpper} text="1 uppercase letter" />
          <RequirementItem ok={rules.hasNumber} text="1 number" />
          <RequirementItem ok={rules.hasSymbol} text="1 symbol (e.g. !@#$)" />
        </ul>

        <label
          style={{
            fontWeight: 800,
            display: "block",
            marginBottom: "8px",
            marginTop: "6px",
          }}
        >
          Confirm password
        </label>

        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          style={{
            width: "100%",
            padding: "12px",
            margin: "0 0 18px",
            border: "1px solid #d1d5db",
            borderRadius: "10px",
            backgroundColor: "#ffffff",
            color: "#111827",
            outline: "none",
          }}
          autoComplete="new-password"
        />

        <button
          onClick={submit}
          disabled={loading}
          style={{
            width: "100%",
            padding: "14px",
            fontWeight: 800,
            borderRadius: "12px",
            backgroundColor: "#111827",
            color: "#ffffff",
            border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            boxShadow: "0 10px 22px rgba(17,24,39,0.18)",
          }}
        >
          {loading ? "Saving…" : "Save and activate account"}
        </button>
      </div>
    </div>
  );
}