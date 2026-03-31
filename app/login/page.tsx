'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Building2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const GENERIC_LOGIN_ERROR =
  'Account not found or invalid credentials.';

  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam === 'account_disabled') {
      setError('Your account has been disabled. Please contact your administrator.');
    }
    
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const GENERIC_LOGIN_ERROR =
      'User does not exist or the login credentials are incorrect.';
    
      const start = Date.now();

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      
      const json = await res.json().catch(() => null);
      
      // visada “lojali” klaida
      if (!res.ok || !json?.ok) {
        await delayResponse(start);
        setError(GENERIC_LOGIN_ERROR);
        setLoading(false);
        return;
      }
      
      // susetinam session į browser supabase klientą
      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: json.session.access_token,
        refresh_token: json.session.refresh_token,
      });
      
      if (setSessionError) {
        await delayResponse(start);
        setError(GENERIC_LOGIN_ERROR);
        setLoading(false);
        return;
      }

      router.push('/app');
    } catch (err: any) {
      setError(err.message || 'An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-slate-900 p-3 rounded-lg">
              <Building2 className="h-8 w-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Welcome to SyncHub</CardTitle>
          <CardDescription>
            Sign in to your account to continue
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
         </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>

            <button
              type="button"
              className="text-sm underline text-center"
              onClick={async () => {
                if (!email) return alert('Enter email first');

                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                  redirectTo: `${window.location.origin}/set-password`,
                });

                if (error) alert(error.message);
                else alert('Password reset email sent');
              }}
            >
              Forgot password?
            </button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
async function delayResponse(start: number) {
  const MIN_RESPONSE_TIME = 1200;
  const elapsed = Date.now() - start;

  if (elapsed < MIN_RESPONSE_TIME) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_RESPONSE_TIME - elapsed)
    );
  }
}