import { createContext, useContext } from 'react';
import type { User } from '@supabase/supabase-js';

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar: string;
  xp: number;
}

export type AuthMode = 'signin' | 'signup' | 'reset' | 'recovery';

export interface AuthValue {
  user: User | null;
  profile: Profile | null;
  /** True until the first session check finishes. */
  loading: boolean;
  authOpen: boolean;
  authMode: AuthMode;
  setAuthMode: (m: AuthMode) => void;
  openAuth: (mode?: AuthMode) => void;
  closeAuth: () => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, username: string) => Promise<{ error: string | null; needsConfirm: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<string | null>;
  updatePassword: (password: string) => Promise<string | null>;
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
