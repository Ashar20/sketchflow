'use client';

import * as fcl from '@onflow/fcl';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface FclUserSnapshot {
  addr?: string;
  loggedIn?: boolean | null;
}

function mapFlowAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (
    lower.includes('externally halted') ||
    lower.includes('declined') ||
    lower.includes('user rejected')
  ) {
    return 'Sign-in was cancelled or blocked by the wallet. Allow popups for this site, pick another wallet in the list, or try http://localhost instead of 127.0.0.1 if the wallet list does not load.';
  }
  if (raw.trim()) return raw;
  return 'Wallet sign-in failed. Try again.';
}

export interface UseFlowWalletResult {
  ready: boolean;
  authenticated: boolean;
  address: string | null;
  isWalletLoading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  login: () => void;
  logout: () => void;
}

const FlowWalletContext = createContext<UseFlowWalletResult | null>(null);

export function FlowWalletProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FclUserSnapshot | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    const run = async () => {
      try {
        const snap = await fcl.currentUser.snapshot();
        setUser(snap);
      } catch {
        setUser(null);
      }
      setHydrated(true);
      unsub = fcl.currentUser.subscribe((u: FclUserSnapshot) => setUser(u));
    };
    void run();
    return () => {
      unsub?.();
    };
  }, []);

  const addr = user?.addr ? fcl.withPrefix(user.addr) : null;

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const login = useCallback(() => {
    setAuthError(null);
    setWalletLoading(true);
    const result = fcl.authenticate() as Promise<unknown> | void;
    if (result && typeof result.then === 'function') {
      void result
        .catch((err: unknown) => setAuthError(mapFlowAuthError(err)))
        .finally(() => setWalletLoading(false));
    } else {
      setWalletLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    fcl.unauthenticate();
    setAuthError(null);
  }, []);

  const value = useMemo<UseFlowWalletResult>(
    () => ({
      ready: hydrated,
      authenticated: Boolean(user?.loggedIn && addr),
      address: addr,
      isWalletLoading: walletLoading,
      authError,
      clearAuthError,
      login,
      logout,
    }),
    [
      hydrated,
      user?.loggedIn,
      addr,
      walletLoading,
      authError,
      clearAuthError,
      login,
      logout,
    ],
  );

  return (
    <FlowWalletContext.Provider value={value}>{children}</FlowWalletContext.Provider>
  );
}

export function useFlowWallet(): UseFlowWalletResult {
  const ctx = useContext(FlowWalletContext);
  if (!ctx) {
    throw new Error('useFlowWallet must be used within FlowWalletProvider');
  }
  return ctx;
}
