# RannaBari Backend — Build Prompt (Node + MongoDB)

> Paste this into Claude Code / Cursor as a single brief.
> It is written against two codebases that already exist and were read in
> full: `../User and Cook App` (Expo/React Native) and
> `../admin Panel Next.js` (Next 16 + Prisma/SQLite). Every field name,
> status value and error code below is taken from them verbatim.

---

## 0. What you are building

A standalone Node backend in **`backend-node/`**, on **MongoDB**, that becomes
the single source of truth for the RannaBari home-cook marketplace.

Two consumers, and they are **not** treated the same:

| Consumer | Now |
|---|---|
| **`admin Panel Next.js`** | **Integrate.** It stops using Prisma/SQLite and becomes a client of this backend. |
| **`User and Cook App`** | **Do not touch.** It keeps its AsyncStorage. Build and document its endpoints; wire them later. |

That asymmetry is deliberate. The admin panel is an operator tool used by four
people on a desk — migrating it is a contained change with a real user waiting
for it. The app is offline-first by design and has thousands of lines built on
that assumption; moving it is a separate project, and doing both at once means
neither is verifiable.

**Build the app's endpoints anyway.** They are how the app migrates later, and
designing them now is what stops the admin panel's needs from quietly becoming
the only shape the API can take.

---

## 1. The two codebases, precisely

### 1.1 The Expo app — six systems, zero backend

It persists everything to AsyncStorage under eleven keys:

```
rannabari_account          the signed-in profile          (AuthContext)
rannabari_viewmode         'cook' | 'customer'
rannabari_kitchen          the cook's own kitchen         (KitchenContext)
rannabari_orders           cash-on-delivery orders        (OrdersContext)
rannabari_cart             the basket                     (CartContext)
rannabari_meals            EVERYTHING else                (CommerceContext)
rannabari_recent_searches
rannabari_token            server session                 (SessionContext)
rannabari_identity
rannabari_chat_outbox      unsent messages
rannabari_order_server_ids local order code -> server id
```

`rannabari_meals` is one document holding `meals`, `stores`, `categories`,
`products`, `carts`, `taxonomy`, `requests`, `offers`, `orders`, `ledger`,
`notifications`, `seq`. That is not sloppiness — read the header comment in
`src/lib/ledger.js`. It is one document because the operations that matter
span several collections and there must be no instant where half of one
happened. **In Mongo that becomes a transaction, not a document.**

The six systems:

1. **Discovery** — 20 kitchens (`chefs.json`, ids **1–20**), 80 dishes, 18 reviews. Distance-gated: shown only if `distanceKm(customer, kitchen) <= deliveryRadiusKm`.
2. **Cash on delivery** — cart → checkout → one order **per kitchen**; delivery + platform fee ride on the first only. Rail: `placed → accepted → cooking → on_the_way → delivered`, plus `cancelled` / `rejected`. Cook keeps **85%** of `subtotal`.
3. **Pre-booked meals** — a cook publishes for a serve date + slot (`breakfast` 8/7, `lunch` 13/10, `dinner` 20/17) with capacity and a deadline. Customers show interest, then confirm — which **holds money in escrow**.
4. **Cook stores** — a shop per kitchen: own categories, products with stock/options/min-max/preorder. Checkout groups by store **and** by preorder-vs-instant.
5. **Food requests + bidding** — a customer describes something nobody listed, to one cook or broadcast. Cooks bid; the customer haggles. Three load-bearing rules, quoted from `requestLogic.js`: **a cook never sees a competitor's price**, **nothing is overwritten** (every price is appended with who said it), **you cannot accept your own offer** (whose turn it is falls out of the history).
6. **Wallet / escrow / ledger** — accounts `customer`, `held`, `cook`, plus `external` for money entering or leaving. Balances **folded from an append-only ledger, never stored**.

Cross-cutting: notifications (`audience: 'customer' | 'cook'`, deduped by `key` while unread, capped 100), English + Bengali with Bengali numerals, light/dark.

`src/lib/ledger.js` says the quiet part out loud:

> When a backend arrives, these transitions are its specification.

**Port those transitions. Do not redesign them.**

