import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

import { makeShadows, palettes } from './tokens';

const KEY = 'rannabari_theme';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const system = useColorScheme();
  // `null` means "follow the device", matching the web build's behaviour
  // before anything is written to localStorage.
  const [override, setOverride] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (!alive) return;
        if (v === 'dark' || v === 'light') setOverride(v);
      })
      .catch(() => {})
      .finally(() => alive && setHydrated(true));
    return () => {
      alive = false;
    };
  }, []);

  const mode = override ?? (system === 'dark' ? 'dark' : 'light');

  const toggle = useCallback(() => {
    setOverride((prev) => {
      const current = prev ?? (system === 'dark' ? 'dark' : 'light');
      const next = current === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(KEY, next).catch(() => {});
      return next;
    });
  }, [system]);

  const value = useMemo(() => {
    const colors = palettes[mode];
    return {
      mode,
      isDark: mode === 'dark',
      colors,
      shadow: makeShadows(colors),
      toggle,
      hydrated,
    };
  }, [mode, toggle, hydrated]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
