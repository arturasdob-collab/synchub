'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Users, Globe, Shield } from 'lucide-react';
import { Organization } from '@/lib/types/database';

const supabase = createClient();

export default function DashboardPage() {
  const { profile } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [userCount, setUserCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!profile?.organization_id) return;

      const { data: orgData } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', profile.organization_id)
        .maybeSingle();

      if (orgData) {
        setOrganization(orgData);
      }

      let query = supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true });
    
      if (profile.is_super_admin) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
      
        if (session?.access_token) {
          const res = await fetch('/api/admin/users', {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          });
      
          const json = await res.json();
      
          if (res.ok) {
            setUserCount((json.users || []).length);
          } else {
            setUserCount(0);
          }
        } else {
          setUserCount(0);
        }
      } else {
        const { count } = await supabase
          .from('user_profiles')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', profile.organization_id);
      
        setUserCount(count || 0);
      }
      
      setLoading(false);
    };

    fetchData();
  }, [profile]);

  const stats = [
    {
      name: 'Organization',
      value: organization?.name || 'N/A',
      icon: Building2,
      bgColor: 'bg-blue-50',
      iconColor: 'text-blue-600',
    },
    {
      name: 'Organization Type',
      value: organization?.type || 'N/A',
      icon: Globe,
      bgColor: 'bg-green-50',
      iconColor: 'text-green-600',
    },
    {
      name: 'Team Members',
      value: userCount.toString(),
      icon: Users,
      bgColor: 'bg-orange-50',
      iconColor: 'text-orange-600',
    },
    {
      name: 'Your Role',
      value: profile?.role || 'N/A',
      icon: Shield,
      bgColor: 'bg-slate-50',
      iconColor: 'text-slate-600',
    },
  ];

  return (
    <div className="p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-600 mt-2">
            Welcome back, {profile?.full_name || profile?.email}
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="h-4 bg-slate-200 rounded w-24"></div>
                  <div className="h-8 w-8 bg-slate-200 rounded"></div>
                </CardHeader>
                <CardContent>
                  <div className="h-8 bg-slate-200 rounded w-32"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat) => (
              <Card key={stat.name} className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-slate-600">
                    {stat.name}
                  </CardTitle>
                  <div className={`${stat.bgColor} p-2 rounded-lg`}>
                    <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-slate-900 capitalize">
                    {stat.value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  Manage your profile and organization settings from the sidebar.
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                    Multi-tenant Ready
                  </span>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                    Role-based Access
                  </span>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                    Secure Authentication
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>System Information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-600">Country</dt>
                  <dd className="font-medium text-slate-900">
                    {profile?.country || 'Not set'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">Account Status</dt>
                  <dd className="font-medium text-green-600">Active</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">Member Since</dt>
                  <dd className="font-medium text-slate-900">
                    {profile?.created_at
                      ? new Date(profile.created_at).toLocaleDateString()
                      : 'N/A'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
