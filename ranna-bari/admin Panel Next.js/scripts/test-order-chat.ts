/**
 * The customer ↔ cook lane, end to end.
 *
 * This is the one the support tests never touched, and the one that was
 * quietly broken: the launcher posted a local AsyncStorage order code at a
 * server that had never heard of the order. The fix is that orders are
 * mirrored up before a chat can name one, so this walks that whole path —
 * place, mirror, open, talk — and then tries to break into it from outside.
 *
 * Run the server first, then `npm run test:order-chat`.
 */
const BASE = process.env.TEST_BASE ?? 'http://localhost:3100';
const WS = BASE.replace(/^http/, 'ws');

let passed = 0;
let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => {
  if (ok) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

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
  return { status: response.status, json: await response.json().catch(() => ({})) };
}

async function signIn(phone: string) {
  const asked = await api('/auth/request-otp', { method: 'POST', body: { phone } });
  if (!asked.json.devCode) throw new Error(`no dev code for ${phone}`);
  const out = await api('/auth/verify-otp', {
    method: 'POST',
    body: { phone, code: asked.json.devCode },
  });
  if (!out.json.token) throw new Error(`sign-in failed: ${JSON.stringify(out.json)}`);
  return { token: out.json.token as string, account: out.json.account as Json };
}

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const orderCode = () => {
  let out = '';
  for (let i = 0; i < 6; i++) out += ALPHABET[Math.floor(Math.random() * 32)];
  return `RB-${out}`;
};

const rnd = () => `01${[7, 8, 9][Math.floor(Math.random() * 3)]}${String(Math.floor(Math.random() * 90000000) + 10000000)}`;

