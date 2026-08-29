import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { bn } from './bn';
import { setTypeScript } from '../theme/tokens';

const KEY = 'rannabari_lang';

export const LANGUAGES = [
  { code: 'en', short: 'EN', label: 'English' },
  { code: 'bn', short: 'বাং', label: 'বাংলা' },
];

/**
 * The wordmark, split where the lockup paints it.
 *
 * "RannaBari" is a transliteration of রান্নাবাড়ি, not a foreign name that
 * happens to be used here — so in Bengali the name is not translated, it is
 * simply *written*, the way its owners write it. An app that switches every
 * button to Bengali and keeps its own name in Latin looks like a Bengali
 * skin over an English product.
 *
 * Two halves rather than one string because the second half is the one that
 * carries the gradient in every lockup, and রান্না + বাড়ি is where the
 * compound actually joins — cooking, and house.
 *
 * Nothing here needs an uppercase variant: the auth aside sets its lockup in
 * caps, and `toUpperCase()` on Bengali is identity, so the same pair serves
 * both without a second entry to keep in step.
 */
export const BRAND = {
  en: { first: 'Ranna', second: 'Bari' },
  bn: { first: 'রান্না', second: 'বাড়ি' },
};

const LanguageContext = createContext(null);

/**
 * The app in two languages.
 *
 * English is both the default and the key: `t('Your orders')` looks the
 * phrase up in the Bengali table and hands back the English when it is not
 * there yet. That keeps the catalogue a single map instead of a second one
 * full of invented ids, and it means a string that has not been translated
 * still reads as a sentence rather than as `profile.orders.title`.
 *
 * The script has to be set during render rather than in an effect: the font
 * tokens read it while the tree is painting, so setting it a tick later
 * would show one frame of the wrong typeface on every switch.
 */
export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState('en');
  const [hydrated, setHydrated] = useState(false);

  // Runs before any child renders, so the first paint already has the faces.
  setTypeScript(lang === 'bn' ? 'bengali' : 'latin');

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (!alive) return;
        if (v === 'en' || v === 'bn') setLangState(v);
      })
      .catch(() => {})
      .finally(() => alive && setHydrated(true));
    return () => {
      alive = false;
    };
  }, []);

  const setLang = useCallback(async (next) => {
    setLangState(next);
    await AsyncStorage.setItem(KEY, next).catch(() => {});
  }, []);

  const toggleLang = useCallback(
    () => setLang(lang === 'bn' ? 'en' : 'bn'),
    [lang, setLang],
  );

  const value = useMemo(() => {
    const table = lang === 'bn' ? bn : null;

    /**
     * @param {string} en   the English string, which is also the key
     * @param {object} [vars] values for {placeholders}
     */
    const t = (en, vars) => {
      /* `in`, not `||`: some entries are deliberately empty. "WHAT FOODIES
         SAY" is three words in English and two in Bengali, so the trailing
         one translates to nothing -- and a falsy check would hand back the
         English "SAY" and print it under the Bengali heading. */
      let out = table && en in table ? table[en] : en;
      if (vars) {
        for (const k of Object.keys(vars)) {
          out = out.split(`{${k}}`).join(String(vars[k]));
        }
      }
      return out;
    };

    /**
     * Digits, so ৳816 and "4 min ago" read as Bengali too. Numerals are the
     * one thing people notice immediately when an app is only half switched.
     */
    const n = (value) => {
      const s = String(value);
      if (lang !== 'bn') return s;
      return s.replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]);
    };

    return {
      lang,
      isBn: lang === 'bn',
      setLang,
      toggleLang,
      t,
      n,
      /* The three lockups read this rather than each holding their own copy
         of the name — a brand spelled in three places is a brand that gets
         changed in two. */
      brand: BRAND[lang] ?? BRAND.en,
      hydrated,
    };
  }, [lang, setLang, toggleLang, hydrated]);

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used inside <LanguageProvider>');
  return ctx;
}
