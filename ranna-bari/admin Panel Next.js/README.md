# RannaBari Admin

The operator console for the RannaBari home-cook marketplace — the platform
side of the Expo app in `../User and Cook App`.

Next.js 16 (App Router) · TypeScript · Prisma · Tailwind v4

---

## Run it

```bash
npm install
npm run setup      # creates the SQLite database and seeds it
npm run dev        # http://localhost:3100
```

Sign in with any of the four seeded operators, all with the password
`rannabari`:

| Email | Role | Sees |
|---|---|---|
| `admin@rannabari.app` | superadmin | everything |
| `ops@rannabari.app` | operations | kitchens, KYC, orders, meals, config |
| `finance@rannabari.app` | finance | ledger, payouts, disputes, top-ups |
| `support@rannabari.app` | support | orders and cases, read-mostly |

Signing in as each of them is the fastest way to see that authorisation is
real: the navigation, the buttons and the server actions all narrow together.

```bash
npm run test:money   # 20 assertions against the money invariants
npm run db:studio    # browse the database
npm run build        # production build
```

---

## What it is for

The app has no backend. It persists everything to AsyncStorage on the device,
and there is no admin surface anywhere in it. That leaves twelve specific
holes, and every module here closes one. Each screen says which, in a note at
the top, so the panel explains itself to whoever inherits it.

| Gap in the app | Where it is closed |
|---|---|
| `isVerified` is written `false` and **nothing ever flips it**; NIDs are collected and never read | `/kyc` |
| No `platform` ledger account — escrow released **100% to the cook** | `/settings`, and the split in `lib/logic/ledger.ts` |
| `DELIVERY_FEE = 40` / `PLATFORM_FEE = 10` hardcoded in `CartContext.js` | `/settings` |
| `KNOWN_AREAS` is a hardcoded 37-name array | `/settings` → zones |
| `taxonomy.addCategory` — *"used by nothing in the UI yet, and by a future admin screen"* | `/settings` → categories |
| Cancellation blocked after `delivering`; disputes explicitly out of scope | `/disputes` |
| Money sits in `held` forever if a customer never confirms receipt | `/ledger?view=aged` |
| `pendingEarnings()` exists; no payout flow at all | `/payouts` |
| `topUp(amount, 'bKash')` credits a wallet with nothing behind it | `/topups` |
| Reviews are a static JSON file, unmoderated | `/reviews` |
| Nobody can see the request/bidding market | `/requests` |
| Notifications are client-generated only | `/notifications` |

Plus what the app never had at all: a dashboard, an audit log, and roles.

---

## The rules this code holds

These are not style preferences. Each one is load-bearing, and
`npm run test:money` asserts the money ones against the real database.

1. **The ledger is append-only.** A correction is a new entry in the opposite
   direction. Enforced by a SQLite trigger, not by convention — raw SQL that
   bypasses Prisma entirely is still refused:

   ```
   Code: 1811 — ledger-append-only: post a reversing entry instead of updating one
   ```

   The audit log carries the same guard.

2. **Balances are folded, never stored.** `balances()` sums the ledger on
   read. A stored total is a second source of truth, and when the two disagree
   the money is already wrong. `/ledger?view=reconcile` folds each account and
   checks it against what its entries imply; the dashboard shouts if the drift
   is non-zero.

3. **Money moves on `completed`, not `delivered`.** `delivered` is the
   courier's word and `completed` is the customer's, and the gap between them
   is the whole design. Nothing here collapses them.

4. **Every state-changing action is audited**, with a before and an after, in
   the same transaction as the change.

5. **A cook never sees another cook's price.** `/api/app/v1/offers` filters on
   `kitchenId` in the query itself — there is no path through that handler
   that returns a competitor's row.

6. **Authorisation is checked three times, and only one of them counts.** The
   sidebar hides links a role cannot use, `requirePage()` refuses to render
   the page, and the server action checks again before it writes. The first is
   cosmetic and the second is a courtesy; the third is the control. Signing in
   as `support@` and typing `/payouts` gets you the dashboard, not the cook
   balances.

7. **No destructive delete.** Kitchens are suspended, categories retired,
   reviews hidden. A negotiation history is evidence.