### 1.2 The admin panel — what already exists

Next 16, Prisma over SQLite, **27 models**, and a working feature set you are
replacing the storage layer of, not rewriting:

```
Account OtpChallenge AppSession Kitchen Dish Meal Store StoreCategory
Product TaxonomyCategory Request Offer Order LedgerEntry PayoutRun
PayoutItem TopUp Dispute Review Notification Zone Setting FeatureFlag
AdminUser AuditLog ChatThread ChatMessage
```

It already serves these, and they must keep working byte-identically:

```
GET  /api/app/v1/config           fees, rates, zones, taxonomy, flags
GET  /api/app/v1/kitchens         chefs.json shape, optional ?menus=1
POST /api/app/v1/kitchens/mine    a cook registers their own kitchen
GET  /api/app/v1/offers           a cook's own offers, never a rival's
GET  /api/app/v1/orders           my orders, either side
POST /api/app/v1/orders           mirror a device order up (idempotent on code)
POST /api/app/v1/auth/request-otp
POST /api/app/v1/auth/verify-otp
GET  /api/app/v1/auth/me
GET  /api/app/v1/chat/threads     POST to open
GET  /api/app/v1/chat/messages    POST to send
POST /api/app/v1/chat/read
WS   /ws                          live chat delivery
```

Read `lib/logic/ledger.ts`, `lib/logic/chat.ts`, `lib/logic/sync.ts`,
`lib/app-auth.ts` and `lib/realtime.ts` before writing anything. They are the
specification, already written in TypeScript, already tested.

---

## 2. Stack

- **Node 20+**, TypeScript, ESM.
- **Fastify** (or Express — Fastify preferred for schema validation and speed).
- **MongoDB Atlas** via **Mongoose**.
- **`ws`** for the chat socket, attached to the same HTTP server.
- **`zod`** for request validation at the edge.
- **`jose`** for tokens (both realms).
- **`vitest`** for tests.
- **`pino`** for logs.

Connection string goes in `backend-node/.env`, **never in a committed file**:

```
MONGODB_URI="mongodb+srv://<user>:<password>@cluster0.4uctodg.mongodb.net/rannabari?retryWrites=true&w=majority&appName=Cluster0"
```

Commit a `.env.example` with placeholders. `.gitignore` must cover `.env`
before the first commit — a connection string in git history is a rotated
password, not a fixed bug.

Name the database explicitly (`/rannabari` above). Atlas defaults to `test`
otherwise, which is a nasty surprise the first time you point staging at it.

---

## 3. MongoDB is not SQLite — the decisions that matter

This is most of the engineering. Get these wrong and the invariants quietly
stop holding.

### 3.1 Transactions need a replica set — Atlas gives you one

Every multi-collection operation runs in `session.withTransaction()`. Not
optional: confirming a store order debits a wallet, decrements stock, creates
orders and files a notification, and there must be no instant where some of
that happened. Write a helper:

```ts
export async function tx<T>(fn: (session: ClientSession) => Promise<T>): Promise<T>
```

and make it impossible to write a money path without it.

**Every write inside must pass `{ session }`.** A single query that forgets it
runs outside the transaction and silently breaks atomicity — this is the most
common Mongoose transaction bug and it does not error.

### 3.2 The append-only ledger

SQLite had a trigger. MongoDB has no triggers, so this needs **two** guards:

1. **Mongoose middleware** on the ledger model — `pre` hooks on
   `updateOne`, `updateMany`, `findOneAndUpdate`, `deleteOne`, `deleteMany`,
   `findOneAndDelete` and `replaceOne` that `throw`. Covers application bugs.
2. **An Atlas custom database role** granting the application user only
   `find` and `insert` on `ledgerEntries`. Covers everything else, including
   a future maintenance script written by somebody who never read this file.

The first is a lint; the second is the control. Do both, and document the role
in `README.md` — a guard that exists only in a dashboard nobody knows about is
a guard that gets deleted.

### 3.3 Balances are folded, never stored

```ts
db.ledgerEntries.aggregate([
  { $group: { _id: null,
      in:  { $sum: { $cond: [{ $eq: ['$to', account] }, '$amount', 0] } },
      out: { $sum: { $cond: [{ $eq: ['$from', account] }, '$amount', 0] } } } },
])
```

