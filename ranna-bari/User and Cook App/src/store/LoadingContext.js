import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import ModernLoader from '../components/ModernLoader';

const LoadingContext = createContext(null);

/**
 * The startup loading screen, and a handle for raising it deliberately.
 *
 * It shows once, while the app is opening, and then not again unless
 * somebody asks for it: `showLoader()` / `hideLoader()` / `withLoader()`
 * are there for an action that genuinely blocks.
 *
 * It used to also fire on every route change — a full-screen takeover for
 * 420ms between a tap and the page it opened, which made the app feel slower
 * than it is and hid the screen the customer had just asked for. Navigation
 * has its own transition; this is not it.
 */
export function LoadingProvider({ children }) {
  /* Opens true: the first thing anyone sees is the app starting up. */
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [subtext, setSubtext] = useState(null);

  const timerRef = useRef(null);

  /* The one time it shows on its own: a cold start or a refresh. */
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setLoading(false);
      timerRef.current = null;
    }, 650);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  /**
   * Imperative Show Loader (e.g. for checkout, order submit, API actions)
   */
  const showLoader = useCallback((msg = null, sub = null) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(msg);
    setSubtext(sub);
    setLoading(true);
  }, []);

  /**
   * Imperative Hide Loader
   */
  const hideLoader = useCallback(() => {
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
