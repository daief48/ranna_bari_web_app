import { useCallback, useRef, useState } from 'react';

import { useKitchen } from '../../store/KitchenContext';
import { useCommerce } from '../../store/CommerceContext';
import { useAlert } from '../../components/Alert';
import { errorText } from '../../components/MealBits';
import { useLang } from '../../i18n/LanguageContext';
import { foldDigits } from '../../lib/format';
import { cookOf } from './useCookRequestRows';

export const PRICE_MAX = 100000;

/**
 * A price as typed: blank is fine (the cook is only interested), otherwise
 * whole taka, 1..100000. Bengali digits fold to ASCII first.
 * @returns {{ok: true, price: number|null} | {ok: false}}
 */
export function parsePrice(raw) {
  const s = foldDigits(raw).trim();
  if (!s) return { ok: true, price: null };
  if (!/^\d+$/.test(s)) return { ok: false };
  const price = Number(s);
  if (price < 1 || price > PRICE_MAX) return { ok: false };
  return { ok: true, price };
}

/**
 * The cook's three quick answers to a request, done where the row stands.
 *
 * Each answer is optimistic: the row is filed where the write will put it
 * (`overrides`, read by `useCookRequestRows`) the moment it is tapped, and a
 * refusal puts it back — but only if the row still carries *this* mark, the
 * same discipline `advanceOrder` keeps, so a later answer is never undone by
 * an earlier one failing. One answer per request at a time (a ref, not
 * state, so a double-tap in the same frame cannot slip through).
 */
export function useCookRequestActions() {
  const { kitchen } = useKitchen();
  const shop = useCommerce();
  const alert = useAlert();
  const { t, n } = useLang();
  const [overrides, setOverrides] = useState({});
  const inflight = useRef(new Set());

  /* The latest closures, read at call time: callbacks stay stable. */
  const latest = useRef(null);
  latest.current = { kitchen, shop, alert, t, n };

  const settle = useCallback((id, mark) => {
    setOverrides((all) => {
      if (all[id] !== mark) return all;
      const { [id]: _gone, ...rest } = all;
      return rest;
    });
  }, []);

  const run = useCallback(
    async (requestId, mark, send, okNote) => {
      const id = String(requestId);
      if (inflight.current.has(id)) return false;
      inflight.current.add(id);
      setOverrides((all) => ({ ...all, [id]: mark }));
      try {
        const out = await send();
        const { alert, t, n } = latest.current;
        if (!out.ok) {
          settle(id, mark);
          alert.error(errorText(out.error, t, n, out), t('Not updated'));
          return false;
        }
        settle(id, mark);
        if (okNote) alert.success(okNote);
        return true;
      } finally {
        inflight.current.delete(id);
      }
    },
    [settle],
  );

  /** `form` = {price, prepTime, note} as typed. */
  const sendPrice = useCallback(
    (request, form) => {
      const { kitchen, shop, t } = latest.current;
      const parsed = parsePrice(form.price);
      if (!parsed.ok || !kitchen) return Promise.resolve(false);
      return run(
        request.id,
        { kind: 'offer', price: parsed.price },
        () =>
          shop.submitOffer(
            request.id,
            cookOf(kitchen),
            parsed.price != null ? String(parsed.price) : null,
            (form.note ?? '').trim(),
            (form.prepTime ?? '').trim(),
          ),
        parsed.price != null
          ? t('Your price is with the customer.')
          : t('You are on the list. Add a price when you know it.'),
      );
    },
    [run],
  );

  const decline = useCallback(
    (request) => {
      const { alert, t, shop, kitchen } = latest.current;
      alert.confirm({
        title: t('Not for you?'),
        body: t('This request leaves your board. The customer is not told unless they asked you directly.'),
        confirmLabel: t('Yes, not for me'),
        onConfirm: () =>
          run(request.id, { kind: 'decline' }, () => shop.declineRequest(request.id, kitchen?.id)),
      });
    },
    [run],
  );

  const withdraw = useCallback(
    (request, offer) => {
      const { alert, t, shop } = latest.current;
      alert.confirm({
        title: t('Withdraw your offer?'),
        body: t('The customer will no longer see your price on this request.'),
        confirmLabel: t('Yes, withdraw'),
        danger: true,
        onConfirm: () => run(request.id, { kind: 'withdraw' }, () => shop.withdrawOffer(offer.id)),
      });
    },
    [run],
  );

  return { overrides, sendPrice, decline, withdraw };
}
