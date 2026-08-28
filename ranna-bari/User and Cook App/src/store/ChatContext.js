import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { api, WS_URL, ApiError } from '../lib/server';
import { useSession } from './SessionContext';

const OUTBOX_KEY = 'rannabari_chat_outbox';

const ChatContext = createContext(null);

/** A message id the device owns, generated before the message leaves it. */
let seq = 0;
const makeClientId = () =>
  `c-${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Chat, from the app's side.
 *
 * The whole design follows from one fact: this app is offline-first and a
 * chat is not. Everything else here runs off AsyncStorage and works on a
 * plane. So the rule is that *sending never fails* — a message goes into an
 * outbox that survives the app being killed, and the outbox drains whenever
 * the network comes back.
 *
 * That is what `clientId` is for. It is minted here, before the message
 * leaves the device, and the server treats a repeat as the same message
 * rather than a second one. A replay after a dropped connection is therefore
 * safe, which is what lets the outbox retry blindly instead of having to
 * reason about whether the first attempt got through.
 *
 * The socket carries *delivery* only. Sending is an HTTP POST, because a send
 * needs a status code to act on and a WebSocket frame has none.
 */
export function ChatProvider({ children }) {
  const { token, isVerified } = useSession();

  const [threads, setThreads] = useState([]);
  const [messages, setMessages] = useState({}); // threadId -> message[]
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);

  /** Unsent messages, newest last. Persisted, so a crash does not lose them. */
  const [outbox, setOutbox] = useState([]);

  const socketRef = useRef(null);
  const retryRef = useRef(null);
  const attemptRef = useRef(0);
  const activeRef = useRef(null);
  const drainingRef = useRef(false);

  /* ---------------- outbox persistence ---------------- */

  useEffect(() => {
    AsyncStorage.getItem(OUTBOX_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setOutbox(parsed);
      })
      .catch(() => {});
  }, []);

  const persistOutbox = useCallback((next) => {
    AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  /* ---------------- reads ---------------- */

  const loadThreads = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const out = await api('/chat/threads', { token });
      setThreads(out.threads ?? []);
    } catch {
      // An inbox that cannot load is not an error worth a dialog; the cached
      // list stays on screen and the next refresh tries again.
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadMessages = useCallback(
    async (threadId) => {
      if (!token || !threadId) return;
      try {
        const out = await api(`/chat/messages?threadId=${threadId}`, { token });
        setMessages((prev) => ({ ...prev, [threadId]: out.messages ?? [] }));
      } catch {
        /* keep whatever is already rendered */
      }
    },
    [token],
  );

  useEffect(() => {
    if (isVerified) loadThreads();
  }, [isVerified, loadThreads]);

  /* ---------------- the socket ---------------- */

  useEffect(() => {
    if (!token || !WS_URL) {
      socketRef.current?.close();
      socketRef.current = null;
      setConnected(false);
      return undefined;
    }

    let closed = false;

    const connect = () => {
      if (closed) return;

      /* The token goes in the query string, not a header: React Native's
         WebSocket accepts headers but browsers do not, and this app also runs
         on Expo web. That is why the token is short-lived and revocable. */
      const socket = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
      socketRef.current = socket;

      socket.onopen = () => {
        attemptRef.current = 0;
        setConnected(true);
        if (activeRef.current) {
          socket.send(JSON.stringify({ type: 'subscribe', threadId: activeRef.current }));
        }
        // Coming back online is the moment to flush anything stuck.
        drain();
        loadThreads();
      };

      socket.onclose = () => {
        setConnected(false);
        if (closed) return;
        /* Exponential backoff, capped. A phone that loses signal in a lift
           should not spend the outage opening sockets. */
        attemptRef.current = Math.min(attemptRef.current + 1, 6);
        retryRef.current = setTimeout(connect, Math.min(1000 * 2 ** attemptRef.current, 30_000));
      };

      socket.onerror = () => {
        try {
          socket.close();
        } catch {
          /* already gone */
        }
      };

      socket.onmessage = (event) => {
        let payload;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }

        if (payload.type === 'message' && payload.threadId && payload.message) {
          const { threadId, message } = payload;

          setMessages((prev) => {
            const list = prev[threadId] ?? [];
            // The server echoes to everyone but the sender; a message we
            // already hold optimistically must not appear twice.
            if (list.some((m) => m.id === message.id || m.clientId === message.clientId)) {
              return prev;
            }
            return { ...prev, [threadId]: [...list, message] };
          });

          setThreads((prev) =>
            prev
              .map((t) =>
                t.id === threadId
                  ? {
                      ...t,
                      lastMessageAt: message.sentAt,
                      lastMessageBody: message.body,
                      lastMessageFrom: message.senderType,
                      unread: threadId === activeRef.current ? t.unread : (t.unread ?? 0) + 1,
                    }
                  : t,
              )
              .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt)),
          );
        }

        if (payload.type === 'thread' && payload.thread) {
          setThreads((prev) =>
            prev.some((t) => t.id === payload.thread.id) ? prev : [payload.thread, ...prev],
          );
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /* A socket does not always notice that the OS froze it in the background.
     Coming back to the foreground is the cheapest reliable moment to check. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !token) return;
      const socket = socketRef.current;
      if (!socket || socket.readyState > 1) {
        attemptRef.current = 0;
        setConnected(false);
      } else {
        drain();
        loadThreads();
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, loadThreads]);

  /* ---------------- sending ---------------- */

  /**
   * Push the outbox at the server, oldest first.
   *
   * Stops at the first retryable failure rather than carrying on: if the
   * network is down, the second message will fail for the same reason, and
   * order within a conversation matters.
   */
  const drain = useCallback(async () => {
    if (drainingRef.current || !token) return;
    drainingRef.current = true;

    try {
      let queue = await AsyncStorage.getItem(OUTBOX_KEY)
        .then((raw) => (raw ? JSON.parse(raw) : []))
        .catch(() => []);
      if (!Array.isArray(queue) || queue.length === 0) return;

      const remaining = [...queue];

      while (remaining.length) {
        const pending = remaining[0];
        try {
          const out = await api('/chat/messages', {
            method: 'POST',
            token,
            body: {
              threadId: pending.threadId,
              body: pending.body,
              clientId: pending.clientId,
            },
          });

          // Swap the optimistic copy for the stored one.
          setMessages((prev) => {
            const list = prev[pending.threadId] ?? [];
            return {
              ...prev,
              [pending.threadId]: list.map((m) =>
                m.clientId === pending.clientId ? out.message : m,
              ),
            };
          });

          remaining.shift();
        } catch (error) {
          if (error instanceof ApiError && !error.retryable) {
            /* The server refused it and will refuse it again — a closed
               thread, a message too long. Drop it from the queue and mark the
               copy on screen as failed rather than retrying forever. */
            setMessages((prev) => {
              const list = prev[pending.threadId] ?? [];
              return {
                ...prev,
                [pending.threadId]: list.map((m) =>
                  m.clientId === pending.clientId ? { ...m, failed: true } : m,
                ),
              };
            });
            remaining.shift();
            continue;
          }
          break; // network. Leave the rest queued.
        }
      }

      setOutbox(remaining);
      persistOutbox(remaining);
    } finally {
      drainingRef.current = false;
    }
  }, [token, persistOutbox]);

  /**
   * Send a message.
   *
   * Renders instantly, queues, and drains. It cannot fail from the caller's
   * point of view, which is the only honest contract for a chat on a phone.
   */
  const send = useCallback(
    async (threadId, body) => {
      const text = String(body ?? '').trim();
      if (!text || !threadId) return null;

      const clientId = makeClientId();
      const optimistic = {
        id: clientId,
        clientId,
        threadId,
        senderType: 'me',
        senderName: '',
        body: text,
        attachments: [],
        systemKind: null,
        sentAt: new Date().toISOString(),
        pending: true,
      };

      setMessages((prev) => ({
        ...prev,
        [threadId]: [...(prev[threadId] ?? []), optimistic],
      }));

      const queued = [...outbox, { threadId, body: text, clientId }];
      setOutbox(queued);
      persistOutbox(queued);

      drain();
      return optimistic;
    },
    [outbox, persistOutbox, drain],
  );

  /* ---------------- threads ---------------- */

  const openThread = useCallback(
    async (spec) => {
      if (!token) return null;
      const out = await api('/chat/threads', { method: 'POST', token, body: spec });
      setThreads((prev) =>
        prev.some((t) => t.id === out.thread.id) ? prev : [out.thread, ...prev],
      );
      return out.thread;
    },
    [token],
  );

  const setActive = useCallback(
    (threadId) => {
      activeRef.current = threadId;
      if (!threadId) return;

      const socket = socketRef.current;
      if (socket?.readyState === 1) {
        socket.send(JSON.stringify({ type: 'subscribe', threadId }));
      }

      setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t)));

      if (token) {
        api('/chat/read', { method: 'POST', token, body: { threadId } }).catch(() => {});
      }
    },
    [token],
  );

  const unreadTotal = useMemo(
    () => threads.reduce((sum, t) => sum + (t.unread ?? 0), 0),
    [threads],
  );

  const value = useMemo(
    () => ({
      threads,
      messages,
      connected,
      loading,
      unreadTotal,
      pendingCount: outbox.length,
      loadThreads,
      loadMessages,
      openThread,
      setActive,
      send,
    }),
    [
      threads,
      messages,
      connected,
      loading,
      unreadTotal,
      outbox.length,
      loadThreads,
      loadMessages,
      openThread,
      setActive,
      send,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used inside <ChatProvider>');
  return ctx;
}