Index `{ from: 1 }`, `{ to: 1 }`, `{ toRef: 1 }`, `{ fromRef: 1 }`, `{ at: -1 }`.
A stored total is a second source of truth and one of them will be wrong.

Provide a **reconciliation** endpoint that folds each account and checks it
against what the entry kinds imply, exactly as the panel does today.

### 3.4 Idempotency

Unique **sparse** index on `LedgerEntry.idemKey` and on `ChatMessage.clientId`.
Sparse matters — most ledger entries have no key, and a plain unique index
would reject the second null.

Keys already in use: `release:<orderId>`, `commission:<orderId>`,
`refund:<orderId>`, `payout:<runId>:<kitchenId>`, `split-refund:<orderId>`.
On duplicate-key (code **11000**), return the *stored* result — that is a
successful retry, not an error.

### 3.5 Embed or reference

The 16MB document limit is the rule underneath all of these:

| Field | Decision | Why |
|---|---|---|
| `Order.lines` | **embed** | bounded, always read with the order |
| `Order.history` | **embed** | bounded — a rail has six steps |
| `Order.address` | **embed** | one object, never queried alone |
| `Offer.history` | **embed** | a negotiation is a handful of prices |
| `Kitchen.tags` | **embed** | short array of strings |
| `Kitchen.dishes` | **reference** | a menu grows, and dishes are queried alone |
| `ChatMessage` | **reference** | unbounded. A busy thread would burst a document |
| `Meal.interested` | **reference** (`MealInterest`) | capacity is bounded, *interest* is not |
| `Notification` | **collection** | the app caps at 100; the server should not |

`Meal.interested` is an array of `customerKey` in the app. Keep the API shape
identical and store it as its own collection — a popular meal in a real
deployment is thousands of entries, and the app's cap was a device
constraint, not a product decision.

### 3.6 Two id spaces, and they are both real

The app ships kitchens numbered **1–20**; a database gives everything an
`_id`. An order the app places names `chefId: 4`.

Keep **`Kitchen.legacyId`** (unique, sparse) and resolve on it. The admin
panel already does this in `lib/logic/sync.ts` — port `resolveKitchen()`,
which handles three shapes: a bundle id, an `_id`, and `local-1` (a cook's
own kitchen, meaningful only relative to the caller).

Keep **`Order.code`** (`RB-XXXXXX`, unique) as the app's natural idempotency
key. Order codes avoid I/O/0/1 on purpose — they get read aloud to riders.

### 3.7 Money is integers

Whole taka. The app never shows paisa. No floats anywhere near money.

### 3.8 Dates

Store UTC. `serveDate` is a **local calendar day string** (`YYYY-MM-DD`) in
**Asia/Dhaka**, not a timestamp — treating it as UTC moves tomorrow's lunch
to today for six hours a day. Dhaka is UTC+6 with no DST.

---

## 4. Collections

Field names are the app's. **Do not rename them** — the Expo client reads
them back.

