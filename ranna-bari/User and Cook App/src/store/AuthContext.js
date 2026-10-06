import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  /* The mirror merges read from, and the epoch that retires writes. React
     does not promise a state updater runs when dispatch is called — skip the
     eager evaluation once and a merge computed inside it never reaches
     storage — so the ref, not the updater, is what a merge reads. The epoch
     is what stops an answer that lands after sign-out from writing a ghost
     back over it. */
  const accountRef = useRef(null);
  const epochRef = useRef(0);

  useEffect(() => {
    let alive = true;
    Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(VIEW_KEY)])
      .then(([raw, view]) => {
        if (!alive) return;
        if (raw) {
          const restored = JSON.parse(raw);
          accountRef.current = restored;
          setAccount(restored);
        }
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
      /* Whatever profile write is still in flight belongs to whoever was on
         the screen before — this account replaces them. */
      epochRef.current += 1;
      const next = { ...profile, signedInAt: new Date().toISOString() };
      accountRef.current = next;
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
    const epoch = epochRef.current;
    /* Adopted wholesale when there is nothing to merge over. The server is
       the source of the profile now, and it answers before the local copy
       necessarily exists — a fresh sign-in, or a reinstall restoring a
       token. Merging over `null` there would throw the real profile away
       and leave the app running on whatever the token happened to carry. */
    const next = {
      ...(accountRef.current ?? {}),
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    /* Signed out — or signed in as somebody else — while this was in
       flight: the answer belongs to a session that no longer exists, and
       writing it would resurrect an account over a sign-out. */
    if (epoch !== epochRef.current) return null;
    accountRef.current = next;
    setAccount(next);
    await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
    return next;
  }, []);

  const signOut = useCallback(async () => {
    epochRef.current += 1;
    accountRef.current = null;
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
