'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  sendEmailVerification,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { ApiClientError, apiFetch } from '@/lib/client/api';

export interface AccountSummary {
  uid: string;
  email: string | null;
  displayName: string;
  emailVerified: boolean;
  isAdmin: boolean;
  planId: 'starter' | 'business' | 'professional' | 'enterprise';
  planName: string;
  usage: {
    month: string;
    transcriptionSeconds: number;
    transcriptionCount: number;
    chatRequests: number;
    chatTokens: number;
    callMinutes: number;
    callCount: number;
    estimatedCostUsd: number;
  } | null;
  limits: {
    agents: number | null;
    transcriptionSecondsPerMonth: number | null;
    chatRequestsPerMonth: number | null;
    callMinutesPerMonth: number | null;
  } | null;
  serverMetering: boolean;
  retentionDays?: number;
  phone?: string;
  country?: string;
  capabilities: {
    groq: { configured: boolean; textModel: string; whisperModel: string };
    telephony: {
      provider: 'twilio';
      configured: boolean;
      callingEnabled: boolean;
      phoneNumber: string | null;
    };
  } | null;
  warning?: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  account: AccountSummary | null;
  accountLoading: boolean;
  accountError: { message: string; hint?: string } | null;
  refreshAccount: () => Promise<void>;
  resendVerification: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState<{ message: string; hint?: string } | null>(null);
  const loadedFor = useRef<string | null>(null);

  const refreshAccount = useCallback(async () => {
    const current = getFirebaseAuth().currentUser;
    if (!current) {
      setAccount(null);
      setAccountError(null);
      return;
    }
    setAccountLoading(true);
    try {
      const data = await apiFetch<{
        user: { uid: string; email: string | null; displayName: string | null; emailVerified?: boolean; isAdmin?: boolean };
        plan?: { id: AccountSummary['planId']; name: string };
        usage?: AccountSummary['usage'];
        limits?: AccountSummary['limits'];
        serverMetering: boolean;
        capabilities?: AccountSummary['capabilities'];
        profile?: { retentionDays?: number; phone?: string; country?: string } | null;
        warning?: string;
      }>('/api/me');

      setAccount({
        uid: data.user.uid,
        email: data.user.email,
        displayName: data.user.displayName || '',
        emailVerified: data.user.emailVerified ?? current.emailVerified,
        isAdmin: data.user.isAdmin === true,
        planId: data.plan?.id ?? 'starter',
        planName: data.plan?.name ?? 'Starter',
        usage: data.usage ?? null,
        limits: data.limits ?? null,
        serverMetering: data.serverMetering,
        retentionDays: (data as { profile?: { retentionDays?: number } }).profile?.retentionDays ?? 0,
        phone: (data as { profile?: { phone?: string } }).profile?.phone ?? '',
        country: (data as { profile?: { country?: string } }).profile?.country ?? '',
        capabilities: (data as { capabilities?: AccountSummary['capabilities'] }).capabilities ?? null,
        warning: data.warning,
      });
      setAccountError(null);
      loadedFor.current = current.uid;
    } catch (error) {
      // A missing backend configuration must not block the UI; pages surface it.
      setAccount(null);
      if (
        error instanceof ApiClientError &&
        (error.code === 'admin_not_configured' || error.code === 'provider_not_configured')
      ) {
        setAccountError({ message: error.message, hint: error.hint });
      } else {
        setAccountError(null);
      }
    } finally {
      setAccountLoading(false);
    }
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
      if (nextUser) {
        void refreshAccount();
      } else {
        setAccount(null);
        setAccountError(null);
        loadedFor.current = null;
      }
    });
    return unsubscribe;
  }, [refreshAccount]);

  // Exchange a freshly verified email for an updated token without a reload.
  useEffect(() => {
    if (!user || user.emailVerified || loadedFor.current !== user.uid) return;
    const timer = window.setTimeout(() => {
      void user.reload().then(() => {
        if (getFirebaseAuth().currentUser?.emailVerified) void refreshAccount();
      });
    }, 15000);
    return () => window.clearTimeout(timer);
  }, [user, refreshAccount]);

  const resendVerification = useCallback(async () => {
    const current = getFirebaseAuth().currentUser;
    if (!current) return;
    await sendEmailVerification(current);
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(getFirebaseAuth());
    setAccount(null);
    setAccountError(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      account,
      accountLoading,
      accountError,
      refreshAccount,
      resendVerification,
      signOut,
    }),
    [user, loading, account, accountLoading, accountError, refreshAccount, resendVerification, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
