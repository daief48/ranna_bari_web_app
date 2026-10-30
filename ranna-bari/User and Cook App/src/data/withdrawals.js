/**
 * A cook's withdrawals: the figures, the destination, the history, and the
 * two writes.
 *
 * Kept out of `KitchenContext` for the reason `data/cook.js` gives: it is read
 * by one screen, and the always-loaded kitchen object should not pay a request
 * on every launch for it.
 *
 * Every figure here is the server's. `available` is `balance - reserved`,
 * folded from the ledger on the server, so the card never subtracts anything
 * itself and cannot disagree with what the server will accept. A write adopts
 * the server's answer by reloading rather than patching local state: the
 * reservation, the history row and the available figure all changed at once.
 */
import { useCallback, useEffect, useState } from 'react';

import { call, hasServer } from '../lib/server';
import { useSession } from '../store/SessionContext';

const EMPTY = {
  balance: 0,
  reserved: 0,
  available: 0,
  minimum: 0,
  method: '',
  account: '',
  withdrawals: [],
};

export function useWithdrawals() {
  const { token, getToken, isVerified } = useSession();
  const [data, setData] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const bearer = getToken() || token;
    if (!bearer || !hasServer) return;

    setBusy(true);
    try {
      const out = await call('/kitchens/mine/withdrawals', { token: bearer });
      /* Left alone on a failure, like every cook list: a blinking network must
         not replace a visible balance with zero. */
      if (out.ok) {
        setData({ ...EMPTY, ...out.result });
        setLoaded(true);
      }
    } finally {
      setBusy(false);
    }
  }, [token, getToken]);

  useEffect(() => {
    if (isVerified) reload();
  }, [isVerified, reload]);

  const request = useCallback(
    async (amount) => {
      const out = await call('/kitchens/mine/withdrawals', {
        method: 'POST',
        token: getToken() || token,
        body: { amount },
      });
      /* A refusal still reloads: "over balance" usually means the figure on
         screen was stale, and the repaired one is the useful answer. */
      await reload();
      return out;
    },
    [token, getToken, reload],
  );

  const cancel = useCallback(
    async (id) => {
      const out = await call(`/kitchens/mine/withdrawals/${id}/cancel`, {
        method: 'POST',
        token: getToken() || token,
        // A body is what makes the server accept the verb with a JSON header;
        // an empty object keeps the two in step.
        body: {},
      });
      await reload();
      return out;
    },
    [token, getToken, reload],
  );

  return { ...data, loaded, busy, reload, request, cancel };
}
