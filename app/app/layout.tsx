'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { AuthProvider, useAuth } from '@/lib/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, Settings, Building2, LogOut, Menu, Users, Shield } from 'lucide-react';
import { useState } from 'react';
import { AdminGuard } from './AdminGuard';

function AppLayoutContent({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isAdmin = profile?.role === 'OWNER' || profile?.role === 'ADMIN';

  useEffect(() => {
    // Don't do anything while still loading
    if (loading) {
      return;
    }

    // Redirect to login if no user
    if (!user) {
      router.push('/login');
      return;
    }

    // Don't proceed with other checks if profile isn't loaded yet
    if (!profile) {
      return;
    }

    // Check if account is disabled
    if (profile.disabled) {
      signOut();
      router.push('/login?error=account_disabled');
      return;
    }
  }, [user, loading, profile, router, signOut]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || !profile) {
    return null;
  }

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const mainNavigation = [
    { name: 'Dashboard', href: '/app', icon: LayoutDashboard },
  ];

  const adminNavigation = isAdmin ? [
    { name: 'Manage Users', href: '/app/admin/users', icon: Users },
  ] : [];

  const accountNavigation = [
    { name: 'Settings', href: '/app/settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="bg-slate-900 p-2 rounded-lg">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg">SyncHub</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="lg:flex">
        <div className={`
          fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200
          transform transition-transform duration-200 ease-in-out
          lg:translate-x-0 lg:static
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <div className="flex flex-col h-full">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <div className="bg-slate-900 p-2 rounded-lg">
                  <Building2 className="h-6 w-6 text-white" />
                </div>
                <span className="font-bold text-xl">SyncHub</span>
              </div>
            </div>

            <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
              <div>
                {mainNavigation.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`
                        flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors
                        ${isActive
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-700 hover:bg-slate-100'
                        }
                      `}
                    >
                      <item.icon className="h-5 w-5" />
                      <span className="font-medium">{item.name}</span>
                    </Link>
                  );
                })}
              </div>

              {isAdmin && (
                <div>
                  <div className="px-4 mb-2">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                      <Shield className="h-3 w-3" />
                      Admin
                    </h3>
                  </div>
                  {adminNavigation.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className={`
                          flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors
                          ${isActive
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-700 hover:bg-slate-100'
                          }
                        `}
                      >
                        <item.icon className="h-5 w-5" />
                        <span className="font-medium">{item.name}</span>
                      </Link>
                    );
                  })}
                </div>
              )}

              <div>
                <div className="px-4 mb-2">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Account
                  </h3>
                </div>
                {accountNavigation.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`
                        flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors
                        ${isActive
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-700 hover:bg-slate-100'
                        }
                      `}
                    >
                      <item.icon className="h-5 w-5" />
                      <span className="font-medium">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </nav>

            <div className="p-4 border-t border-slate-200">
              <div className="mb-4 px-4">
                <p className="text-sm font-medium text-slate-900">{profile.full_name || profile.email}</p>
                <p className="text-xs text-slate-500">{profile.role}</p>
              </div>
              <Button
                variant="ghost"
                className="w-full justify-start text-slate-700 hover:bg-slate-100"
                onClick={handleSignOut}
              >
                <LogOut className="h-5 w-5 mr-3" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>

        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div className="flex-1 lg:ml-0">
          <div className="pt-16 lg:pt-0">
            <div className="bg-yellow-100 border-b-2 border-yellow-400 px-4 py-2 text-center">
              <p className="text-sm font-bold text-yellow-900">
                BUILD MARK: 2026-03-01 AdminGuard v2
              </p>
            </div>
            <AdminGuard>{children}</AdminGuard>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppLayoutContent>{children}</AppLayoutContent>
    </AuthProvider>
  );
}
