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
const VIEW_KEY = 'rannabari_viewmode';

const AuthContext = createContext(null);

/**
 * The web build has no backend either -- auth.js writes the finished account
 * to localStorage and routes on it. This keeps that contract so the three-step
 * signup flow behaves identically.
 *
 * `viewMode` sits alongside the account rather than inside it: a cook is
 * still a cook while they are ordering somebody else's dinner, so which
 * panel they are looking at is a separate question from what their account
 * is. Only an account with `role === 'cook'` can be in cook mode at all.
 */
export function AuthProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [viewMode, setViewModeState] = useState('cook');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(VIEW_KEY)])
      .then(([raw, view]) => {
        if (!alive) return;
        if (raw) setAccount(JSON.parse(raw));
        if (view === 'cook' || view === 'customer') setViewModeState(view);
      })
      .catch(() => {})
      .finally(() => alive && setHydrated(true));
    return () => {
      alive = false;
    };
  }, []);

  const setViewMode = useCallback(async (mode) => {
    setViewModeState(mode);
    await AsyncStorage.setItem(VIEW_KEY, mode).catch(() => {});
  }, []);

  const signIn = useCallback(
    async (profile) => {
      const next = { ...profile, signedInAt: new Date().toISOString() };
      setAccount(next);
      await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      // A cook lands in their kitchen; anybody else lands in the shop.
      await setViewMode(next.role === 'cook' ? 'cook' : 'customer');
      return next;
    },
    [setViewMode],
  );

  /**
   * Merge a partial profile over the stored account. Used by the profile
   * editor, which owns every field signup and sign-in collected.
   */
  const updateAccount = useCallback(async (patch) => {
    let next = null;
    setAccount((prev) => {
      /* Adopted wholesale when there is nothing to merge over. The server is
         the source of the profile now, and it answers before the local copy
         necessarily exists — a fresh sign-in, or a reinstall restoring a
         token. Returning `prev` there would throw the real profile away and
         leave the app running on whatever the token happened to carry. */
      next = prev
        ? { ...prev, ...patch, updatedAt: new Date().toISOString() }
        : { ...patch, updatedAt: new Date().toISOString() };
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

  const value = useMemo(() => {
    const isCook = account?.role === 'cook';
    return {
      account,
      isSignedIn: !!account,
      isCook,
      /** True only while a cook is actually looking at the cook panel. */
      isCookMode: isCook && viewMode === 'cook',
      viewMode,
      setViewMode,
      signIn,
      signOut,
      updateAccount,
      hydrated,
    };
  }, [account, viewMode, setViewMode, signIn, signOut, updateAccount, hydrated]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
