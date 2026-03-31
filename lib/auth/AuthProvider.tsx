'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { UserProfile } from '@/lib/types/database';

const supabase = createClient();

type ExtendedUserProfile = UserProfile & {
  is_super_admin: boolean;
  is_creator?: boolean;
  organizations?: {
    id: string;
    name: string;
    type: string | null;
  } | null;
};

interface AuthContextType {
  user: User | null;
  profile: ExtendedUserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ExtendedUserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data: profileData, error: profileErr } = await supabase
      .from('user_profiles')
      .select(`
        id,
        email,
        role,
        organization_id,
        disabled,
        created_at,
        is_super_admin,
        is_creator,
organizations (
  id,
  name
)
      `)
      .eq('id', userId)
      .maybeSingle();
  
    if (profileErr) {
      console.error('Failed to load user profile:', profileErr);
      setProfile(null);
      return;
    }
  
    if (!profileData) {
      setProfile(null);
      return;
    }
  
    const orgValue = Array.isArray(profileData.organizations)
    ? profileData.organizations[0] ?? null
    : profileData.organizations ?? null;
  
    setProfile({
      id: profileData.id,
      email: profileData.email,
      role: profileData.role,
      organization_id: profileData.organization_id,
      disabled: profileData.disabled,
      created_at: profileData.created_at,
      is_super_admin: !!profileData.is_super_admin,
      is_creator: !!profileData.is_creator,
      organizations: orgValue,
    } as ExtendedUserProfile);
  };

  const refreshProfile = async () => {
    if (user?.id) await fetchProfile(user.id);
  };

  useEffect(() => {
    let isMounted = true;

    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (!isMounted) return;

        const sessionUser = session?.user ?? null;
        setUser(sessionUser);

        if (sessionUser) {
          await fetchProfile(sessionUser.id);
        } else {
          setProfile(null);
        }

        if (isMounted) setLoading(false);
      })
      .catch((err) => {
        console.error('getSession error:', err);
        if (isMounted) {
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        if (!isMounted) return;

        setLoading(true);

        const sessionUser = session?.user ?? null;
        setUser(sessionUser);

        if (sessionUser) {
          await fetchProfile(sessionUser.id);
        } else {
          setProfile(null);
        }

        if (isMounted) setLoading(false);
      })();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}