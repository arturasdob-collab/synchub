'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Building2, CheckCircle2 } from 'lucide-react';

export default function SetPasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({ newPassword: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          setIsAuthenticated(false);
        } else {
          setIsAuthenticated(true);
        }
      } catch (err) {
        setIsAuthenticated(false);
      } finally {
        setCheckingAuth(false);
      }
    };

    checkUser();
  }, []);

  const validatePassword = (password: string): string => {
    if (password.length < 8) {
      return 'Password must be at least 8 characters';
    }
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({ newPassword: '', confirmPassword: '' });

    const newPasswordError = validatePassword(newPassword);
    if (newPasswordError) {
      setFieldErrors(prev => ({ ...prev, newPassword: newPasswordError }));
      return;
    }

    if (newPassword !== confirmPassword) {
      setFieldErrors(prev => ({ ...prev, confirmPassword: 'Passwords do not match' }));
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();

      if (user?.email) {
        const { data: pendingInvite } = await supabase
          .from('pending_invites')
          .select('role')
          .eq('email', user.email)
          .maybeSingle();

        if (pendingInvite) {
          const { error: profileError } = await supabase
            .from('user_profiles')
            .update({ role: pendingInvite.role })
            .eq('id', user.id);

          if (!profileError) {
            await supabase
              .from('pending_invites')
              .delete()
              .eq('email', user.email);
          }
        }
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/');
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'An error occurred while setting your password');
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-slate-900 p-3 rounded-lg">
                <Building2 className="h-8 w-8 text-white" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">Invitation Expired</CardTitle>
            <CardDescription>
              Invitation link expired. Please ask admin to resend the invite.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button
              className="w-full"
              onClick={() => router.push('/login')}
            >
              Go to Login
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-green-600 p-3 rounded-lg">
                <CheckCircle2 className="h-8 w-8 text-white" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">Password Set Successfully</CardTitle>
            <CardDescription>
              Redirecting to your dashboard...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-slate-900 p-3 rounded-lg">
              <Building2 className="h-8 w-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Set Your Password</CardTitle>
          <CardDescription>
            Create a secure password for your account
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (fieldErrors.newPassword) {
                    setFieldErrors(prev => ({ ...prev, newPassword: '' }));
                  }
                }}
                required
                disabled={loading}
              />
              {fieldErrors.newPassword && (
                <p className="text-sm text-red-600">{fieldErrors.newPassword}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (fieldErrors.confirmPassword) {
                    setFieldErrors(prev => ({ ...prev, confirmPassword: '' }));
                  }
                }}
                required
                disabled={loading}
              />
              {fieldErrors.confirmPassword && (
                <p className="text-sm text-red-600">{fieldErrors.confirmPassword}</p>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Setting password...' : 'Set Password'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
