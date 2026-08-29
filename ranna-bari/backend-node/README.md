# RannaBari Backend

Node · TypeScript · Fastify · MongoDB (Mongoose) · `ws`

The platform's source of truth. Serves two consumers — the admin panel, which
integrates with it, and the Expo app, which is being wired onto it now.


---

## Run it

```bash
npm install

# Put the real Atlas password in .env — it is gitignored, and a connection
# string in git history is a rotated password, not a fixed bug.
cp .env.example .env      # already done; edit MONGODB_URI

npm run seed              # against MONGODB_URI
npm run dev               # http://localhost:4000 · ws://localhost:4000/ws
```

**No Atlas password yet?** Then run the whole thing without one:

```bash
npm run dev:local         # in-memory replica set, seeded, API + socket on :4000
```

A replica set specifically — every money path here is a transaction, and a
standalone `mongod` would start, serve reads, then fail at the first commit.
The script asserts that rather than letting you find out later. Nothing it
stores survives the process.

```bash
npm test                  # 57 assertions + the session checker
npm run seed:local        # seed a throwaway replica set and print the books
npm run routes            # what actually registered — 98 routes today
npm run check:sessions    # every in-transaction query passes { session }
```

Sign in as `admin@rannabari.app` / `rannabari` (also `ops@`, `finance@`,
`support@` — each sees a different slice).

```bash
npm run typecheck
npm run build && npm start
```

---

## Verified

| | |
|---|---|
| `npm test` | **57 passed** — money invariants, HTTP surface, ported transitions |
| `npm run check:sessions` | clean across 29 files |
| `npm run seed:local` | 20 kitchens, 380 orders, 510 ledger entries, **zero drift** |
| `npm run routes` | 98 routes across two prefixes |
| `GET /health` | reports whether transactions are actually possible |

What the tests actually assert, rather than assume:

- a raw `updateOne` on the ledger is **refused**, and the entry is unchanged
- a transaction that throws halfway leaves **nothing** behind
- releasing the same order twice pays **once**
- a split that does not account for the whole held amount is **refused**
- one customer cannot read another's thread **by id**
- a replayed `clientId` posts **once**
- `role: superadmin` asserted **without** the service token is refused

---

## The rules this code holds

1. **The ledger is append-only.** Mongoose middleware rejects every mutating
   operation, including re-saving a loaded document. That catches application
   bugs. The *control* is an Atlas role — see below.

2. **Balances are folded, never stored.** `balances()` aggregates the ledger
   on read. `reconcile()` folds each account and checks it against what the
   entry kinds imply; the seed reports zero drift.

3. **Money moves on `completed`, not `delivered`.** `delivered` is the
   courier's word and `completed` is the customer's. The gap is the design.

4. **Every multi-collection write is a transaction**, and every query inside
   passes `{ session }`. A query that forgets runs outside the transaction and
   is not rolled back — silently. There is a test for exactly that.

5. **Authorisation is a query predicate.** `visibleTo(viewer)` composes into
   every thread read, so `threadsFor()` *cannot* return a thread you are not
   on. A leak is not expressible, rather than merely not written.

6. **A cook never sees another cook's price.** `/offers` filters on
   `kitchenId` in the query itself. The *count* of rival offers is returned —
   a cook deciding whether to bid deserves to know they are one of five. The
   prices are not.

7. **Idempotency everywhere money or messages move.** `release:<orderId>`,
   `payout:<runId>:<kitchenId>`, and the device's own `clientId`. Duplicate
   key (11000) returns the stored result — a retry, not a failure.

8. **Two auth realms, never interchangeable.** Different secrets, claim shapes
   and verifiers. `config/env.ts` refuses to boot if the two secrets match.

9. **Field names are the app's.** `chefId`, `customerKey`, `serveDate`. The
   Expo client reads them back.

---

## ⚠️ The Atlas role — do this before production

Mongoose middleware is a lint. The control is the database refusing.

In Atlas → **Database Access** → **Custom Roles**, create `rannabari_app`:

| Collection | Actions |
|---|---|
| `ledgerEntries` | `find`, `insert` **only** |
| `auditLogs` | `find`, `insert` **only** |
| everything else | `find`, `insert`, `update`, `remove` |

Assign it to the application user. Without this, anything holding the
connection string can rewrite the money — including a maintenance script
written by somebody who never read this file.

`npm run seed` needs a broader role: it legitimately starts from nothing and
deletes ledger rows through the driver, deliberately going around the model
guard rather than weakening it. Run it as a separate admin user.

---

## MongoDB decisions