async function main() {
  console.log('\nCustomer ↔ cook chat\n');

  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();

  /* A seeded kitchen, and its owner's phone. The cook signs in as the person
     who owns that kitchen, which is what makes them the cook side. */
  const kitchen = await db.kitchen.findFirst({
    where: { legacyId: { not: null } },
    include: { account: true },
  });
  if (!kitchen?.account?.phone) throw new Error('no seeded kitchen with an account');

  const customer = await signIn(rnd());
  check('a customer signs in', !!customer.token);

  /* ---- the bug that was ---- */

  const localCode = orderCode();
  const withLocalCode = await api('/chat/threads', {
    method: 'POST',
    token: customer.token,
    body: { kind: 'order', orderId: localCode },
  });
  check(
    'a chat about an order the server has never seen is still refused',
    withLocalCode.status === 400,
    `got ${withLocalCode.status}`,
  );

  /* ---- mirror the order up, the way the app now does ---- */

  const recorded = await api('/orders', {
    method: 'POST',
    token: customer.token,
    body: {
      orders: [
        {
          code: localCode,
          kind: 'cod',
          // The app names kitchens by their bundle id, not by cuid.
          chefId: String(kitchen.legacyId),
          chefName: kitchen.name,
          title: 'Shorshe Ilish',
          items: [{ id: '1-1', name: 'Shorshe Ilish', price: 520, qty: 2 }],
          subtotal: 1040,
          deliveryFee: 40,
          platformFee: 10,
          total: 1090,
          status: 'placed',
          contact: { name: 'Test Customer', phone: '01711111111' },
          address: { label: 'Home', line: 'House 7, Road 3', area: 'Dhanmondi' },
        },
      ],
    },
  });
  const serverOrderId = recorded.json.results?.[0]?.orderId;
  check('the order mirrors up', recorded.json.results?.[0]?.ok === true, JSON.stringify(recorded.json));
  check('a bundle chefId resolves to a real kitchen', !!serverOrderId);

  const replay = await api('/orders', {
    method: 'POST',
    token: customer.token,
    body: { orders: [{ code: localCode, chefId: String(kitchen.legacyId) }] },
  });
  check(
    'a replayed order code does not create a second order',
    replay.json.results?.[0]?.created === false &&
      replay.json.results?.[0]?.orderId === serverOrderId,
  );

  /* ---- the customer opens the chat ---- */

  const opened = await api('/chat/threads', {
    method: 'POST',
    token: customer.token,
    body: { kind: 'order', orderId: serverOrderId },
  });
  const threadId = opened.json.thread?.id;
  check('the customer opens an order thread', !!threadId, JSON.stringify(opened.json));

  await api('/chat/messages', {
    method: 'POST',
    token: customer.token,
    body: { threadId, body: 'Please make it less spicy.', clientId: `cust-${Date.now()}` },
  });

  /* ---- the cook sees it, from the other side ---- */

  const cook = await signIn(kitchen.account.phone);
  check(
    'the kitchen owner signs in as a cook',
    cook.account.kitchenId === kitchen.id,
    `kitchenId ${cook.account.kitchenId}`,
  );

  const cookInbox = await api('/chat/threads', { token: cook.token });
  const cookThread = (cookInbox.json.threads ?? []).find((t: Json) => t.id === threadId);
  check("the thread is in the cook's inbox", !!cookThread);
  check('it is unread for the cook', (cookThread?.unread ?? 0) >= 1, `unread ${cookThread?.unread}`);

  const cookView = await api(`/chat/messages?threadId=${threadId}`, { token: cook.token });
  check(
    'the cook can read what the customer wrote',
    (cookView.json.messages ?? []).some((m: Json) => m.body === 'Please make it less spicy.'),
  );

  /* ---- live, both ways ---- */

  const { default: WebSocket } = await import('ws');
  const socket = new WebSocket(`${WS}/ws?token=${encodeURIComponent(customer.token)}`);
  const heard: Json[] = [];
  await new Promise<void>((resolve, reject) => {
    socket.on('message', (raw) => {
      const event = JSON.parse(String(raw));
      heard.push(event);
      if (event.type === 'ready') resolve();
    });
    socket.on('error', reject);
    setTimeout(() => reject(new Error('socket never ready')), 5000);
  });

  await api('/chat/messages', {
    method: 'POST',
    token: cook.token,
    body: { threadId, body: 'No problem, mild it is.', clientId: `cook-${Date.now()}` },
  });
  await new Promise((r) => setTimeout(r, 800));

  check(
    "the cook's reply reaches the customer live",
    heard.some((e) => e.type === 'message' && e.message?.body === 'No problem, mild it is.'),
  );
  socket.close();

  /* ---- and nobody else gets in ---- */

  const stranger = await signIn(rnd());
  const peek = await api(`/chat/messages?threadId=${threadId}`, { token: stranger.token });
  check('a stranger cannot read the thread', peek.status === 403, `got ${peek.status}`);

  const strangerOrder = await api('/chat/threads', {
    method: 'POST',
    token: stranger.token,
    body: { kind: 'order', orderId: serverOrderId },
  });
  check(
    "a stranger cannot open a chat on somebody else's order",
    strangerOrder.status === 403,
    `got ${strangerOrder.status}`,
  );

  const otherKitchen = await db.kitchen.findFirst({
    where: { legacyId: { not: null }, id: { not: kitchen.id }, account: { phone: { not: null } } },
    include: { account: true },
  });
  if (otherKitchen?.account?.phone) {
    const otherCook = await signIn(otherKitchen.account.phone);
    const nosy = await api(`/chat/messages?threadId=${threadId}`, { token: otherCook.token });
    check('another cook cannot read it either', nosy.status === 403, `got ${nosy.status}`);
  }

  const hijack = await api('/orders', {
    method: 'POST',
    token: stranger.token,
    body: { orders: [{ code: localCode, chefId: String(kitchen.legacyId) }] },
  });
  check(
    "a stranger cannot claim somebody else's order code",
    hijack.json.results?.[0]?.ok === false,
    JSON.stringify(hijack.json.results?.[0]),
  );

  await db.$disconnect();
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
