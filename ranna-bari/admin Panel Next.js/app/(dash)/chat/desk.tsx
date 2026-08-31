'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Badge, BTN } from '@/components/ui';
import { fmtDateTime, timeAgo } from '@/lib/format';

/**
 * The support desk, HTTP-polling edition.
 *
 * WebSocket requires a persistent long-lived process — Netlify serverless
 * functions cannot hold one. Instead this component polls the backend every
 * 10 seconds for new messages and thread updates. Not real-time to the
 * millisecond, but reliable and simple to host.
 *
 * Sending is still a POST — transactional, idempotent on `clientId`.
 */

export type Thread = {
  id: string;
  code: string;
  kind: string;
  subject: string;
  status: string;
  customerKey: string;
  kitchenId: string | null;
  unread: number;
  lastMessageAt: string;
  lastMessageBody: string;
  lastMessageFrom: string;
  orderCode: string | null;
  orderId: string | null;
};

export type Message = {
  id: string;
  /** The sender's own key for this message; the backend's replay guard. */
  clientId?: string | null;
  senderType: string;
  senderName: string;
  body: string;
  sentAt: string;
  hidden: boolean;
  systemKind: string | null;
};

const POLL_MS = 10_000; // refresh every 10 seconds

export function ChatDesk({
  me,
  threads: initialThreads,
  activeId,
  activeSubject,
  activeStatus,
  initialMessages,
}: {
  me: { email: string; name: string };
  threads: Thread[];
  activeId: string | null;
  activeSubject: string;
  activeStatus: string;
  initialMessages: Message[];
}) {
  const router = useRouter();
  const [threads, setThreads] = useState(initialThreads);
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState('');
  const [connected, setConnected] = useState(true);
  const [sending, setSending] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  // Server-rendered props change on navigation; adopt them.
  useEffect(() => setThreads(initialThreads), [initialThreads]);
  useEffect(() => setMessages(initialMessages), [initialMessages]);

  const scrollDown = useCallback(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, []);

  useEffect(scrollDown, [messages.length, scrollDown]);

  /* ---- HTTP polling ---- */

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;

      try {
        // Refresh thread list
        const threadsRes = await fetch('/api/admin/v1/chat/threads?take=80', {
          cache: 'no-store',
        });
        if (threadsRes.ok) {
          const data = await threadsRes.json();
          if (!cancelled && data.threads) {
            setThreads(() => {
              const incoming: Thread[] = data.threads;
              return incoming.map((t) => {
                if (t.id === activeIdRef.current) return { ...t, unread: 0 };
                return t;
              });
            });
          }
        }

        // Refresh messages for the open thread
        const currentId = activeIdRef.current;
        if (currentId) {
          const msgsRes = await fetch(
            `/api/admin/v1/chat/messages?threadId=${encodeURIComponent(currentId)}&take=80`,
            { cache: 'no-store' },
          );
          if (msgsRes.ok) {
            const data = await msgsRes.json();
            if (!cancelled && data.messages) {
              setMessages((prev) => {
                const incoming: Message[] = data.messages;

                /* The server list is the truth, and it is already ordered.
                   The only thing it cannot know about is a reply still in
                   flight — that row is held under the `clientId` the POST was
                   sent with, so matching on it is what stops a message the
                   server has since stored from being drawn a second time. */
                const known = new Set<string>();
                for (const msg of incoming) {
                  known.add(msg.id);
                  if (msg.clientId) known.add(msg.clientId);
                }

                const inFlight = prev.filter(
                  (m) => !known.has(m.id) && !(m.clientId && known.has(m.clientId)),
                );

                return [...incoming, ...inFlight];
              });
            }
          }
        }

        setConnected(true);
      } catch {
        setConnected(false);
      }
    };

    const interval = setInterval(poll, POLL_MS);
    void poll(); // poll immediately on mount / thread change

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeId]);

  /* ---- opening a thread ---- */

  const open = (threadId: string) => {
    setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t)));
    fetch('/api/admin/v1/chat/read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ threadId }),
    }).catch(() => {});
    router.push(`/chat?thread=${threadId}`);
  };

  useEffect(() => {
    if (!activeId) return;
    fetch('/api/admin/v1/chat/read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ threadId: activeId }),
    }).catch(() => {});
  }, [activeId]);

  /* ---- sending ---- */

  const send = async () => {
    const body = draft.trim();
    if (!body || !activeId || sending) return;

    const clientId = `admin-${crypto.randomUUID()}`;
    const optimistic: Message = {
      id: clientId,
      /* Carried so a poll that lands before the POST answers recognises the
         stored copy as this row rather than as a second message. */
      clientId,
      senderType: 'admin',
      senderName: me.name,
      body,
      sentAt: new Date().toISOString(),
      hidden: false,
      systemKind: null,
    };

    setMessages((prev) => [...prev, optimistic]);
    setDraft('');
    setSending(true);

    try {
      const response = await fetch('/api/admin/v1/chat/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ threadId: activeId, body, clientId }),
      });
      const json = await response.json();

      if (!response.ok) throw new Error(json.message ?? 'Could not send.');

      // Swap the optimistic row for the stored one, so its id is real.
      setMessages((prev) => prev.map((m) => (m.id === clientId ? json.message : m)));
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== clientId));
      setDraft(body);
    } finally {
      setSending(false);
    }
  };

  const active = useMemo(() => threads.find((t) => t.id === activeId), [threads, activeId]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr]">
      {/* inbox */}
      <aside className="max-h-[560px] overflow-y-auto border-line lg:border-r">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-sunken px-3 py-2">
          <span className="label">Conversations</span>
          <span
            className={`inline-flex items-center gap-1 text-[11px] ${connected ? 'text-sage' : 'text-ink3'}`}
            title={connected ? 'Polling — refreshes every 10s' : 'Connection error, retrying…'}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? 'bg-sage animate-pulse' : 'bg-ink3'}`}
              aria-hidden
            />
            {connected ? 'live' : 'offline'}
          </span>
        </div>

        <ul className="divide-y divide-line2">
          {threads.map((thread) => (
            <li key={thread.id}>
              <button
                type="button"
                onClick={() => open(thread.id)}
                className={`w-full px-3 py-2.5 text-left transition-colors ${
                  thread.id === activeId ? 'bg-primary-50' : 'hover:bg-sunken'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Badge tone={thread.kind === 'support' ? 'warn' : 'info'}>
                      {thread.kind}
                    </Badge>
                    <span className="truncate text-[12.5px] font-medium">
                      {thread.subject || thread.code}
                    </span>
                  </span>
                  {thread.unread > 0 ? (
                    <span className="tnum shrink-0 rounded-full bg-saffron-100 px-1.5 text-[10.5px] font-bold text-saffron">
                      {thread.unread}
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 truncate text-[11.5px] text-ink3">
                  {thread.lastMessageFrom === 'admin' ? 'You: ' : ''}
                  {thread.lastMessageBody || 'No messages yet'}
                </div>
                <div className="mt-0.5 text-[10.5px] text-ink3">
                  {timeAgo(thread.lastMessageAt)}
                </div>
              </button>
            </li>
          ))}
          {threads.length === 0 ? (
            <li className="px-3 py-10 text-center text-[12.5px] text-ink3">
              No conversations yet.
            </li>
          ) : null}
        </ul>
      </aside>

      {/* transcript */}
      <section className="flex max-h-[560px] min-w-0 flex-col">
        {activeId ? (
          <>
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold">
                  {active?.subject || activeSubject}
                </div>
                <div className="truncate text-[11.5px] text-ink3">
                  {active?.customerKey}
                  {active?.orderCode ? (
                    <>
                      {' · '}
                      <Link
                        href={`/orders/${active.orderId}`}
                        className="tnum hover:text-primary"
                      >
                        {active.orderCode}
                      </Link>
                    </>
                  ) : null}
                </div>
              </div>
              <Badge tone={(active?.status ?? activeStatus) === 'open' ? 'good' : 'neutral'}>
                {active?.status ?? activeStatus}
              </Badge>
            </header>

            <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
              {messages.map((message) => (
                <Bubble key={message.id} message={message} />
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="flex items-end gap-2 border-t border-line px-3 py-2.5">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={2}
                placeholder="Reply…"
                className="flex-1 resize-none rounded-[10px] border border-line bg-canvas px-3 py-2 text-[13px] outline-none placeholder:text-ink3 focus:border-primary-200"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={!draft.trim() || sending}
                className={BTN.primary}
              >
                {sending ? '…' : 'Send'}
              </button>
            </div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center px-4 py-16 text-center text-[13px] text-ink3">
            Nothing to answer. New conversations appear here automatically.
          </div>
        )}
      </section>
    </div>
  );
}

function Bubble({ message }: { message: Message }) {
  if (message.senderType === 'system') {
    return (
      <div className="text-center text-[11.5px] text-ink3">{message.body}</div>
    );
  }

  const mine = message.senderType === 'admin';

  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[76%]">
        {!mine ? (
          <div className="mb-0.5 flex items-center gap-1.5 text-[10.5px] text-ink3">
            <Badge tone={message.senderType === 'cook' ? 'warn' : 'info'}>
              {message.senderType}
            </Badge>
            {message.senderName}
          </div>
        ) : null}
        <div
          className={`rounded-[14px] px-3 py-2 text-[13px] leading-relaxed ${
            mine
              ? 'bg-primary text-on-primary'
              : 'border border-line bg-sunken text-ink'
          } ${message.hidden ? 'opacity-50 line-through' : ''}`}
        >
          {message.hidden ? 'hidden by a moderator' : message.body}
        </div>
        <div
          className={`mt-0.5 text-[10.5px] text-ink3 ${mine ? 'text-right' : ''}`}
          title={fmtDateTime(message.sentAt)}
        >
          {timeAgo(message.sentAt)}
        </div>
      </div>
    </div>
  );
}