```ts
Account          customerKey(unique) role name phone email kitchenName
                 specialty nid area lat lng addressDetail addressLabel
                 deliveryRadiusKm avatar suspended suspendedReason
                 phoneVerifiedAt tokenVersion signedInAt

OtpChallenge     phone codeHash attempts expiresAt consumedAt ip
                 TTL index on expiresAt

AppSession       accountId tokenId(unique) device platform
                 createdAt lastSeenAt expiresAt revokedAt

Kitchen          accountId legacyId(unique,sparse) name ownerName avatar
                 coverImage specialty description rating reviewCount
                 tags[] ecoBadge isVerified area lat lng deliveryRadiusKm
                 isOpen suspended suspendedReason
                 kycStatus kycNote kycDecidedAt kycDecidedBy nextDishSeq

Dish             kitchenId name description price image tags[] available

Meal             code(unique) kitchenId cookName title description image
                 price capacity serveDate slot deadline handover
                 handoverNote area lat lng deliveryRadiusKm status
                 cancelReason
MealInterest     mealId customerKey at     (unique on mealId+customerKey)

Store            kitchenId(unique) name tagline description logo cover
                 phone area lat lng deliveryRadiusKm deliveryFee
                 freeDeliveryOver isOpen
StoreCategory    storeId name emoji order
Product          storeId categoryId name description images[] price stock
                 minQty maxQty active preorder prepTime deliveryNote
                 options[] outOfStockSince
Cart             customerKey lines[]

TaxonomyCategory key(unique) label emoji order retired

Request          code(unique) customerKey title description quantity budget
                 target eligible[] wantedFor category area lat lng
                 status selectedOfferId orderId
Offer            requestId kitchenId cookName status price agreedPrice
                 note prepTime history[]   (unique on requestId+kitchenId)

Order            code(unique) kind mealId storeId requestId offerId
                 kitchenId cookName title image customerKey customerName
                 phone address handover serveDate slot lines[] subtotal
                 deliveryFee platformFee price amount preorder status
                 payment cookAmount platformAmount rejectReason
                 cancelReason history[] deliveredAt completedAt

LedgerEntry      kind amount from to fromRef toRef mealId orderId
                 payoutRunId note idemKey(unique,sparse) at
                 *** APPEND ONLY ***

PayoutRun        code(unique) status method note total cookCount
                 createdBy paidAt paidBy
PayoutItem       payoutRunId kitchenId kitchenName amount
TopUp            customerKey amount method reconciled pspRef pspAmount note

Dispute          code(unique) orderId(unique) status openedBy reason
                 resolution resolutionNote refundAmount releaseAmount
                 notes[] resolvedAt resolvedBy

Review           kitchenId customerKey name avatar area rating text
                 hidden hiddenBy hiddenAt hiddenNote date

Notification     key audience kind title body customerKey kitchenId zone
                 mealId orderId requestId offerId broadcastBy read at

ChatThread       code(unique) kind orderId requestId customerKey kitchenId
                 openedBy subject status closedAt closedBy lastMessageAt
                 lastMessageBody lastMessageFrom
                 unreadCustomer unreadCook unreadAdmin
ChatMessage      threadId senderType senderRef senderName body
                 attachments[] systemKind clientId(unique) sentAt
                 readByCustomerAt readByCookAt readByAdminAt
                 hidden hiddenBy hiddenAt hiddenNote

Zone             name(unique) active deliveryFee platformFee lat lng order
Setting          key(_id) value updatedBy
FeatureFlag      key(_id) enabled description updatedBy

AdminUser        email(unique) name passwordHash role active
                 totpSecret totpEnabled lastLoginAt
AuditLog         actorId actorEmail actorRole action targetType targetId
                 summary before after ip at
                 *** APPEND ONLY ***
```

`customerKey` = `(email || phone || 'guest').toLowerCase()`, or the
normalised phone `+8801XXXXXXXXX` for a phone-first signup.

---

## 5. Vocabulary — copy it exactly

### Error codes
Port the `ERR` map from `lib/domain.ts` unchanged. The app and the panel both
branch on these strings; inventing new ones breaks both.

```
meal-missing meal-closed meal-deadline-passed meal-sold-out
meal-already-ordered store-missing store-closed product-missing
product-unavailable product-out-of-stock product-not-enough-stock
product-below-minimum product-above-maximum cart-empty category-in-use
name-required request-missing request-closed request-not-eligible
offer-missing offer-closed offer-no-price offer-not-your-turn
offer-not-agreed wallet-low-balance order-missing order-wrong-state
order-already-settled amount-invalid kitchen-missing admin-forbidden
dispute-missing dispute-closed duplicate-request payout-nothing-due
payout-run-closed
```

Errors go out as `{ error: <code>, message: <sentence> }`.

### Transitions
Every business operation is a pure function with this shape, ported from the
app and the panel:

```ts
(state, args) => { ok: true, result } | { ok: false, error, detail? }
```

Screens never compute a balance, a stock level or a total. They call a
transition and render its answer.

### Order rails
```
COD:    placed → accepted → cooking → on_the_way → delivered
Escrow: confirmed → preparing → ready → delivering → delivered → completed
        pickup drops `delivering`; a pre-order gains `pending` in front
Both:   cancelled | rejected
```

