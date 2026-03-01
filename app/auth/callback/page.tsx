'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');

      if (!code) {
        router.push('/login');
        return;
      }

      try {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          console.error('Error exchanging code for session:', error);
          router.push('/login');
          return;
        }

        router.push('/set-password');
      } catch (error) {
        console.error('Unexpected error:', error);
        router.push('/login');
      }
    };

    handleCallback();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
        <p className="mt-4 text-sm text-muted-foreground">Completing authentication...</p>
      </div>
    </div>
  );
}
