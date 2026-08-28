/**
 * The last few things someone searched for.
 *
 * Food ordering is repetitive -- the same four or five dishes, most weeks --
 * and retyping "mutton kacchi biryani" on a phone keyboard every time is the
 * kind of small tax that makes a search box feel worse than a menu. Kept on
 * the device only; it is a convenience, not a profile.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'rannabari_recent_searches';

/** Short enough to stay a shortcut rather than a second list to read. */
const LIMIT = 6;

export default function useRecentSearches() {
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (Array.isArray(saved)) setRecent(saved.filter((s) => typeof s === 'string'));
      })
      .catch(() => {});
  }, []);

  /**
   * Record a search.
   *
   * Case-insensitively de-duplicated and moved to the front, so searching the
   * same thing twice does not fill the list with itself. Single characters
   * are dropped: they are what a half-typed word looks like, not a search.
   */
  const remember = useCallback((query) => {
    const term = String(query ?? '').trim();
    if (term.length < 2) return;
    setRecent((prev) => {
      const next = [term, ...prev.filter((s) => s.toLowerCase() !== term.toLowerCase())]
        .slice(0, LIMIT);
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const forget = useCallback((query) => {
    setRecent((prev) => {
      const next = prev.filter((s) => s !== query);
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setRecent([]);
    AsyncStorage.removeItem(KEY).catch(() => {});
  }, []);

  return { recent, remember, forget, clear };
}
