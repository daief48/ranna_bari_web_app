import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { api, hasServer, ApiError } from '../lib/server';

const TOKEN_KEY = 'rannabari_token';
const IDENTITY_KEY = 'rannabari_identity';

const SessionContext = createContext(null);

/**
 * The server session — the app's first real identity.
 *
 * Everything else in this app signs in by asking: `signIn(demoAccount(id))`
 * builds an account out of whatever string was typed and throws the password
 * away. That is survivable while nothing leaves the device. It stops being
 * survivable the moment two strangers can message each other, because a chat
 * is exactly where impersonation pays — "I am your cook, confirm your bKash
 * PIN" needs no exploit at all if anyone can claim to be anyone.
 *
 * So this sits *alongside* AuthContext rather than replacing it. AuthContext
 * still owns the local profile, the view mode and everything offline. This
 * owns the one question the server is allowed to answer: which phone number
 * proved it holds its handset.
 *
 * A screen that needs chat needs this. A screen that needs a name and an
 * address does not.
 */
export function SessionProvider({ children }) {
  const [token, setToken] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [checking, setChecking] = useState(false);

  /* Restore, then verify. A stored token can be perfectly well-formed and
     still dead — the session revoked, the account suspended — and the only
     way to know is to ask. */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const [stored, storedIdentity] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(IDENTITY_KEY),
        ]);
        if (!alive) return;

        if (!stored) return;

        // Show the cached identity immediately so the UI does not flicker
        // through a signed-out state on every cold start.
        if (storedIdentity) setIdentity(JSON.parse(storedIdentity));
        setToken(stored);

        if (!hasServer) return;

        const out = await api('/auth/me', { token: stored });
        if (!alive) return;
        setIdentity(out.account);
        AsyncStorage.setItem(IDENTITY_KEY, JSON.stringify(out.account)).catch(() => {});
      } catch (error) {
        if (!alive) return;
        /* A 401 means the token is genuinely dead: drop it. Anything else is
           the network, and a token must not be thrown away because a train
           went into a tunnel. */
        if (error instanceof ApiError && error.status === 401) {
          setToken(null);
          setIdentity(null);
          AsyncStorage.multiRemove([TOKEN_KEY, IDENTITY_KEY]).catch(() => {});
        }
      } finally {
        if (alive) setHydrated(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  /** Ask for a code. Returns the dev code when the server has no SMS wired. */
  const requestCode = useCallback(async (phone) => {
    const out = await api('/auth/request-otp', {
      method: 'POST',
      body: { phone },
    });
    return out;
  }, []);

  /**
   * Spend a code. On success the device is signed in until it is revoked.
   *
   * `name` is only read when the account is new — the server keeps the one it
   * already has for a returning number, so signing in cannot rename somebody
   * by typing something else into the field.
   */
  const verifyCode = useCallback(async (phone, code, name) => {
    setChecking(true);
    try {
      const out = await api('/auth/verify-otp', {
        method: 'POST',
        body: {
          phone,
          code,
          ...(name ? { name } : {}),
          device: { name: 'RannaBari', platform: 'expo' },
        },
      });

      setToken(out.token);
      setIdentity(out.account);
      await Promise.all([
        AsyncStorage.setItem(TOKEN_KEY, out.token),
        AsyncStorage.setItem(IDENTITY_KEY, JSON.stringify(out.account)),
      ]).catch(() => {});

      return out.account;
    } finally {
      setChecking(false);
    }
  }, []);

  const signOutServer = useCallback(async () => {
    setToken(null);
    setIdentity(null);
    await AsyncStorage.multiRemove([TOKEN_KEY, IDENTITY_KEY]).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      token,
      identity,
      /** True only when the server has confirmed who this is. */
      isVerified: !!token && !!identity,
      hydrated,
      checking,
      hasServer,
      requestCode,
      verifyCode,
      signOutServer,
    }),
    [token, identity, hydrated, checking, requestCode, verifyCode, signOutServer],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