**Transactions need a replica set.** Atlas is always one; a bare local
`mongod` is not, and every money transition would fail at commit. `/health`
reports `transactions: true|false` so that is found from a log line rather
than from a customer.

**Embed or reference** — the 16MB document limit is the rule underneath:

| | | |
|---|---|---|
| `Order.lines`, `Order.history`, `Order.address` | embed | bounded, read together |
| `Offer.history` | embed | a negotiation is a handful of prices |
| `Kitchen.dishes` | reference | a menu grows, dishes are queried alone |
| `ChatMessage` | collection | unbounded — a busy thread would burst a document |
| `Meal.interested` | `MealInterest` collection | capacity is bounded; *interest* is not |

The app holds `interested` as an array on the meal, which is right for a
device. The API shape stays an array either way.

**Two id spaces, both real.** The app ships kitchens numbered 1–20; Mongo
gives everything an `_id`. `Kitchen.legacyId` bridges them, and
`resolveKitchen()` handles all three shapes an order can name: a bundle id, an
`_id`, and `local-1` — a cook's own kitchen, meaningful only relative to the
caller.

**Money is integers.** Whole taka, no floats. **Dates** are UTC, except
`serveDate`, which is a local calendar day in Asia/Dhaka — reading it as UTC
moves tomorrow's lunch to today for six hours a day.

---

## Layout

```
src/
  server.ts        http + ws, one process
  app.ts           fastify, CORS, one error shape
  config/          env (zod-validated, fails at boot), db + tx()
  models/          collections and indexes
    LedgerEntry.ts its own file, because it has its own guard
  logic/           the transitions — the heart
    ledger.ts      post, balances, release, refund, split, reconcile
    chat.ts        visibleTo() is the authorisation
    sync.ts        the app's orders and kitchens, mirrored up
    settings.ts    what used to be constants in the mobile bundle
  auth/            app-auth (OTP), admin-auth (password + TOTP + service)
  realtime/hub.ts  publish() — the one seam for Redis later
  routes/app/v1    the Expo client's API
  routes/admin/v1  the panel's API
scripts/seed.ts    from the app's own chefs/menus/reviews JSON
tests/             57 assertions on a real replica set
```

`logic/ledger.ts` is a port of the app's own `src/lib/ledger.js`, whose header
says it plainly:

> When a backend arrives, these transitions are its specification.

---

## Integrating the admin panel

The panel currently calls Prisma directly. It becomes a client of this.

**Service-to-service.** The panel sends `x-service-token` and asserts who is
acting in `x-actor` (base64 JSON: `{ sub, email, name, role }`). The token is
the authentication; the actor is what it may then assert. Without the token
the actor header is ignored entirely — *"the caller says they are finance"* is
not authorisation, and there is a test for that.

**Migration order**, each step verifiable on its own:

1. Read-only pages (`/kitchens`, `/orders`, `/audit`) — a mistake shows
   immediately and costs nothing.
2. Non-money writes (`/kyc`, `/reviews`, `/settings`).
3. Money (`/ledger`, `/payouts`, `/disputes`), with the invariant tests green
   before and after.
4. Delete `prisma/` only when nothing imports it.

Keep the panel's `lib/domain.ts` — error codes, rails and the capability map
are shared vocabulary, not storage. It is duplicated in all three codebases
today; a small shared package would be better.

---

## Not built

Named so the gaps are known rather than discovered:

- **No SMS provider.** The OTP is logged and returned in the response.
  `requestOtp` throws rather than returning a code once `SMS_PROVIDER` is set,
  so it cannot reach production by accident. **This is the last thing between
  this and real use.**
- **`migrate-from-sqlite.ts` is not written.** The panel's existing `dev.db`
  does not carry over, so the panel starts from this service's own seed.
- **The chat desk in the panel is still on Prisma**, deliberately. Chat is
  served under `/api/app/v1/chat/*` — one surface for the phone and the desk,
  told apart by which credential the caller presents — while `lib/backend.ts`
  only ever reaches `/api/admin/v1`, because a panel that can call the app's
  routes is a panel that can present itself as a customer. Closing that needs
  either an admin-prefixed chat surface or a deliberate exception, and that is
  a decision about the trust boundary rather than a migration step.
- **Operator accounts still live in the panel's own database.** There is no
  admin-user endpoint here. Defensible as an interim; worth deciding.
- **The socket registry is in-process.** Correct for one instance; `publish()`
  is the single seam where Redis goes.
- **TOTP is implemented, not enforced.** No enrolment endpoint, so
  `totpEnabled` is false for every seeded operator.
- **No per-dish endpoint for a cook's own menu**, so the app keeps its menu
  on the device. Everything else it owns now round-trips.
