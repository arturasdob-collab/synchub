"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

function parseHash(hash: string) {
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(h);
  return {
    access_token: params.get("access_token"),
    refresh_token: params.get("refresh_token"),
    error: params.get("error"),
    error_code: params.get("error_code"),
    error_description: params.get("error_description"),
    type: params.get("type"),
  };
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const search = useSearchParams();

  useEffect(() => {
    (async () => {
      // kur po callback nukreipti (pvz. /set-password)
      const next = search.get("next") || "/";

      // 1) jei supabase atsiuntė "code" query param (PKCE)
      const code = search.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          router.replace(`/login?error=${encodeURIComponent(error.message)}`);
          return;
        }
        router.replace(next);
        return;
      }

      // 2) jei supabase atsiuntė tokenus HASH'e (implicit)
      const { access_token, refresh_token, error, error_description } = parseHash(
        window.location.hash || ""
      );

      if (error) {
        router.replace(
          `/login?error=${encodeURIComponent(error_description || error)}`
        );
        return;
      }

      if (access_token && refresh_token) {
        const { error: setErr } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });

        if (setErr) {
          router.replace(`/login?error=${encodeURIComponent(setErr.message)}`);
          return;
        }

        // nuvalom hash iš URL
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);

        router.replace(next);
        return;
      }

      // jei nieko nėra – reiškia linkas neteisingas/pasibaigęs
      router.replace(`/login?error=${encodeURIComponent("Missing code/token in callback URL")}`);
    })();
  }, [router, search]);

  return (
    <div style={{ padding: 24 }}>
      Processing authentication…
    </div>
  );
}