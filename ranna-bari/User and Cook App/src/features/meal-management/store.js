import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useSession } from '../../store/SessionContext';
import { onLiveEvent } from '../../lib/liveEvents';
import * as api from './api';
import { monthOfDay, sumMeals, thisMonth, todayKey } from './format';

/**
 * Meal management — the module's own state.
 *
 * Deliberately not part of `CommerceContext`. That provider is mounted for the
 * whole app and refreshes on every foreground, sign-in and socket event; a
 * feature living behind a profile menu has no business adding a dozen requests
 * to that. This provider is mounted by `app/meal-management/_layout.js`, which
 * means it exists only while somebody is actually inside the feature and is
 * torn down when they leave.
 *
 * What it borrows from the app is one thing: the session token, because §4.1
 * asks for one account rather than a second login.
 *
 * ## Shape
 *
 * Two things are global to the feature and live as their own state — which
 * mess is open, and which month is being looked at. Everything else is a
 * *slice*: a cached payload keyed by a string that includes the mess and the
 * month it was fetched for, so changing either invalidates it without anybody
 * having to remember to clear anything. Screens ask for the slice they need
 * and get told whether it is there yet.
 *
 * That generality is worth it here because the specification has eighteen
 * modules. Eighteen bespoke loaders with eighteen bespoke loading flags is the
 * same code written eighteen times, and the nineteenth would have been written
 * slightly differently.
 */

const MealManagementContext = createContext(null);

/** Which mess was open last time, so the app reopens where it was left. */
const MESS_KEY = 'rannabari_mm_mess';

