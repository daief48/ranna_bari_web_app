import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'rannabari_account';

const AuthContext = createContext(null);

/**
 * The web build has no backend either -- auth.js writes the finished account
 * to localStorage and routes on it. This keeps that contract so the three-step
 * signup flow behaves identically.
 */
export function AuthProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        setAccount(JSON.parse(raw));
      })
      .catch(() => {})
      .finally(() => alive && setHydrated(true));
    return () => {
      alive = false;
    };
  }, []);

  const signIn = useCallback(async (profile) => {
    const next = { ...profile, signedInAt: new Date().toISOString() };
    setAccount(next);
    await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
    return next;
  }, []);

  /**
   * Merge a partial profile over the stored account. Used by the profile
   * editor, which owns every field signup and sign-in collected.
   */
  const updateAccount = useCallback(async (patch) => {
    let next = null;
    setAccount((prev) => {
      if (!prev) return prev;
      next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
      return next;
    });
    // setAccount's updater runs synchronously here, so `next` is populated
    // by the time this line is reached.
    if (next) await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
    return next;
  }, []);

  const signOut = useCallback(async () => {
    setAccount(null);
    await AsyncStorage.removeItem(KEY).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      account,
      isSignedIn: !!account,
      signIn,
      signOut,
      updateAccount,
      hydrated,
    }),
    [account, signIn, signOut, updateAccount, hydrated],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
