import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './client';
import { flushPendingRuns } from './api';
import { AuthContext, type AuthMode, type AuthValue, type Profile } from './context';
import { AuthModal } from './AuthModal';
import './dps.css';

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'Wrong email or password.';
  if (m.includes('email not confirmed')) return 'Please confirm your email first — check your inbox.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('already registered')) return 'An account with that email already exists. Try signing in.';
  if (m.includes('password') && m.includes('characters')) return 'Password is too short.';
  return message;
}

async function fetchProfile(id: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id,username,display_name,avatar,xp')
    .eq('id', id)
    .maybeSingle();
  return (data as Profile | null) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signin');

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (event === 'PASSWORD_RECOVERY') {
        setAuthMode('recovery');
        setAuthOpen(true);
      }
      if (event === 'SIGNED_IN') {
        // never await Supabase calls directly inside this callback
        setTimeout(() => void flushPendingRuns(), 0);
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const uid = user?.id ?? null;

  const refreshProfile = useCallback(async () => {
    if (!uid) return;
    setProfile(await fetchProfile(uid));
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setProfile(null);
      return;
    }
    let alive = true;
    fetchProfile(uid).then((p) => alive && setProfile(p));
    return () => {
      alive = false;
    };
  }, [uid]);

  useEffect(() => {
    const onXp = () => void refreshProfile();
    window.addEventListener('dps:xp', onXp);
    return () => window.removeEventListener('dps:xp', onXp);
  }, [refreshProfile]);

  const openAuth = useCallback((mode: AuthMode = 'signin') => {
    setAuthMode(mode);
    setAuthOpen(true);
  }, []);
  const closeAuth = useCallback(() => setAuthOpen(false), []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? friendly(error.message) : null;
  }, []);

  const signUp = useCallback(async (email: string, password: string, username: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username, display_name: username },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) return { error: friendly(error.message), needsConfirm: false };
    // Supabase hides "already registered" by returning a user with no identities.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return { error: 'An account with that email already exists. Try signing in.', needsConfirm: false };
    }
    return { error: null, needsConfirm: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    return error ? friendly(error.message) : null;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    return error ? friendly(error.message) : null;
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      profile,
      loading,
      authOpen,
      authMode,
      setAuthMode,
      openAuth,
      closeAuth,
      signIn,
      signUp,
      signOut,
      resetPassword,
      updatePassword,
      refreshProfile,
    }),
    [user, profile, loading, authOpen, authMode, openAuth, closeAuth, signIn, signUp, signOut, resetPassword, updatePassword, refreshProfile],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <AuthModal />
    </AuthContext.Provider>
  );
}
