/**
 * Scroll-to-load-more, as one reusable hook + footer.
 *
 * The app has several unbounded lists (orders, reviews, notifications, the
 * ledger), and each was about to grow its own copy of the same loop: watch
 * scroll, fetch the next page, append, keep the spinner honest. This is
 * that loop, once.
 *
 * The contract mirrors the backend's cursor pagination: every list endpoint
 * answers `{ rows..., cursor }` where `cursor` is null at the end of
 * history. The hook owns the rows, the next cursor and the in-flight flag;
 * `reload` replaces (pull-to-refresh, focus, socket nudges) while `load`
 * appends the next page.
 *
 * Rows dedupe by `id` across the page seam: the cursor is the last row's
 * timestamp and two rows can share one, so a straddler would otherwise
 * appear twice at exactly the point nobody is looking.
 */
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { useLang } from '../i18n/LanguageContext';
import { font } from '../theme/tokens';

export function useInfinite({ fetchPage }) {
  const [rows, setRows] = useState([]);
  /* `undefined` = first page not answered yet; `null` after a fetch =
     history exhausted. Two states a boolean cannot tell apart. */
  const [cursor, setCursor] = useState(undefined);
  const [loading, setLoading] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const inflight = useRef(false);
  /* The cursor the last append was based on — guards a double-fire landing
     after state has already moved on. */
  const askedFor = useRef(undefined);

  const load = useCallback(
    async (reset = false) => {
      if (inflight.current) return;
      const base = reset ? undefined : cursor;
      if (!reset && (exhausted || base === null || base === undefined)) return;
      if (!reset && askedFor.current === base) return;

      inflight.current = true;
      askedFor.current = base;
      setLoading(true);
      try {
        const out = await fetchPage(base);
        if (!out || out.ok === false) {
          /* A refused page is not the end of history; the next attempt
             re-asks the same cursor. */
          askedFor.current = undefined;
          return;
        }
        const page = out.result?.rows ?? [];
        const next = out.result?.cursor ?? null;
        setRows((prev) => {
          if (reset) return page;
          const seen = new Set(prev.map((r) => String(r.id)));
          return [...prev, ...page.filter((r) => !seen.has(String(r.id)))];
        });
        setCursor(next);
        setExhausted(next === null || page.length === 0);
      } finally {
        setLoading(false);
        inflight.current = false;
      }
    },
    [cursor, exhausted, fetchPage],
  );

  /* Reload from the top — pull-to-refresh, focus, a socket nudge. */
  const reload = useCallback(async () => {
    setExhausted(false);
    askedFor.current = undefined;
    await load(true);
  }, [load]);

  return {
    rows,
    loading,
    exhausted,
    cursor,
    load,
    reload,
    /** True once at least one fetch has answered (either way). */
    loaded: cursor !== undefined || rows.length > 0,
  };
}

/**
 * The footer that asks for the next page — mount it at the end of a list
 * and the first mount fires the load; while it waits it shows the spinner,
 * and at the end of history it renders nothing.
 *
 * A plain component rather than onEndReached maths: the app's scrollers are
 * ScrollViews inside Screen/CookScreen, where the footer's *mount* is the
 * "reached the end" signal — no threshold tuning, same behaviour on web and
 * native. The press fallback keeps a swallowed trigger one tap away.
 */
export function LoadMoreFooter({ onLoad, loading, exhausted }) {
  const { colors } = useTheme();
  const { t } = useLang();
  const fired = useRef(false);

  React.useEffect(() => {
    if (!fired.current && !loading && !exhausted) {
      fired.current = true;
      onLoad?.();
    }
  }, [loading, exhausted, onLoad]);

  if (exhausted) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('Show more')}
      disabled={loading}
      onPress={() => onLoad?.()}
      style={{ alignItems: 'center', paddingVertical: 16 }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.sage} />
      ) : (
        <Text
          style={{
            fontFamily: font.uiSemi,
            fontSize: 13,
            color: colors.textMuted,
          }}
        >
          {t('Show more')}
        </Text>
      )}
    </Pressable>
  );
}
