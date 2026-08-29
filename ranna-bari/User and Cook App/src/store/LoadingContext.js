import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { usePathname, useSegments } from 'expo-router';

import ModernLoader from '../components/ModernLoader';

const LoadingContext = createContext(null);

/**
 * Global Page Transition & Action Loader Provider.
 *
 * Listens to Expo Router route changes and triggers a sleek culinary
 * loading animation on page transitions, while also providing imperative
 * `showLoader()` / `hideLoader()` / `withLoader()` for async actions.
 */
export function LoadingProvider({ children }) {
  const pathname = usePathname();
  const segments = useSegments();

  // Show on initial page load / refresh as well as route transitions
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [subtext, setSubtext] = useState(null);

  const prevPathRef = useRef(null);
  const timerRef = useRef(null);
  const manualRef = useRef(false);

  // Initial load / refresh dismiss timer
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setLoading(false);
      timerRef.current = null;
    }, 650);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Automatic sleek transition on route changes
  useEffect(() => {
    if (!pathname) return;

    // Trigger on route transitions (when pathname changes from previous)
    if (prevPathRef.current && prevPathRef.current !== pathname && !manualRef.current) {
      if (timerRef.current) clearTimeout(timerRef.current);

      setLoading(true);
      setMessage(null);
      setSubtext(null);

      // Snappy and modern duration (420ms) for smooth page transit
      timerRef.current = setTimeout(() => {
        setLoading(false);
        timerRef.current = null;
      }, 420);
    }

    prevPathRef.current = pathname;

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pathname, segments]);

  /**
   * Imperative Show Loader (e.g. for checkout, order submit, API actions)
   */
  const showLoader = useCallback((msg = null, sub = null) => {
    manualRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(msg);
    setSubtext(sub);
    setLoading(true);
  }, []);

  /**
   * Imperative Hide Loader
   */
  const hideLoader = useCallback(() => {
    manualRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    setLoading(false);
    setMessage(null);
    setSubtext(null);
  }, []);

  /**
   * Run an async action wrapped with the modern loader
   */
  const withLoader = useCallback(
    async (asyncFn, msg = null, sub = null) => {
      showLoader(msg, sub);
      try {
        const res = await asyncFn();
        return res;
      } finally {
        setTimeout(() => hideLoader(), 200);
      }
    },
    [showLoader, hideLoader]
  );

  const value = {
    loading,
    showLoader,
    hideLoader,
    withLoader,
  };

  return (
    <LoadingContext.Provider value={value}>
      {children}
      <ModernLoader visible={loading} message={message} subtext={subtext} />
    </LoadingContext.Provider>
  );
}

export function usePageLoader() {
  const ctx = useContext(LoadingContext);
  if (!ctx) {
    throw new Error('usePageLoader must be used inside <LoadingProvider>');
  }
  return ctx;
}
