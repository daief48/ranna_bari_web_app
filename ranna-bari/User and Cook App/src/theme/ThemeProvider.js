import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme, useWindowDimensions } from 'react-native';

import { makeShadows, palettes, setTypeWidth } from './tokens';
import { useLang } from '../i18n/LanguageContext';

const KEY = 'rannabari_theme';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  /*
   * The type scale follows the screen.
   *
   * Set before the tree below renders, so the first paint is already at the
   * right size rather than at 390 and then corrected. Same shape as the
   * language provider setting the script — both are module-level values that
   * a few hundred style objects read during render.
   */
  const { width } = useWindowDimensions();
  setTypeWidth(width);

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

  /* The language is a dependency even though no colour changes with it.
     `font` resolves its family from the active script at read time, and a
     component only re-reads it when it re-renders -- but switching language
     re-renders nothing on its own, because the provider hands the same
     `children` element back and React skips the subtree.
     Practically every styled component in the app reads `useTheme()` for
     colours, so making this value change with the language is what carries
     the new typeface into all of them on a switch, without remounting the
     tree and losing where the user was. */
  const { lang } = useLang();

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
  }, [mode, toggle, hydrated, lang]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
