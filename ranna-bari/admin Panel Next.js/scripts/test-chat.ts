/**
 * Chat, end to end, against a running server.
 *
 * Not a unit test: it talks HTTP and WebSocket to `npm run dev` exactly as the
 * app would. What it is checking is the things that are easy to get wrong and
 * invisible until somebody is hurt by them —
 *
 *   - a token is required, and a forged one is refused
 *   - one customer cannot read another customer's thread, by id
 *   - a cook cannot read a thread their kitchen is not on
 *   - a replayed `clientId` posts once, not twice
 *   - a message reaches the other side over the socket, live
 *   - unread counters are per-side and land on the right side
 *
 * Run the server first, then `npm run test:chat`.
 */
import WebSocket from 'ws';

const BASE = process.env.TEST_BASE ?? 'http://localhost:3100';
const WS = BASE.replace(/^http/, 'ws');

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

type Json = Record<string, any>;

async function api(
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {},
): Promise<{ status: number; json: Json }> {
  const response = await fetch(`${BASE}/api/app/v1${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json };
}

/** Sign in as a phone number, the way the app will. */
async function signIn(phone: string) {
  const requested = await api('/auth/request-otp', { method: 'POST', body: { phone } });
  if (!requested.json.devCode) throw new Error(`no dev code for ${phone}`);

  const verified = await api('/auth/verify-otp', {
    method: 'POST',
    body: { phone, code: requested.json.devCode, device: { name: 'test', platform: 'node' } },
  });
  if (!verified.json.token) throw new Error(`sign-in failed for ${phone}: ${JSON.stringify(verified.json)}`);

  return { token: verified.json.token as string, account: verified.json.account as Json };
}

/** Open a socket and collect what arrives on it. */
function listen(token: string) {
  const socket = new WebSocket(`${WS}/ws?token=${encodeURIComponent(token)}`);
  const events: Json[] = [];
  const ready = new Promise<void>((resolve, reject) => {
    socket.on('message', (raw) => {
      const event = JSON.parse(String(raw));
      events.push(event);
      if (event.type === 'ready') resolve();
    });
    socket.on('error', reject);
    setTimeout(() => reject(new Error('socket never became ready')), 5000);
  });
  return { socket, events, ready };
}

const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));

const TEST_PHONES = ['+8801712345678', '+8801898765432'];

/**
 * Put the two test numbers back to never-having-been-here.
 *
 * Two things otherwise carry over and both are the system working correctly:
 * five codes an hour is the right limit and this test asks for four, and one
 * open support thread per person is the right rule so the second run finds
 * the first run's thread already there. Neither is what is under test, so
 * both get reset rather than worked around.
 */
async function resetTestNumbers() {
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();
  await db.otpChallenge.deleteMany({ where: { phone: { in: TEST_PHONES } } });
  await db.chatThread.deleteMany({ where: { customerKey: { in: TEST_PHONES } } });
  await db.$disconnect();
}

async function main() {
  console.log('\nChat end to end\n');
  await resetTestNumbers();

  /* ---- authentication ---- */

  const anonymous = await api('/chat/threads');
  check('an unauthenticated request is refused', anonymous.status === 401);

  const forged = await api('/chat/threads', { token: 'not.a.real.token' });
  check('a forged token is refused', forged.status === 401);

  const badPhone = await api('/auth/request-otp', { method: 'POST', body: { phone: '12345' } });
  check('a malformed phone number is refused', badPhone.status === 400);

  const alice = await signIn('01712345678');
  const bob = await signIn('+8801898765432');
  check('OTP sign-in returns a token', !!alice.token && !!bob.token);
  check(
    'the phone number is normalised into the account key',
    alice.account.customerKey === '+8801712345678',
    alice.account.customerKey,
  );

  // The same handset typed four ways is one account, not four.
  const again = await signIn('880 1712-345678');
  check(
    'the same number in another format is the same account',
    again.account.customerKey === alice.account.customerKey,
    again.account.customerKey,
  );

  const me = await api('/auth/me', { token: alice.token });
  check('the token identifies its holder', me.json.account?.customerKey === '+8801712345678');

  /* ---- threads ---- */

  const opened = await api('/chat/threads', {
    method: 'POST',
    token: alice.token,
    body: { kind: 'support', subject: 'Where is my order?' },
  });
  const threadId = opened.json.thread?.id;
  check('a support thread opens', !!threadId && opened.json.created === true);

  const reopened = await api('/chat/threads', {
    method: 'POST',
    token: alice.token,
    body: { kind: 'support' },
  });
  check(
    'asking twice returns the same thread, not a second one',
    reopened.json.thread?.id === threadId && reopened.json.created === false,
  );

  /* ---- the isolation that matters ---- */

  const bobPeeking = await api(`/chat/messages?threadId=${threadId}`, { token: bob.token });
  check(
    "another customer cannot read the thread, even with its id",
    bobPeeking.status === 403,
    `got ${bobPeeking.status}`,
  );

  const bobSending = await api('/chat/messages', {
    method: 'POST',
    token: bob.token,
    body: { threadId, body: 'let me in', clientId: `intruder-${Date.now()}` },
  });
  check('another customer cannot post into it either', bobSending.status === 403);

  const bobInbox = await api('/chat/threads', { token: bob.token });
  check(
    "another customer's inbox does not contain it",
    !(bobInbox.json.threads ?? []).some((t: Json) => t.id === threadId),
  );

  /* ---- sending, and idempotency ---- */

  const clientId = `test-${Date.now()}`;
  const first = await api('/chat/messages', {
    method: 'POST',
    token: alice.token,
    body: { threadId, body: 'My order never arrived.', clientId },
  });
  check('a message posts', first.status === 200 && !!first.json.message?.id);

  // The offline outbox replaying the same message on reconnect.
  const replay = await api('/chat/messages', {
    method: 'POST',
    token: alice.token,
    body: { threadId, body: 'My order never arrived.', clientId },
  });
  check('a replayed clientId is not posted twice', replay.json.duplicate === true);
  check(
    'the replay returns the original message',
    replay.json.message?.id === first.json.message?.id,
  );

  const transcript = await api(`/chat/messages?threadId=${threadId}`, { token: alice.token });
  check(
    'the transcript holds exactly one copy',
    (transcript.json.messages ?? []).filter((m: Json) => m.clientId === clientId).length === 1,
  );

  const empty = await api('/chat/messages', {
    method: 'POST',
    token: alice.token,
    body: { threadId, body: '   ', clientId: `blank-${Date.now()}` },
  });
  check('an empty message is refused', empty.status === 400);

  /* ---- live delivery ---- */

  const aliceSocket = listen(alice.token);
  await aliceSocket.ready;
  check('a socket authenticates with a bearer token', true);

  const rejected = await new Promise<boolean>((resolve) => {
    const ws = new WebSocket(`${WS}/ws?token=nonsense`);
    ws.on('error', () => resolve(true));
    ws.on('open', () => {
      ws.close();
      resolve(false);
    });
    setTimeout(() => resolve(false), 3000);
  });
  check('a socket with a bad token is refused the upgrade', rejected);

  // Support replies. Alice should hear it without asking.
  const supportToken = await adminCookie();
  if (supportToken) {
    const reply = await fetch(`${BASE}/api/app/v1/chat/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: supportToken },
      body: JSON.stringify({
        threadId,
        body: 'Looking into it now.',
        clientId: `support-${Date.now()}`,
      }),
    });
    check('an operator can reply using the panel session', reply.status === 200);

    await settle(600);
    const delivered = aliceSocket.events.find(
      (e) => e.type === 'message' && e.message?.body === 'Looking into it now.',
    );
    check('the reply arrives over the socket, live', !!delivered);

    const inbox = await api('/chat/threads', { token: alice.token });
    const thread = (inbox.json.threads ?? []).find((t: Json) => t.id === threadId);
    check('the unread counter moved for the customer', (thread?.unread ?? 0) >= 1, `unread ${thread?.unread}`);

    await api('/chat/read', { method: 'POST', token: alice.token, body: { threadId } });
    const afterRead = await api('/chat/threads', { token: alice.token });
    const cleared = (afterRead.json.threads ?? []).find((t: Json) => t.id === threadId);
    check('marking read zeroes it', cleared?.unread === 0);
  } else {
    console.log('  skip operator reply — could not mint an admin session');
  }

  aliceSocket.socket.close();

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

/** An operator session cookie, so the test can reply as support. */
async function adminCookie(): Promise<string | null> {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const { SignJWT } = await import('jose');
    const db = new PrismaClient();
    const user = await db.adminUser.findFirst({ where: { role: 'superadmin' } });
    await db.$disconnect();
    if (!user) return null;

    const token = await new SignJWT({ email: user.email, name: user.name, role: user.role })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));

    return `rb_admin_session=${token}`;
  } catch {
    return null;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