**Money moves on `completed`, not `delivered`.** `delivered` is the courier's
word, `completed` is the customer's, and the gap between them is the entire
design. Never collapse them.

---

## 6. Authentication — two realms, never interchangeable

Two secrets, two claim shapes, two verifiers. An admin session must never
open a customer endpoint and a customer token must never reach the panel.
Sharing one module is how that happens by accident.

### App accounts — phone + one-time code
No password: the account is already keyed on a phone number and a password is
one more thing to lose. Port `lib/app-auth.ts`:

- normalise to `+8801XXXXXXXXX` — `01712…`, `8801712…` and `+8801712…` are one handset, not three
- scrypt the code, never store it in the clear
- 6 digits, 5-minute expiry, 5 wrong tries, 5 codes per number per hour
- **find the account by `phone` first**, not by `customerKey` — a cook who signed up with an email has an email key with their phone in another column, and keying on the phone alone hands them a new empty account, detaching their kitchen and every order they ever cooked
- token carries a `jti` matching an `AppSession`, so one device can be revoked; `tokenVersion` revokes all at once
- **no SMS provider is wired.** In dev, log the code and return it. Gate that on `SMS_PROVIDER` and default it to off so it fails closed. Wiring a provider is the last thing between this and real use.

### Admin — email + password (+ TOTP)
scrypt (`salt:hash`), `jose` session, roles `superadmin | ops | finance |
support` with the capability map from `lib/domain.ts`.

**Authorisation is checked three times and only one counts:** the nav hides
links, `requirePage()` refuses to render, and the action checks before it
writes. The third is the control.

---

## 7. How the admin panel integrates

The panel is a Next.js app that currently calls Prisma directly from server
components and server actions. It becomes a client of this backend.

**Service-to-service auth.** The panel holds a `BACKEND_SERVICE_TOKEN` and
forwards *who is acting* as a signed header or claim. The backend must not
trust a `role` the panel sends without verifying the service token — a
compromised panel should not be able to escalate, and "the caller says they
are finance" is not authorisation.

**Migration order** — one module at a time, each verifiable:

1. Read-only pages first (`/kitchens`, `/orders`, `/audit`). No writes, so a
   mistake shows immediately and costs nothing.
2. Then non-money writes (`/kyc`, `/reviews`, `/settings`).
3. Then money last (`/ledger`, `/payouts`, `/disputes`), with the invariant
   tests green before and after.
4. Delete `prisma/` only once nothing imports it.

Keep `lib/domain.ts` in the panel — the error codes, rails and capability map
are shared vocabulary, not storage. Consider publishing it as a small shared
package rather than copying it into both.

**The panel's own tests must keep passing**, adapted to the new layer:
`npm run test:money` (20), `npm run test:chat` (23), `npm run test:order-chat`
(15).

---

## 8. Realtime

`ws` on `/ws`, attached to the same HTTP server via the `upgrade` event.

- React Native has `WebSocket` as a **built-in global** and no `EventSource`, so SSE would mean shipping a polyfill for a one-directional transport. Browsers cannot set headers on a WebSocket, so the app's token rides in the query string — which is why it is short-lived and revocable.
- **Sending is HTTP; the socket is delivery only.** A send must be transactional, idempotent, and able to fail with a status the app's offline outbox can act on. A frame has none of those.
- Identity is fixed at handshake and never re-read from the wire.
- Heartbeat with `ping`/`pong` and `terminate()` on silence — a phone that walks into a lift does not close its socket.
- Keep the fan-out registry behind **one function**, `publish()`. Today it can be an in-process Map; the moment there are two instances behind a load balancer, a message posted on A must reach a socket held by B. Swapping `publish()` for Redis pub/sub must not require touching anything else.

> A warning from the panel, worth carrying over: it keeps its socket registry
> on `globalThis` because Next bundles its own copy of the module. Two module
> instances meant two Maps, and every message delivered perfectly to **zero**
> recipients with no error anywhere. In a standalone service this does not
> arise — but the class of bug does. Module identity is not process identity.

