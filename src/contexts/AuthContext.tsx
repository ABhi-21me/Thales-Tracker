import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import {
  adminClient,
  clearRememberDevice,
  isSupabaseConfigured,
  viewerClient,
} from '../lib/supabase';
import { useToast } from '../components/ui/Toast';

export type UserRole = 'admin' | 'viewer' | null;

interface AuthContextValue {
  client: SupabaseClient;
  session: Session | null;
  role: UserRole;
  isAdmin: boolean;
  hasAccess: boolean;
  authReady: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { showToast } = useToast();
  const [adminSession, setAdminSession] = useState<Session | null>(null);
  const [viewerSession, setViewerSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let active = true;

    Promise.all([adminClient.auth.getSession(), viewerClient.auth.getSession()])
      .then(([adminRes, viewerRes]) => {
        if (!active) return;
        setAdminSession(adminRes.error ? null : adminRes.data.session ?? null);
        setViewerSession(viewerRes.error ? null : viewerRes.data.session ?? null);
        if (adminRes.error || viewerRes.error) {
          showToast('Session expired. Please sign in again.', 'info');
        }
        setAuthReady(true);
      })
      .catch(() => {
        if (!active) return;
        setAdminSession(null);
        setViewerSession(null);
        setAuthReady(true);
      });

    const { data: adminSub } = adminClient.auth.onAuthStateChange((event, nextSession) => {
      setAdminSession(nextSession ?? null);
      if (event === 'TOKEN_REFRESHED' && !nextSession) {
        showToast('Admin session expired. Please sign in again.', 'info');
      }
    });

    const { data: viewerSub } = viewerClient.auth.onAuthStateChange((event, nextSession) => {
      setViewerSession(nextSession ?? null);
      if (event === 'TOKEN_REFRESHED' && !nextSession) {
        clearRememberDevice();
        showToast('Session expired. Please sign in again.', 'info');
      }
    });

    return () => {
      active = false;
      adminSub.subscription.unsubscribe();
      viewerSub.subscription.unsubscribe();
    };
  }, [showToast]);

  const activeClient = adminSession ? adminClient : viewerClient;
  const activeSession = adminSession ?? viewerSession;
  const rawRole = activeSession?.user?.app_metadata?.role as string | undefined;
  const role: UserRole = rawRole === 'admin' ? 'admin' : rawRole === 'viewer' ? 'viewer' : null;
  const isAdmin = role === 'admin' && Boolean(adminSession);
  const hasAccess = Boolean(activeSession && (role === 'admin' || role === 'viewer'));

  const signOut = useCallback(async () => {
    if (adminSession) {
      await adminClient.auth.signOut({ scope: 'local' });
      setAdminSession(null);
      showToast(
        viewerSession ? 'Signed out of Admin (returned to viewer)' : 'Signed out of Admin',
        'info'
      );
    } else if (viewerSession) {
      await viewerClient.auth.signOut({ scope: 'local' });
      clearRememberDevice();
      setViewerSession(null);
      showToast('Signed out', 'info');
    }
  }, [adminSession, viewerSession, showToast]);

  return (
    <AuthContext.Provider
      value={{
        client: activeClient,
        session: activeSession,
        role,
        isAdmin,
        hasAccess,
        authReady,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
