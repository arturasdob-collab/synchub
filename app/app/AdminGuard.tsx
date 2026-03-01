'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [willRedirect, setWillRedirect] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);

  const showDebug = searchParams.get('debug') === '1';
  const isAdminPath = pathname?.startsWith('/app/admin');
  const isAdmin = profile?.role === 'OWNER' || profile?.role === 'ADMIN';

  useEffect(() => {
    if (isAdminPath && !loading && profile) {
      const adminCheck = profile.role === 'OWNER' || profile.role === 'ADMIN';
      if (!adminCheck) {
        setWillRedirect(true);

        // If debug mode is on, delay the redirect by 2 seconds
        if (showDebug) {
          setRedirectCountdown(2);
          const timer = setTimeout(() => {
            router.replace('/app');
          }, 2000);
          return () => clearTimeout(timer);
        } else {
          // No debug mode, redirect immediately
          router.replace('/app');
        }
      } else {
        setWillRedirect(false);
        setRedirectCountdown(null);
      }
    }
  }, [isAdminPath, loading, profile, router, showDebug]);

  // Show debug overlay if requested
  if (showDebug && isAdminPath) {
    return (
      <>
        <div className="fixed top-4 right-4 z-[100] bg-yellow-100 border-2 border-yellow-400 rounded-lg p-4 shadow-lg max-w-sm">
          <h3 className="font-bold text-sm mb-2 text-yellow-900">🐛 Admin Debug Info</h3>
          <div className="space-y-1 text-xs font-mono">
            <div className="flex justify-between gap-4">
              <span className="text-yellow-800">pathname:</span>
              <span className="text-yellow-900 font-semibold">{pathname || 'null'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-yellow-800">loading:</span>
              <span className="text-yellow-900 font-semibold">{loading ? 'true' : 'false'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-yellow-800">profile exists:</span>
              <span className="text-yellow-900 font-semibold">{profile ? 'true' : 'false'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-yellow-800">profile.role:</span>
              <span className="text-yellow-900 font-semibold">{profile?.role || 'null'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-yellow-800">computed isAdmin:</span>
              <span className="text-yellow-900 font-semibold">{isAdmin ? 'true' : 'false'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-yellow-800">will redirect:</span>
              <span className="text-yellow-900 font-semibold">{willRedirect ? 'true' : 'false'}</span>
            </div>
            {redirectCountdown !== null && (
              <div className="flex justify-between gap-4 mt-2 pt-2 border-t border-yellow-300">
                <span className="text-yellow-800">status:</span>
                <span className="text-red-600 font-semibold">Redirecting in {redirectCountdown}s...</span>
              </div>
            )}
          </div>
        </div>
        {(loading || !profile) ? (
          <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto"></div>
              <p className="mt-4 text-slate-600">Loading admin check...</p>
            </div>
          </div>
        ) : willRedirect ? (
          <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="text-center">
              <div className="text-6xl mb-4">⏳</div>
              <p className="text-slate-900 font-semibold">Access Denied</p>
              <p className="mt-2 text-slate-600">Redirecting in {redirectCountdown}s...</p>
            </div>
          </div>
        ) : children}
      </>
    );
  }

  // Admin path logic (without debug)
  if (isAdminPath) {
    // Show loading while checking permissions
    if (loading || !profile) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto"></div>
            <p className="mt-4 text-slate-600">Loading...</p>
          </div>
        </div>
      );
    }

    // If not admin, don't render anything (redirect is happening)
    if (!isAdmin || willRedirect) {
      return null;
    }
  }

  // Render children for admin users or non-admin paths
  return <>{children}</>;
}