8. **Idempotency on every money endpoint.** Each settlement carries a key
   (`release:<orderId>`, `payout:<runId>:<kitchenId>`); a double-clicked
   button pays once.

9. **Field names are the app's.** `chefId`, `customerKey`, `handover`,
   `serveDate` — the Expo client will read this back.

---

## Layout

```
app/(dash)/         one directory per module, each with its own client controls
app/api/app/v1/     endpoints the Expo client can migrate onto
actions/            server actions — every write goes through one
lib/logic/ledger.ts the money. Ported from the app's src/lib/ledger.js
lib/domain.ts       error codes, status rails, roles — the shared vocabulary
lib/mappers.ts      the only place that knows JSON is stored as text
lib/guard.ts        requirePage() — page-level capability check
prisma/seed.ts      seeds from the app's own chefs/menus/reviews JSON
scripts/test-money  20 assertions against the invariants above
```

`lib/logic/ledger.ts` is a port of the app's own `src/lib/ledger.js`, whose
header says the quiet part out loud:

> When a backend arrives, these transitions are its specification.

This is that backend. The remaining three modules — `mealLogic`, `storeLogic`,
`requestLogic` — are read-only here so far; porting them the same way is what
lets the app drop AsyncStorage entirely.

---

## The database

SQLite via Prisma, so it runs with no server to install. SQLite has no array
or JSON column, so those fields are `String` holding JSON and `lib/mappers.ts`
is the only module that knows it.

**Moving to Postgres** is three changes:

1. `provider = "postgresql"` in `prisma/schema.prisma`, and a `DATABASE_URL`.
2. Turn the JSON-string columns into `Json` / `String[]`. The mappers then
   collapse to identity functions; nothing above them changes.
3. Replace the triggers in `lib/db.ts` with the Postgres equivalents in
   `prisma/append-only.sql`, plus
   `REVOKE UPDATE, DELETE ON "LedgerEntry"`.

The seed is deterministic — a fixed PRNG — so re-seeding gives the same
database, and a bug can be told apart from a different random draw.

---

## The seed

20 kitchens, 80 dishes and 18 reviews come straight out of the app's own
`chefs.json`, `menus.json` and `reviews.json` — same records, same
coordinates. On top of that it fabricates the half no single device can
produce: 12 customers, ~250 orders across all four systems, the ledger those
orders imply, and live requests with competing offers and real negotiation
histories.

It also seeds things that are *wrong* on purpose, because an operator console
with nothing broken in it teaches you nothing:

- three cooks waiting on KYC
- escrow aged past the release window
- pre-orders nobody has answered
- products listed at zero stock for a fortnight
- top-ups with no payment reference
- a broadcast that reached no kitchen at all
- two reviews that need a moderator
- an open dispute mid-investigation

---

## Notes

- **Currency** is BDT in whole taka. The app never shows paisa, so neither
  does anything here.
- **Dates** are stored UTC and rendered in `Asia/Dhaka`. `serveDate` is a
  *local calendar day*, not a timestamp — read in UTC it moves tomorrow's
  lunch to today for six hours a day.
- **Bengali** never takes letter-spacing; tracking detaches the matra. The
  `.bn` class enforces that, and the broadcast composer previews Bengali
  numerals because those change even when the words do not.
- **Theme** follows the app's palette — 朱色 vermilion over washi, 松葉色 sage,
  山吹色 saffron — at desk density. Colour means one thing throughout:
  vermilion destructive, sage settled, saffron needs a human, ink3 inert.
- **`proxy.ts`** is what Next 16 renamed `middleware.ts` to. It verifies the
  session signature only; authorisation lives next to the data.

---

## Not built

Named so the gaps are known rather than discovered:

- **The app still reads AsyncStorage.** The `/api/app/v1` endpoints exist and
  match the app's shapes, but nothing in the Expo client calls them yet.
- **TOTP is implemented, not enforced.** `lib/auth.ts` verifies codes and
  `newTotpSecret()` generates them; there is no enrolment screen, so
  `totpEnabled` is false for every seeded operator.
- **No real payment provider.** `/topups` reconciles against a reference typed
  in by a human. A bKash webhook would replace that.
- **The dashboard map** in the original brief is a set of counters, not a map.
- **Write endpoints for the app** — only reads are exposed so far.