---

## 9. Structure

```
backend-node/
  src/
    server.ts            http + ws, one process
    app.ts               fastify instance, plugins, error mapper
    config/              env (zod-validated), db connection
    models/              one file per collection, indexes declared here
    logic/               PORTED TRANSITIONS — the heart
      ledger.ts          post, balances, release, refund, split, reconcile
      meals.ts  stores.ts  requests.ts  chat.ts  sync.ts
    routes/
      app/v1/            the Expo client's API (§1.2 list)
      admin/v1/          the panel's API
      internal/          health, metrics
    auth/                app-auth.ts, admin-auth.ts, middleware
    realtime/            hub.ts, socket.ts
    lib/                 domain.ts (ERR, rails, roles), format, ids
  scripts/
    seed.ts              from the app's chefs/menus/reviews JSON
    migrate-from-sqlite.ts   lift the panel's existing dev.db
    test-money.ts  test-chat.ts  test-order-chat.ts
  tests/
  .env.example
  README.md
```

---

## 10. Seed

Read `../User and Cook App/src/data/{chefs,menus,reviews}.json` directly —
20 kitchens, 80 dishes, 18 reviews, same ids, same coordinates. Set
`legacyId` from `chefs.json`.

Then fabricate the half no single device can produce: ~12 customers, ~250
orders across all four systems, the ledger those orders imply, live requests
with competing offers and real negotiation histories.

**Seed things that are wrong on purpose.** An operator console with nothing
broken in it teaches you nothing:

- three cooks waiting on KYC
- escrow aged past the release window
- pre-orders nobody has answered
- products listed at zero stock for a fortnight
- top-ups with no payment reference
- a broadcast that reached no kitchen at all
- two reviews that need a moderator
- an open dispute mid-investigation

Use a **fixed-seed PRNG** so re-seeding gives the same database. A demo whose
numbers move every run makes it impossible to tell a fixed bug from a
different random draw.

---

## 11. Non-negotiables

1. **The ledger is append-only** — Mongoose hooks *and* an Atlas role. A correction is a new entry in the opposite direction.
2. **Balances are folded, never stored.**
3. **Money moves on `completed`, not `delivered`.**
4. **Every multi-collection write is a transaction**, and every query inside it passes `{ session }`.
5. **Every state-changing admin action is audited**, before and after, in the same transaction.
6. **A cook never sees another cook's price.** Make it a query predicate, not a check somebody can forget — the panel's `visibleTo(viewer)` composes into every read so a leak is not expressible.
7. **Idempotency on every money endpoint and every message.**
8. **No destructive delete.** Kitchens are suspended, categories retired, reviews hidden, messages hidden. A negotiation history is evidence.
9. **Field names stay as they are.**
10. **Two auth realms, never interchangeable.**

---

## 12. Build order

1. Scaffold, env validation, Mongo connection, health check.
2. Models + indexes. Verify the append-only guard **before** anything writes money.
3. Port `logic/ledger.ts`. Port its 20 invariant tests. Green before continuing.
4. Seed, from the app's own JSON.
5. Admin auth + audit log.
6. Admin read endpoints → migrate the panel's read-only pages.
7. Admin write endpoints → migrate KYC, reviews, settings.
8. Money endpoints → migrate ledger, payouts, disputes. Re-run the invariant tests.
9. App auth (OTP) + the `/api/app/v1` surface.
10. Chat + the socket. Port all 38 chat tests.
11. Meals, stores, requests transitions.
12. `migrate-from-sqlite.ts`, so the existing panel data survives.

Ship each step working before starting the next. Do not build twelve
half-finished modules.

---

## 13. Definition of done

- `npm run test` green, including the ported money, chat and order-chat suites.
- The admin panel runs entirely against this backend with `prisma/` deleted.
- A raw `updateOne` against `ledgerEntries` is **refused by MongoDB**, not just by the application.
- Reconciliation reports zero drift on seeded data.
- `/api/app/v1/kitchens?menus=1` returns a payload field-for-field identical to `chefs.json` + `menus.json`.
- A README that documents the Atlas role, the two auth realms, and the fact that no SMS provider is wired.