export function MealManagementProvider({ children }) {
  const { token } = useSession();

  const [messes, setMesses] = useState(null);
  const [messId, setMessId] = useState(null);
  const [month, setMonth] = useState(thisMonth);

  const [slices, setSlices] = useState({});
  const [pending, setPending] = useState({});
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState(null);

  /* In-flight requests, so two screens mounting at once do not fetch the same
     slice twice. Held in a ref because it must be read and written within a
     single tick, before any render has happened. */
  const inFlight = useRef({});
  /* Mirrors `slices` for the same reason: an optimistic write has to read the
     row it is about to replace without waiting for a render. */
  const live = useRef({});

  const put = useCallback((key, value) => {
    live.current = { ...live.current, [key]: value };
    setSlices((prev) => ({ ...prev, [key]: value }));
  }, []);

  /* ---------------------------------------------------------------- *
   * choosing a mess
   * ---------------------------------------------------------------- */

  const loadMesses = useCallback(async () => {
    if (!token) {
      setMesses([]);
      setBooting(false);
      return [];
    }

    const out = await api.fetchMesses(token);
    if (!out.ok) {
      setError(out);
      setBooting(false);
      return [];
    }

    const list = out.result.messes ?? [];
    setMesses(list);

    /* Reopen the mess they were last in, when they are still in it. */
    const remembered = await AsyncStorage.getItem(MESS_KEY).catch(() => null);
    const active = list.filter((m) => m.status === 'active');
    const chosen =
      active.find((m) => m.messId === remembered)?.messId ?? active[0]?.messId ?? null;

    setMessId(chosen);
    setBooting(false);
    return list;
  }, [token]);

  useEffect(() => {
    loadMesses();
  }, [loadMesses]);

  const chooseMess = useCallback((next) => {
    setMessId(next);
    setSlices({});
    live.current = {};
    inFlight.current = {};
    /* The room belongs to the mess, so switching mess empties it. Leaving the
       old conversation on screen under a new mess's name would be the worst
       kind of stale: it looks like data rather than like a loading state. */
    liveMessages.current = null;
    setMessages(null);
    setUnreadChat(0);
    void AsyncStorage.setItem(MESS_KEY, String(next)).catch(() => {});
  }, []);

  /* ---------------------------------------------------------------- *
   * slices
   * ---------------------------------------------------------------- */

  /**
   * Fetch a slice unless it is already here.
   *
   * `force` is for after a write: the screen knows the server has moved and
   * the cache has not. Everything else reuses what is cached, which is what
   * keeps tabbing between the five main screens from re-fetching the month.
   */
  const load = useCallback(
    async (key, fetcher, { force = false } = {}) => {
      if (!token || !messId) return null;

      const cacheKey = `${messId}:${key}`;
      if (!force && live.current[cacheKey] !== undefined) return live.current[cacheKey];
      if (inFlight.current[cacheKey]) return inFlight.current[cacheKey];

      setPending((prev) => ({ ...prev, [cacheKey]: true }));

      const request = (async () => {
        const out = await fetcher(token, messId);
        if (out.ok) {
          put(cacheKey, out.result);
        } else {
          /* A refusal is kept as the slice's value rather than thrown away, so
             a screen can render "you cannot see this" instead of a spinner
             that never stops. */
          put(cacheKey, { __error: out });
        }
        setPending((prev) => {
          const next = { ...prev };
          delete next[cacheKey];
          return next;
        });
        delete inFlight.current[cacheKey];
        return out.ok ? out.result : null;
      })();

      inFlight.current[cacheKey] = request;
      return request;
    },
    [token, messId, put],
  );

  /** What a screen reads. `undefined` means not fetched yet. */
  const slice = useCallback(
    (key) => {
      const value = slices[`${messId}:${key}`];
      if (value && value.__error) return null;
      return value;
    },
    [slices, messId],
  );

  /** The refusal a slice came back with, if it did. */
  const sliceError = useCallback(
    (key) => slices[`${messId}:${key}`]?.__error ?? null,
    [slices, messId],
  );

  const isLoading = useCallback((key) => !!pending[`${messId}:${key}`], [pending, messId]);

  /** Drop cached slices whose keys match, so the next read refetches. */
  const invalidate = useCallback((...prefixes) => {
    const hit = (key) => prefixes.some((prefix) => key.includes(prefix));

    live.current = Object.fromEntries(
      Object.entries(live.current).filter(([key]) => !hit(key)),
    );
    setSlices((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !hit(key))));
  }, []);

  const refreshAll = useCallback(() => {
    live.current = {};
    inFlight.current = {};
    setSlices({});
    liveMessages.current = null;
    setMessages(null);
  }, []);

  /* Changing the month drops everything keyed to the old one. Slice keys
     carry their month, so this is belt and braces — but a stale figure under
     a new heading is the one bug in this feature nobody would notice. */
  const changeMonth = useCallback(
    (next) => {
      setMonth(next);
      invalidate(':month:');
    },
    [invalidate],
  );

  /* ---------------------------------------------------------------- *
   * the slices themselves
   * ---------------------------------------------------------------- */

  const keys = useMemo(
    () => ({
      dashboard: `month:${month}:dashboard`,
      meals: `month:${month}:meals`,
      summary: `month:${month}:summary`,
      bazars: `month:${month}:bazars`,
      expenses: `month:${month}:expenses`,
      deposits: `month:${month}:deposits`,
      balance: `month:${month}:balance`,
      analytics: `month:${month}:analytics`,
      bills: `month:${month}:bills`,
      settlement: `month:${month}:settlement`,
      rateReport: `month:${month}:rate-report`,
      adjustments: `month:${month}:adjustments`,
      today: `today:${todayKey()}`,
      members: 'members',
      memberHistory: 'member-history',
      invites: 'invites',
      joinRequests: 'join-requests',
      settings: 'settings',
      categories: 'categories',
      corrections: 'corrections',
      leaves: 'leaves',
      duties: 'duties',
      notices: 'notices',
      polls: 'polls',
      menu: 'menu',
      suggestions: 'menu-suggestions',
      cooks: 'cooks',
      notifications: 'notifications',
      months: 'months',
      assistant: 'assistant',
      prediction: 'prediction',
    }),
    [month],
  );

  const loaders = useMemo(
    () => ({
      dashboard: (o) => load(keys.dashboard, (t, m) => api.fetchDashboard(t, m, month), o),
      meals: (o) => load(keys.meals, (t, m) => api.fetchMeals(t, m, month), o),
      summary: (o) => load(keys.summary, (t, m) => api.fetchSummary(t, m, month), o),
      bazars: (o) => load(keys.bazars, (t, m) => api.fetchBazars(t, m, { month }), o),
      expenses: (o) => load(keys.expenses, (t, m) => api.fetchExpenses(t, m, { month }), o),
      deposits: (o) => load(keys.deposits, (t, m) => api.fetchDeposits(t, m, { month }), o),
      balance: (o) => load(keys.balance, (t, m) => api.fetchBalance(t, m, month), o),
      analytics: (o) => load(keys.analytics, (t, m) => api.fetchAnalytics(t, m, month), o),
      bills: (o) => load(keys.bills, (t, m) => api.fetchBills(t, m, month), o),
      settlement: (o) => load(keys.settlement, (t, m) => api.fetchSettlement(t, m, month), o),
      rateReport: (o) => load(keys.rateReport, (t, m) => api.fetchRateReport(t, m, month), o),
      adjustments: (o) => load(keys.adjustments, (t, m) => api.fetchAdjustments(t, m, month), o),
      today: (o) => load(keys.today, (t, m) => api.fetchToday(t, m), o),
      members: (o) => load(keys.members, api.fetchMembers, o),
      memberHistory: (o) => load(keys.memberHistory, api.fetchMemberHistory, o),
      invites: (o) => load(keys.invites, api.fetchInvites, o),
      joinRequests: (o) => load(keys.joinRequests, api.fetchJoinRequests, o),
      settings: (o) => load(keys.settings, api.fetchSettings, o),
      categories: (o) => load(keys.categories, api.fetchCategories, o),
      corrections: (o) => load(keys.corrections, (t, m) => api.fetchCorrections(t, m, 'pending'), o),
      leaves: (o) => load(keys.leaves, (t, m) => api.fetchLeaves(t, m), o),
      duties: (o) => load(keys.duties, (t, m) => api.fetchDuties(t, m, {}), o),
      notices: (o) => load(keys.notices, api.fetchNotices, o),
      polls: (o) => load(keys.polls, api.fetchPolls, o),
      menu: (o) => load(keys.menu, (t, m) => api.fetchMenu(t, m, { days: 7 }), o),
      suggestions: (o) => load(keys.suggestions, api.fetchSuggestions, o),
      cooks: (o) => load(keys.cooks, api.fetchCooks, o),
      notifications: (o) => load(keys.notifications, (t, m) => api.fetchNotifications(t, m, 50), o),
      months: (o) => load(keys.months, api.fetchMonths, o),
      assistant: (o) => load(keys.assistant, api.fetchAssistant, o),
      prediction: (o) => load(keys.prediction, (t, m) => api.fetchPrediction(t, m), o),
    }),
    [load, keys, month],
  );

  /* ---------------------------------------------------------------- *
   * the mess room
   * ---------------------------------------------------------------- */

  /*
   * Held as its own state rather than as a slice.
   *
   * Every other payload here is "the answer for this month", fetched whole and
   * replaced whole. A conversation is neither: it is paged backwards, appended
   * to by other people, and written to optimistically. Forcing it through the
   * slice cache would mean a refetch on every message.
   */
  const [messages, setMessages] = useState(null);
  const [chatMeta, setChatMeta] = useState({ hasMore: false, oldest: null, canModerate: false });
  const [unreadChat, setUnreadChat] = useState(0);

  /* Mirrors `messages` so a send can dedupe against what is already on screen
     without waiting for a render. */
  const liveMessages = useRef(null);
  const putMessages = useCallback((next) => {
    liveMessages.current = next;
    setMessages(next);
  }, []);

  const loadMessages = useCallback(
    async ({ force = false } = {}) => {
      if (!token || !messId) return null;
      if (!force && liveMessages.current) return liveMessages.current;

      const out = await api.fetchMessages(token, messId, {});
      if (!out.ok) return null;

      putMessages(out.result.messages ?? []);
      setChatMeta({
        hasMore: !!out.result.hasMore,
        oldest: out.result.oldest ?? null,
        canModerate: !!out.result.canModerate,
      });
      return out.result.messages;
    },
    [token, messId, putMessages],
  );

  /** One page further back, prepended. */
  const loadOlderMessages = useCallback(async () => {
    if (!token || !messId || !chatMeta.oldest) return null;

    const out = await api.fetchMessages(token, messId, { before: chatMeta.oldest });
    if (!out.ok) return null;

    const older = out.result.messages ?? [];
    const known = new Set((liveMessages.current ?? []).map((m) => m.id));
    putMessages([...older.filter((m) => !known.has(m.id)), ...(liveMessages.current ?? [])]);
    setChatMeta((prev) => ({
      ...prev,
      hasMore: !!out.result.hasMore,
      oldest: out.result.oldest ?? prev.oldest,
    }));
    return older;
  }, [token, messId, chatMeta.oldest, putMessages]);

  /**
   * Say something, and draw it before the server has heard.
   *
   * The `clientId` is generated here and sent with the message, which is what
   * makes the write idempotent: a retry over a flaky connection posts the same
   * id and the server returns the row it already has. The optimistic copy is
   * then replaced by the real one rather than joined by it.
   */
  const postMessage = useCallback(
    async (body, options = {}) => {
      if (!token || !messId) return { ok: false, error: 'mm-mess-missing' };

      const text = String(body ?? '').trim();
      if (!text) return { ok: false, error: 'mm-message-empty' };

      const clientId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

      const pending = {
        id: clientId,
        clientId,
        /* No name and no member id on the optimistic copy: a room does not
           label your own messages with your own name, and `mine` is the only
           thing the bubble needs to know. The server's copy replaces this one
           a moment later carrying both. */
        kind: 'text',
        body: text,
        replyToId: options.replyTo?.id ?? null,
        replyToName: options.replyTo?.senderName ?? null,
        replyToBody: options.replyTo?.body ?? null,
        about: options.about ?? null,
        at: new Date().toISOString(),
        mine: true,
        sending: true,
      };

      putMessages([...(liveMessages.current ?? []), pending]);

      const out = await api.sendMessage(token, messId, {
        body: text,
        clientId,
        replyToId: options.replyTo?.id || undefined,
        about: options.about || undefined,
      });

      putMessages(
        (liveMessages.current ?? []).flatMap((message) => {
          if (message.clientId !== clientId) return [message];
          /* A refusal takes the optimistic copy back off rather than leaving a
             message on screen that nobody else will ever see. */
          if (!out.ok) return [];
          return [{ ...out.result.message, clientId }];
        }),
      );

      return out;
    },
    [token, messId, putMessages],
  );

  const markChatRead = useCallback(async () => {
    setUnreadChat(0);
    if (!token || !messId) return null;
    return api.readMessages(token, messId);
  }, [token, messId]);

  const hideMessage = useCallback(
    async (messageId) => {
      if (!token || !messId) return { ok: false, error: 'mm-mess-missing' };
      const out = await api.hideMessage(token, messId, messageId);
      if (out.ok) {
        putMessages(
          (liveMessages.current ?? []).map((message) =>
            message.id === messageId ? { ...message, hidden: true, body: '' } : message,
          ),
        );
      }
      return out;
    },
    [token, messId, putMessages],
  );

  /**
   * Somebody else spoke.
   *
   * `liveEvents` is the app's own bus for socket frames that are not chat —
   * `ChatContext` owns the one WebSocket and offers every frame to it before
   * deciding whether the frame is its own. Subscribing here means the mess
   * room is live without a second connection and without the shop's chat
   * knowing this feature exists.
   *
   * A frame for a different mess is dropped: one account can keep more than
   * one set of books, and both are on the same socket.
   */
  useEffect(() => {
    if (!messId) return undefined;

    return onLiveEvent((event) => {
      if (event?.type === 'socket-open') {
        /* The socket is only live from the moment it opens. Anything said
           while it was down was announced to nobody. */
        if (liveMessages.current) loadMessages({ force: true });
        return;
      }

      if (event?.type !== 'mm-message' || event.messId !== messId) return;

      const message = event.message;
      if (!message?.id) return;

      /* Only into a room that has been opened. Appending to a list nobody has
         loaded would leave a partial conversation that looks whole. */
      if (liveMessages.current) {
        const seen = liveMessages.current.some(
          (row) => row.id === message.id || (message.clientId && row.clientId === message.clientId),
        );
        if (!seen) putMessages([...liveMessages.current, message]);
      }

      setUnreadChat((was) => was + 1);
    });
  }, [messId, putMessages, loadMessages]);

  /* ---------------------------------------------------------------- *
   * writes
   * ---------------------------------------------------------------- */

  /** Every write goes through here: run it, then drop what it invalidated. */
  const write = useCallback(
    async (run, ...invalidated) => {
      if (!token || !messId) return { ok: false, error: 'mm-mess-missing' };
      const out = await run(token, messId);
      if (out.ok && invalidated.length) invalidate(...invalidated);
      return out;
    },
    [token, messId, invalidate],
  );

  /* Groups of slices that move together, named once so a write site says what
     it affects rather than listing keys. */
  const MONEY = [':summary', ':balance', ':analytics', ':bills', ':settlement', ':dashboard'];
  const MEALS = [':meals', 'today:', ':summary', ':balance', ':analytics', ':bills', ':settlement', ':dashboard'];

  /**
   * Set one day's meals, and move the numbers before the server answers.
   *
   * The counts on the calendar are this person's own sums, so the delta is
   * known here. Leaving them to the refetch would fill a checkbox in and leave
   * the number directly above it disagreeing with it for half a second, which
   * reads as the tick not having counted.
   *
   * The rate and the mess totals are *not* touched: they come from every
   * member's entries and cannot be worked out on the device. Those wait for
   * the refetch, which is fine — nobody is watching a meal rate while they
   * tick boxes.
   */
  const setMeal = useCallback(
    async (date, patch) => {
      const cacheKey = `${messId}:${keys.meals}`;
      const before = live.current[cacheKey];

      if (before && !before.__error && Array.isArray(before.days)) {
        const days = before.days.map((day) => {
          if (day.date !== date) return day;
          const values = { ...day.values, ...(patch.values ?? {}) };
          const guests = { ...day.guests, ...(patch.guests ?? {}) };
          for (const map of [values, guests]) {
            for (const [key, value] of Object.entries(map)) {
              if (!Number(value)) delete map[key];
            }
          }
          return { ...day, values, guests, total: sumMeals(values) + sumMeals(guests) };
        });

        const counts = days.reduce(
          (acc, day) => {
            acc.total += day.total ?? 0;
            for (const [key, value] of Object.entries(day.values ?? {})) {
              acc.byType[key] = (acc.byType[key] ?? 0) + Number(value);
            }
            acc.guests += sumMeals(day.guests);
            return acc;
          },
          { weighted: 0, total: 0, guests: 0, byType: {} },
        );
        counts.weighted = counts.total;

        put(cacheKey, { ...before, days, counts });
      }

      const out = await write((t, m) => api.setMeal(t, m, { date, ...patch }));

      /* Whether it worked or not, the truth is on the server now: a refusal
         means the optimistic row was wrong and has to go back. */
      invalidate(...MEALS);
      return out;
    },
    [write, invalidate, messId, keys.meals, put],
  );

  const actions = useMemo(
    () => ({
      /* §4.1 */
      createMess: async (body) => {
        const out = await api.createMess(token, body);
        if (out.ok) {
          await loadMesses();
          chooseMess(out.result.messId);
        }
        return out;
      },
      joinMess: async (code) => {
        const out = await api.joinMess(token, code);
        if (out.ok) await loadMesses();
        return out;
      },
      addGhostMember: (body) => write((t, m) => api.addGhostMember(t, m, body), 'members', ':dashboard'),
      updateMember: (memberId, body) =>
        write((t, m) => api.updateMember(t, m, memberId, body), 'members', 'member-history', ':dashboard'),
      transferOwnership: (memberId) =>
        write((t, m) => api.transferOwnership(t, m, memberId), 'members', ':dashboard', 'settings'),
      leaveMess: async () => {
        const out = await write((t, m) => api.leaveMess(t, m));
        if (out.ok) {
          await loadMesses();
          refreshAll();
        }
        return out;
      },
      createInvite: (body) => write((t, m) => api.createInvite(t, m, body), 'invites'),
      revokeInvite: (inviteId) => write((t, m) => api.revokeInvite(t, m, inviteId), 'invites'),
      decideJoinRequest: (requestId, approve) =>
        write((t, m) => api.decideJoinRequest(t, m, requestId, approve), 'join-requests', 'members', ':dashboard'),
      saveSettings: (body) => write((t, m) => api.saveSettings(t, m, body), 'settings', ':dashboard', ':summary'),
      saveMealType: (body) => write((t, m) => api.saveMealType(t, m, body), 'settings', ':dashboard', ':meals'),
      removeMealType: (key) => write((t, m) => api.removeMealType(t, m, key), 'settings', ':dashboard', ':meals'),
      archiveMess: async () => {
        const out = await write((t, m) => api.archiveMess(t, m));
        if (out.ok) {
          await loadMesses();
          refreshAll();
        }
        return out;
      },
      saveProfile: (body) => write((t, m) => api.saveProfile(t, m, body), 'members', ':dashboard'),

      /* §4.2 */
      setMeal,
      setMealsBulk: (body) => write((t, m) => api.setMealsBulk(t, m, body), ...MEALS),
      requestCorrection: (body) => write((t, m) => api.requestCorrection(t, m, body), 'corrections', ':dashboard'),
      decideCorrection: (requestId, approve, note) =>
        write((t, m) => api.decideCorrection(t, m, requestId, approve, note), 'corrections', ...MEALS),
      addLeave: (body) => write((t, m) => api.addLeave(t, m, body), 'leaves', ...MEALS),
      cancelLeave: (leaveId) => write((t, m) => api.cancelLeave(t, m, leaveId), 'leaves'),

      /* §4.3 */
      createBazar: (body) => write((t, m) => api.createBazar(t, m, body), ':bazars', ...MONEY),
      updateBazar: (bazarId, body) => write((t, m) => api.updateBazar(t, m, bazarId, body), ':bazars', ...MONEY),
      submitBazar: (bazarId) => write((t, m) => api.submitBazar(t, m, bazarId), ':bazars', ...MONEY),
      decideBazar: (bazarId, approve, note) =>
        write((t, m) => api.decideBazar(t, m, bazarId, approve, note), ':bazars', ...MONEY),
      removeBazar: (bazarId) => write((t, m) => api.removeBazar(t, m, bazarId), ':bazars', ...MONEY),
      assignDuty: (body) => write((t, m) => api.assignDuty(t, m, body), 'duties', ':dashboard'),
      rotateDuty: (body) => write((t, m) => api.rotateDuty(t, m, body), 'duties', ':dashboard'),
      updateDuty: (dutyId, body) => write((t, m) => api.updateDuty(t, m, dutyId, body), 'duties', ':dashboard'),
      removeDuty: (dutyId) => write((t, m) => api.removeDuty(t, m, dutyId), 'duties', ':dashboard'),

      /* §4.4, §4.5 */
      saveCategory: (body) => write((t, m) => api.saveCategory(t, m, body), 'categories', ...MONEY),
      removeCategory: (key) => write((t, m) => api.removeCategory(t, m, key), 'categories', ...MONEY),
      createExpense: (body) => write((t, m) => api.createExpense(t, m, body), ':expenses', ...MONEY),
      updateExpense: (expenseId, body) =>
        write((t, m) => api.updateExpense(t, m, expenseId, body), ':expenses', ...MONEY),
      submitExpense: (expenseId) => write((t, m) => api.submitExpense(t, m, expenseId), ':expenses', ...MONEY),
      decideExpense: (expenseId, approve, note) =>
        write((t, m) => api.decideExpense(t, m, expenseId, approve, note), ':expenses', ...MONEY),
      removeExpense: (expenseId) => write((t, m) => api.removeExpense(t, m, expenseId), ':expenses', ...MONEY),
      addDeposit: (body) => write((t, m) => api.addDeposit(t, m, body), ':deposits', ...MONEY),
      decideDeposit: (depositId, approve, note) =>
        write((t, m) => api.decideDeposit(t, m, depositId, approve, note), ':deposits', ...MONEY),
      removeDeposit: (depositId) => write((t, m) => api.removeDeposit(t, m, depositId), ':deposits', ...MONEY),

      /* §4.8 */
      closeMonth: (target) => write((t, m) => api.closeMonth(t, m, target), 'months', ...MONEY, ...MEALS),
      openMonth: (target) => write((t, m) => api.openMonth(t, m, target), 'months', ':dashboard'),
      archiveMonth: (target) => write((t, m) => api.archiveMonth(t, m, target), 'months'),
      postAdjustment: (body) => write((t, m) => api.postAdjustment(t, m, body), ':adjustments', ...MONEY),

      /* §4.10 – §4.14 */
      readNotifications: (ids) => write((t, m) => api.readNotifications(t, m, ids), 'notifications', ':dashboard'),
      saveNotice: (body) => write((t, m) => api.saveNotice(t, m, body), 'notices', ':dashboard'),
      readNotice: (noticeId) => write((t, m) => api.readNotice(t, m, noticeId), 'notices', ':dashboard'),
      removeNotice: (noticeId) => write((t, m) => api.removeNotice(t, m, noticeId), 'notices', ':dashboard'),
      createPoll: (body) => write((t, m) => api.createPoll(t, m, body), 'polls'),
      votePoll: (pollId, optionIds) => write((t, m) => api.votePoll(t, m, pollId, optionIds), 'polls'),
      closePoll: (pollId) => write((t, m) => api.closePoll(t, m, pollId), 'polls'),
      removePoll: (pollId) => write((t, m) => api.removePoll(t, m, pollId), 'polls'),
      saveMenu: (body) => write((t, m) => api.saveMenu(t, m, body), 'menu', ':dashboard'),
      rateMenu: (menuId, rating, comment) => write((t, m) => api.rateMenu(t, m, menuId, rating, comment), 'menu'),
      removeMenu: (menuId) => write((t, m) => api.removeMenu(t, m, menuId), 'menu', ':dashboard'),
      addSuggestion: (body) => write((t, m) => api.addSuggestion(t, m, body), 'menu-suggestions'),
      backSuggestion: (suggestionId) => write((t, m) => api.backSuggestion(t, m, suggestionId), 'menu-suggestions'),
      saveCook: (body) => write((t, m) => api.saveCook(t, m, body), 'cooks'),
      recordCookDay: (body) => write((t, m) => api.recordCookDay(t, m, body), 'cooks', ':analytics'),
      payCook: (body) => write((t, m) => api.payCook(t, m, body), 'cooks', ':expenses', ...MONEY),

      /* §4.15 */
      askAssistant: (text) => write((t, m) => api.askAssistant(t, m, text), 'assistant'),
      confirmAssistant: (proposalId) =>
        write((t, m) => api.confirmAssistant(t, m, proposalId), 'assistant', ...MEALS),

      /* Reads a screen wants once rather than as a cached slice. */
      getBazar: (bazarId) => api.fetchBazar(token, messId, bazarId),
      getExpense: (expenseId) => api.fetchExpense(token, messId, expenseId),
      getMemberStatement: (target, memberId) =>
        api.fetchMemberStatement(token, messId, target ?? month, memberId),
      getClosingReview: (target) => api.fetchClosingReview(token, messId, target ?? month),
      getMealsFor: (target, memberId) => api.fetchMeals(token, messId, target ?? month, memberId),
      getDay: (date) => api.fetchDay(token, messId, date),
      getCookMonth: (cookId, target) => api.fetchCookMonth(token, messId, cookId, target ?? month),
      getActivity: (params) => api.fetchActivity(token, messId, params),
      getExport: (kind, target) => api.fetchExport(token, messId, kind, target ?? month),
      getPrintable: (target) => api.fetchPrintable(token, messId, target ?? month),
      getAttachment: (attachmentId) => api.fetchAttachment(token, messId, attachmentId),
      getMealHistory: (params) => api.fetchMealHistory(token, messId, params),
      getBazarSuggestions: () => api.fetchBazarSuggestions(token, messId),
      getBazarSummary: (target) => api.fetchBazarSummary(token, messId, target ?? month),
      getExpenseInsights: (target) => api.fetchExpenseInsights(token, messId, target ?? month),
      getWaste: (target) => api.fetchWaste(token, messId, target ?? month),
      getPrediction: (date) => api.fetchPrediction(token, messId, date),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [write, token, messId, month, setMeal, loadMesses, chooseMess, refreshAll],
  );

  /* ---------------------------------------------------------------- *
   * derived
   * ---------------------------------------------------------------- */

  const dashboard = slice(keys.dashboard);

  /**
   * The permission set, defaulting to nothing.
   *
   * Every screen draws its buttons from this. It is a *rendering hint* — the
   * server re-checks every one of these on the action itself, per §4.17 — so
   * being wrong here is a cosmetic bug rather than a hole.
   */
  const permissions = dashboard?.permissions ?? {};
  const mealTypes = dashboard?.mealTypes ?? [];
  const settings = dashboard?.mess ?? null;
  const monthStartDay = dashboard?.monthStartDay ?? 1;

  const value = useMemo(
    () => ({
      /* identity */
      token,
      messes,
      messId,
      mess: messes?.find((m) => m.messId === messId) ?? null,
      chooseMess,
      reloadMesses: loadMesses,
      booting,
      error,

      /* time */
      month,
      changeMonth,
      today: todayKey(),
      monthOfToday: monthOfDay(todayKey(), monthStartDay),

      /* data */
      keys,
      load: loaders,
      slice,
      sliceError,
      isLoading,
      invalidate,
      refreshAll,

      /* the mess room */
      messages,
      chatMeta,
      /* Live while the room is open; the dashboard's own figure otherwise, so
         a badge is right on a cold start too. */
      unreadMessages: unreadChat || dashboard?.unreadMessages || 0,
      loadMessages,
      loadOlderMessages,
      postMessage,
      markChatRead,
      hideMessage,

      /* the payload nearly every screen needs */
      dashboard,
      permissions,
      mealTypes,
      settings,
      can: (action) => permissions[action] === true,

      /* writes */
      ...actions,
    }),
    [
      token,
      messes,
      messId,
      chooseMess,
      loadMesses,
      booting,
      error,
      month,
      changeMonth,
      monthStartDay,
      keys,
      loaders,
      slice,
      sliceError,
      isLoading,
      invalidate,
      refreshAll,
      messages,
      chatMeta,
      unreadChat,
      loadMessages,
      loadOlderMessages,
      postMessage,
      markChatRead,
      hideMessage,
      dashboard,
      permissions,
      mealTypes,
      settings,
      actions,
    ],
  );

  return (
    <MealManagementContext.Provider value={value}>{children}</MealManagementContext.Provider>
  );
}

export function useMealManagement() {
  const value = useContext(MealManagementContext);
  if (!value) {
    throw new Error('useMealManagement must be used inside MealManagementProvider');
  }
  return value;
}

/**
 * Load a slice when the screen appears, and read it.
 *
 * The pattern every screen in the module uses, so none of them writes its own
 * effect-plus-state pair. Returns the payload, whether it is still loading,
 * the refusal if there was one, and a reload for pull-to-refresh.
 */
export function useSlice(name, options = {}) {
  const { load, slice, sliceError, isLoading, keys } = useMealManagement();
  const key = keys[name];
  const loader = load[name];

  useEffect(() => {
    if (loader) loader();
  }, [loader]);

  const reload = useCallback(() => loader?.({ force: true }), [loader]);

  return {
    data: slice(key),
    loading: isLoading(key) || slice(key) === undefined,
    error: sliceError(key),
    reload,
    ...options,
  };
}
