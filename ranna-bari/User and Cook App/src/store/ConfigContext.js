/**
 * App-wide configuration, fetched from the server once on launch.
 *
 * Every constant the app currently hardcodes — delivery fee, platform fee,
 * payout rates, zone list, category vocabulary — is replicated here as an
 * in-memory snapshot that the server can update without a new app build.
 *
 * The pattern is the same as SessionContext: show defaults immediately,
 * refresh from the server, keep working if the server never answers.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { api, hasServer } from '../lib/server';

const CONFIG_KEY = 'rannabari_config';

/** The values the app ships with, used when the server is unreachable. */
const DEFAULTS = {
  fees: { deliveryFee: 40, platformFee: 10 },
  payoutRates: { cod: 0.85, meal: 0.85, store: 0.85, request: 0.80 },
  escrow: { autoReleaseDays: 3 },
  areas: [],
  zoneFees: {},
  taxonomy: [],
  flags: {},
};

const ConfigContext = createContext(DEFAULTS);

export function ConfigProvider({ children }) {
  const [config, setConfig] = useState(DEFAULTS);

  /* Restore any cached config first, then refresh from the server. This way
     the UI never flickers through default values on a warm launch. */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const cached = await AsyncStorage.getItem(CONFIG_KEY);
        if (cached && alive) {
          const parsed = JSON.parse(cached);
          setConfig((prev) => ({ ...prev, ...parsed }));
        }
      } catch {
        /* corrupt cache — just use defaults */
      }

      if (!hasServer) return;

      try {
        const out = await api('/config');
        if (!alive) return;
        const merged = { ...DEFAULTS, ...out };
        setConfig(merged);
        AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(merged)).catch(() => {});
      } catch {
        /* Network down — cached / default config stays in place */
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
}

export function useConfig() {
  return useContext(ConfigContext);
}

/** Delivery fee — live from server, falls back to ৳40. */
export function useDeliveryFee() {
  return useConfig().fees?.deliveryFee ?? 40;
}

/** Platform fee — live from server, falls back to ৳10. */
export function usePlatformFee() {
  return useConfig().fees?.platformFee ?? 10;
}

/** Payout rate for a given order kind. */
export function usePayoutRate(kind = 'cod') {
  const rates = useConfig().payoutRates;
  return rates?.[kind] ?? 0.85;
}

/** Feature flag — false when the server hasn't spoken. */
export function useFlag(key) {
  return useConfig().flags?.[key] ?? false;
}
