'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Badge, BTN } from '@/components/ui';
import { fmtDateTime, timeAgo } from '@/lib/format';

/**
 * The support desk, live.
 *
 * One socket for the whole page. The inbox and the open transcript both read
 * from it, which is what keeps a reply landing in the list *and* in the pane
 * without two subscriptions disagreeing about what arrived.
 *
 * Sending is a POST, not a socket frame — it has to be transactional and
 * idempotent, and a frame has no status code to act on. The socket is only
 * for delivery.
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
  senderType: string;
  senderName: string;
  body: string;
  sentAt: string;
  hidden: boolean;
  systemKind: string | null;
};

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
  const [connected, setConnected] = useState(false);
  const [typing, setTyping] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Server-rendered props change on navigation; adopt them.
  useEffect(() => setThreads(initialThreads), [initialThreads]);
  useEffect(() => setMessages(initialMessages), [initialMessages]);

  const scrollDown = useCallback(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, []);

  useEffect(scrollDown, [messages.length, scrollDown]);

  /* ---- the socket ---- */

  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const connect = () => {
      if (closed) return;

      const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
      // The operator's session cookie rides along automatically; no token in
      // the URL for the panel, unlike the app.
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        attempt = 0;
        setConnected(true);
        if (activeId) socket.send(JSON.stringify({ type: 'subscribe', threadId: activeId }));
      };

      socket.onclose = () => {
        setConnected(false);
        if (closed) return;
        /* Backing off rather than hammering. A desk left open overnight
           through a deploy should reconnect, not generate ten thousand
           handshakes against a server that is still starting. */
        attempt = Math.min(attempt + 1, 6);
        retry = setTimeout(connect, Math.min(1000 * 2 ** attempt, 30_000));
      };

      socket.onerror = () => socket.close();

      socket.onmessage = (event) => {
        let payload: {
          type: string;
          threadId?: string;
          message?: Message;
          thread?: Thread;
          side?: string;
          name?: string;
        };
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }

        if (payload.type === 'message' && payload.message && payload.threadId) {
          const incoming = payload.message;
          const threadId = payload.threadId;

          if (threadId === activeId) {
            setMessages((prev) =>
              prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming],
            );
          }

          setThreads((prev) => {
            const next = prev.map((t) =>
              t.id === threadId
                ? {
                    ...t,
                    lastMessageAt: incoming.sentAt,
                    lastMessageBody: incoming.body,
                    lastMessageFrom: incoming.senderType,
                    unread:
                      threadId === activeId || incoming.senderType === 'admin'
                        ? t.unread
                        : t.unread + 1,
                  }
                : t,
            );
            // Newest conversation first, the way an inbox is read.
            return next.sort(
              (a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt),
            );
          });
        }

        if (payload.type === 'thread' && payload.thread) {
          // A conversation that did not exist when this page rendered.
          const arriving = payload.thread;
          setThreads((prev) =>
            prev.some((t) => t.id === arriving.id) ? prev : [arriving, ...prev],
          );
        }

        if (payload.type === 'typing' && payload.threadId === activeId) {
          setTyping(payload.name ?? 'Someone');
          setTimeout(() => setTyping(null), 3000);
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      socketRef.current?.close();
    };
  }, [activeId]);

  /* ---- opening a thread ---- */

  const open = (threadId: string) => {
    setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t)));
    fetch('/api/app/v1/chat/read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ threadId }),
    }).catch(() => {});
    router.push(`/chat?thread=${threadId}`);
  };

  useEffect(() => {
    if (!activeId) return;
    fetch('/api/app/v1/chat/read', {
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
      const response = await fetch('/api/app/v1/chat/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ threadId: activeId, body, clientId }),
      });
      const json = await response.json();

      if (!response.ok) throw new Error(json.message ?? 'Could not send.');

      // Swap the optimistic row for the stored one, so its id is real.
      setMessages((prev) => prev.map((m) => (m.id === clientId ? json.message : m)));
    } catch {
      // Put the text back rather than losing it, and drop the ghost.
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
            title={connected ? 'Live' : 'Reconnecting…'}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? 'bg-sage' : 'bg-ink3'}`}
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
              {typing ? (
                <div className="text-[11.5px] text-ink3">{typing} is typing…</div>
              ) : null}
              <div ref={bottomRef} />
            </div>

            <div className="flex items-end gap-2 border-t border-line px-3 py-2.5">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends; shift-enter is a newline. A support desk types
                  // fast and reaching for a button every time costs more than
                  // the occasional accidental send.
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={2}
                placeholder="Reply…"
                className="flex-1 resize-none rounded-[10px] border border-line bg-canvas px-3 py-2 text-[13px] outline-none placeholder:text-ink3 focus:border-primary-200"
              />
              <button
                type="button"
                onClick={send}
                disabled={!draft.trim() || sending}
                className={BTN.primary}
              >
                {sending ? '…' : 'Send'}
              </button>
            </div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center px-4 py-16 text-center text-[13px] text-ink3">
            Nothing to answer. New conversations appear here the moment they open.
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
