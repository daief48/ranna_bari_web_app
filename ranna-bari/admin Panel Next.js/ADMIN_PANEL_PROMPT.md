# RannaBari Admin Panel — Build Prompt (Next.js)

> Paste everything below into Claude Code / Cursor / v0 as a single brief.
> It is written against the real data model of the RannaBari Expo app
> (`../User and Cook App`), so every field name here already exists in the app.

---

## 0. Who you are and what you are building

You are building **RannaBari Admin** — the operator console for a Bangladeshi
home-cook food marketplace. The consumer product is an Expo/React Native app
with two faces: a **customer** app and a **cook panel**. There is currently
**no admin surface at all**, and no backend — the app persists everything to
AsyncStorage on the device. This admin panel is the first piece of the
platform side, and it is also the thing that forces a real server to exist.

Build it in **Next.js (App Router)**.

---

## 1. What the existing app already does

Six business systems run in the app today. The admin panel oversees all six.

### 1.1 Discovery / directory
Kitchens (`chefs`) with a name, avatar, cover, specialty, rating,
`reviewCount`, tags, `ecoBadge`, `isVerified`, `area`, `lat`/`lng`,
`deliveryRadiusKm`, `isOpen`. Each kitchen has a menu of dishes. Customers
browse, filter (area, price band, diet, rating, sort) and search. Distance
gating: a kitchen is only shown if `distanceKm(customer, kitchen) <= deliveryRadiusKm`.

### 1.2 Instant orders (COD)
Cart → checkout → one order **per kitchen** (a basket spanning two kitchens
splits into two orders; delivery + platform fee ride on the first only).
Status rail: `placed → accepted → cooking → on_the_way → delivered`.
Outside the rail: `cancelled` (customer, only while `placed`), `rejected`
(cook, with a reason). The cook keeps **85%** of `subtotal`
(`COOK_PAYOUT_RATE = 0.85`); never a cut of delivery or platform fees.
Fees are hardcoded: `DELIVERY_FEE = 40`, `PLATFORM_FEE = 10`.

### 1.3 Pre-booked meals
A cook publishes a meal for a **serve date + slot** (`breakfast` serve 8 /
cutoff 7, `lunch` 13/10, `dinner` 20/17), with `capacity`, a `deadline`,
`handover` (`delivery` | `pickup`), price, area and radius. Customers mark
*interest* first, then *confirm* — which **holds money in escrow**. Meal
status: `published | closed | cancelled`.

### 1.4 Cook stores (a shop per kitchen)
A kitchen can open a shop: store profile (logo, cover, phone, area, lat/lng,
`deliveryRadiusKm`, `deliveryFee`, `freeDeliveryOver`, `isOpen`), its own
**categories** (shelves), and **products** (`price`, `stock`, `minQty`,
`maxQty`, `active`, `preorder`, `prepTime`, `options`, images). Checkout
groups by store **and** by preorder-vs-instant. A pre-order enters at status
`pending` and the cook must accept or reject it.

### 1.5 Food requests + cook bidding
A customer describes something nobody listed ("2lb chocolate cake, Friday"),
targeted at **one cook** or **broadcast** to every eligible kitchen. Cooks
answer with a price. The customer picks one and may haggle. Rules that are
load-bearing:
- a cook **never** sees a competitor's price;
- **nothing is overwritten** — every price named is appended to the offer's
  history with who said it and when;
- **you cannot accept your own offer** — whose turn it is falls out of the
  history.

`REQUEST_STATUS`: `open | selected | agreed | ordered | cancelled | expired`
`OFFER_STATUS`: `interested | priced | selected | negotiating | agreed | not-selected | declined | rejected | withdrawn | expired`

### 1.6 Wallet, escrow and the ledger
One wallet, one escrow, one set of earnings, shared by all three paid systems.
Three accounts: **`customer`**, **`held`** (platform escrow), **`cook`**.
Balances are **folded from an append-only ledger**, never stored. Entry kinds:
`topup | hold | release | refund`.

The escrow order flow (meals, stores, requests all use it):

```
confirmed → preparing → ready → delivering → delivered → completed
```
- `pickup` drops `delivering` and relabels `delivered` → "Collected".
- a pre-order gains a `pending` step in front.
- the cook drives every step **up to `delivered`**.
- **`completed` belongs to the customer** — money moves from `held` to `cook`
  only when the customer confirms receipt. This gap is the entire design.
- Cancellation is allowed until `delivering`; after that it is a dispute, and
  **the app explicitly does not settle disputes**.

### 1.7 Cross-cutting
- **Notifications**: `audience: 'customer' | 'cook'`, deduped by `key` while
  unread, capped at 100. ~28 `kind`s exist (`order-confirmed`, `offer-selected`,
  `price-agreed`, `payment-released`, `confirm-receipt`, …).
- **i18n**: English + Bengali, including Bengali numerals and Bengali-aware
  typography (no letter-spacing, Noto Sans Bengali faces).
- **Theme**: light + dark, a Japanese-inspired vermilion palette.

---

## 2. The exact data model to build against

One document per collection. Field names are copied from the app — **do not
rename them**, the mobile client will have to read this back.

```ts
// ---- identity -----------------------------------------------------------
Account {
  role: 'user' | 'cook'
  name, phone, email
  kitchen?: string            // cook only: kitchen name
  specialty?: string          // one of SPECIALTIES
  nid?: string                // National ID — KYC, never shown to customers
  area, lat, lng
  addressDetail, addressLabel
  deliveryRadiusKm: number | null
  avatar?, signedInAt, updatedAt
}

Kitchen {                     // shaped like a row of chefs.json + dishes
  id, name, ownerName, avatar, coverImage
  specialty, description
  rating, reviewCount         // 0/0 until the first review → card reads "New"
  tags: string[]              // derived from dishes
  ecoBadge, isVerified        // ← false at creation, NOTHING ever flips it
  area, lat, lng, deliveryRadiusKm
  isOpen                      // ← false at creation; the cook opens it
  dishes: Dish[], nextDishSeq, createdAt
}

Dish { id, name, description, price, image, tags: string[], available }

// ---- commerce document --------------------------------------------------
Meal {
  id, code, kitchenId, cookName
  title, description, image, price, capacity
  serveDate: 'YYYY-MM-DD', slot: 'breakfast'|'lunch'|'dinner', deadline: ISO
  handover: 'delivery'|'pickup', handoverNote
  area, lat, lng, deliveryRadiusKm
  status: 'published'|'closed'|'cancelled'
  interested: customerKey[], createdAt
}

Store {
  id, kitchenId, name, tagline, description, logo, cover, phone
  area, lat, lng, deliveryRadiusKm
  deliveryFee, freeDeliveryOver, isOpen, createdAt, updatedAt
}

Category { id, storeId, name, emoji, order }     // one cook's shelves

Product {
  id, storeId, categoryId, name, description, images: string[]
  price, stock, minQty, maxQty
  active, preorder, prepTime, deliveryNote
  options: {label, price}[] | null
  createdAt, updatedAt
}

TaxonomyCategory { id, key, label, emoji, order }  // PLATFORM-WIDE vocabulary

Request {
  id, code, customerKey, title, description, quantity, budget
  target: 'all' | kitchenId
  eligible: kitchenId[]
  wantedFor, category, area, lat, lng
  status: REQUEST_STATUS, selectedOfferId, orderId, createdAt
}

Offer {
  id, requestId, kitchenId, cookName
  status: OFFER_STATUS
  price, agreedPrice, note, prepTime
  history: [{ by: 'cook'|'customer', amount, at }]   // append-only
  createdAt
}

Order {                        // one shape, three kinds
  id, code
  kind: 'meal' | 'store' | 'request'
  mealId? | storeId? | requestId? + offerId?
  kitchenId, cookName, title, image
  customerKey, customerName, phone, address
  handover, serveDate?, slot?
  lines?: [...]                // store orders
  subtotal?, deliveryFee?, price, amount
  preorder?: boolean
  status: 'pending'|'confirmed'|'preparing'|'ready'|'delivering'|'delivered'|'completed'|'cancelled'|'rejected'
  payment: 'held' | 'released' | 'refunded'
  history: [{ status, at }]
  createdAt
}

LedgerEntry {
  id, kind: 'topup'|'hold'|'release'|'refund'
  amount, from: 'customer'|'held'|'cook', to: same
  mealId?, orderId?, note, at
}

Notification {
  id, key, audience: 'customer'|'cook'
  kind, title, body
  mealId?, orderId?, requestId?, offerId?
  at, read
}
```

`customerKey` = `(email || phone || 'guest').toLowerCase()` — the stable
identity string used everywhere.

---

## 3. The gaps the admin panel exists to close

These are **real holes in the current system**. Design the panel around them —
this is the actual product brief, not a feature wishlist.

| # | Gap in the app today | What admin must own |
|---|---|---|
| 1 | `isVerified` is set `false` on every new kitchen and **nothing ever flips it**. NIDs are collected and never reviewed. | A **KYC review queue**: see the NID, approve/reject, write the badge. |
| 2 | There is **no `platform` ledger account**. Escrow releases 100% to the cook — the platform earns nothing on meals, stores or requests. Only the legacy COD path takes 15%. | A **commission engine**: a `platform` account, a configurable rate per system, and a release that splits `held` → `cook` + `platform`. |
| 3 | `DELIVERY_FEE = 40` / `PLATFORM_FEE = 10` are constants in `CartContext.js`. | **Fee & pricing settings**, per zone if needed, served to the app. |
| 4 | `KNOWN_AREAS` is a hardcoded 37-item array. | **Zone management**: add/rename/disable areas, set per-zone fees and coverage. |
| 5 | `taxonomy.addCategory` carries the comment *"Used by nothing in the UI yet, and by a future admin screen."* | **Taxonomy editor** — that future admin screen. Add/rename/reorder/retire platform categories. |
| 6 | Cancellation is blocked after `delivering`; the code says disputes are out of scope. | **Dispute desk**: open a case on any order, force-refund, force-release, or split. Every action posts a ledger entry — never a mutation. |
| 7 | Money can sit in `held` forever if a customer never confirms receipt. A daily reminder nudges, nothing resolves. | **Escrow ageing board** + an **auto-release policy** (e.g. release N days after `delivered`) and a manual force-release. |
| 8 | `pendingEarnings()` exists; there is **no payout or withdrawal flow at all**. | **Payout runs**: batch cook balances, mark paid, hold a payout ledger, reconcile. |
| 9 | `topUp(amount, 'bKash')` credits the wallet with no payment behind it. | **Top-up reconciliation**: match wallet credits against a real PSP, flag orphans. |
| 10 | Reviews are a static JSON file. Nothing moderates them. | **Review moderation**: hide/restore, and recompute `rating`/`reviewCount`. |
| 11 | Nobody can see the request/bidding market. | **Marketplace monitor**: open requests, offer counts, fill rate, dead broadcasts. |
| 12 | Notifications are generated by the client only. | **Broadcast composer** — send to an audience/zone, respecting the dedupe key contract. |

---

## 4. Modules to build

Group the panel into these sections. Each is a route group under `app/`.

### A. Overview
GMV, order count and take-rate by day/week/month. Split by system (COD /
meals / store / request). Escrow balance right now: how much is `held`, how
old, against how many orders. Live counters: orders in flight, pre-orders
waiting on a cook, open requests with zero offers, kitchens open now. A map
of active kitchens and demand.

### B. Kitchens & cooks
Searchable table: name, owner, area, `isVerified`, `isOpen`, dish count,
lifetime GMV, rating, cancellation rate. A kitchen detail page with tabs —
Profile, Dishes, Meals, Store, Orders, Earnings, Documents. Admin actions:
verify / unverify, suspend (force `isOpen: false` and hide from browse),
edit area & radius, force-close a stale meal.

### C. KYC queue
Pending cook applications, oldest first. Show name, phone, NID, pinned
location, submitted date. Approve → `isVerified: true`. Reject → reason,
notify the cook. Keep an immutable audit trail of who decided what and when.

### D. Orders
One table across all three kinds, filterable by kind, status, kitchen, zone,
date. Row expands into the full status history with timestamps, the customer
and address, the line items, and the ledger entries attached to that order.
Actions: force-advance, force-cancel with refund, open a dispute.

### E. Meals
Every published meal by serve date and slot. Capacity vs confirmed vs
interested. Meals past their deadline that are still `published` (the app has
no sweeper — this list is how they get closed). Cancel-with-reason, which must
refund every held order on that meal.

### F. Stores & products
Stores list with open/closed and product counts. A **stock alarm** view:
`active` products at `stock: 0`, and products that have been out of stock for
more than N days. Pre-orders waiting on a cook, aged. Per-store delivery fee
and free-delivery threshold.

### G. Requests & offers
Open requests with offer counts and time-to-first-offer. Broadcasts that
reached zero eligible kitchens — that is a coverage bug, surface it loudly.
Negotiations stalled on one side. **Never render a cook's price to another
cook** in any export or view that a cook could reach; on the admin side you
may show all of them, but keep the rule visible in the code.

### H. Wallet, ledger & payouts
The append-only ledger, filterable by kind/account/date, with running
balances. A reconciliation view: `sum(topup) - sum(hold) + sum(refund)` must
equal the customers' aggregate balance; show the delta and shout if non-zero.
Payout runs: select cooks, generate a batch, mark paid, post the ledger
entries. Never edit an entry — a correction is always a new entry in the
other direction.

### I. Disputes
A case per contested order. State machine: `open → investigating → resolved`.
Resolution posts real ledger movements. Attach notes and a decision reason.

### J. Content & configuration
Platform taxonomy editor (key / label / emoji / order). Zones. Fee settings
per system and per zone. Commission rates. Escrow auto-release window. Meal
slot times and cutoffs. Feature flags to kill a whole system if it misbehaves.

### K. Notifications & broadcast
Sent-notification log by audience and kind. Composer that targets an audience
+ zone + role, with a preview in both English and Bengali.

### L. Reviews
Moderation queue, hide/restore, per-kitchen rating recompute.

### M. Admin users & audit log
Roles: `superadmin` / `ops` / `finance` / `support`. **Every state-changing
action anywhere in the panel writes an audit row** — actor, action, target,
before, after, timestamp. Money actions are worthless without this.

---

## 5. Technical requirements

- **Next.js App Router**, TypeScript, Server Components for reads, Server
  Actions or Route Handlers for writes.
- **Postgres + Prisma** (or Drizzle). Model the schema from §2 verbatim; the
  ledger table is **append-only — no UPDATE, no DELETE, enforced by a DB rule**.
- **Auth**: separate from app accounts. Email + password + TOTP, role-gated
  by middleware. An admin session must never be able to act as a customer.
- **Every mutation is a transaction.** The app's own comment is the spec:
  *"a transition returns one new document or an error and the old one; there
  is no half-applied state to roll back from."* Preserve that on the server.
- **Validation lives server-side**, in the same shape as the app's pure
  transitions (`(state, args) => {ok, state, result} | {ok:false, error}`).
  Port `src/lib/ledger.js`, `mealLogic.js`, `storeLogic.js`, `requestLogic.js`
  to TypeScript server modules — they are, as the file header says, *"the
  specification"* for the backend.
- **Error codes, not sentences.** Reuse the `ERR` map so the mobile client and
  the admin panel speak the same language.
- **API for the app**: expose REST/tRPC endpoints so the Expo client can
  eventually replace AsyncStorage with this server. Keep the JSON shapes
  identical to §2.
- **Tables**: TanStack Table — server-side pagination, sort and filter. These
  lists get large.
- **Charts**: Recharts or visx. Currency is **BDT (৳)**, integers only, no
  decimals; the app never shows paisa.
- **Dates**: store ISO/UTC, render in **Asia/Dhaka**. `serveDate` and
  `dayKey()` are *local calendar days*, not UTC — do not let a timezone shift
  move "tomorrow's lunch" to today.
- **Bengali**: numerals and labels must be renderable. Load Noto Sans Bengali,
  and **never apply letter-spacing to Bengali text** — it breaks the matra.

---

## 6. Design direction

Match the app's identity, adapted to a desk. The app's palette:

```
primary (vermilion 朱色)  #C7381A   dark: #EF6A3D
sage    (松葉色)          #55703F   dark: #8FAE72
saffron (山吹色)          #B8850F   dark: #E8BE5A
ink                       #1F1D1A   dark: #ECEAE1
ink2 / ink3               #5B564E / #928B7F
canvas (washi)            #FAF7F0   dark: #101613
raised                    #FFFFFF   dark: #1A211C
sunken                    #F5F0E5   dark: #0B0F0D
line                      rgba(31,29,26,0.10)
```

Radii `8 / 14 / 22 / 30 / 38 / pill`. Display face **Fraunces**, UI face
**Inter**, Bengali **Noto Sans Bengali**. Warm ink-tinted shadows, never flat
black. Support light and dark.

But this is an **operator tool**, not the storefront: denser than the app,
tabular, keyboard-driven, no decorative motion. Use vermilion for destructive
and primary actions only, sage for healthy/settled states, saffron for
warnings and ageing escrow. Status colour must be consistent everywhere —
one legend for the whole panel.

---

## 7. Non-negotiables

1. **The ledger is append-only.** A correction is a new entry in the opposite
   direction. If you find yourself writing `UPDATE ledger`, stop.
2. **Balances are folded, never stored.** A stored total is a second source of
   truth and one of them will be wrong.
3. **Money moves on `completed`, not `delivered`.** Do not collapse the two.
4. **Every admin action is audited**, with before and after.
5. **A cook never sees another cook's price.** Enforce it as authorisation on
   the server, not as a UI decision.
6. **No destructive delete** on kitchens, orders, requests or offers. Soft
   state only — the negotiation history is evidence.
7. **Idempotency** on every money endpoint. A double-clicked "Release payout"
   must pay once.
8. **Field names stay as they are.** The Expo client will read this back.

---

## 8. Build order

1. Scaffold Next.js + Prisma + auth + roles + audit log.
2. Port the four `src/lib` logic modules to TypeScript server transitions.
3. Seed from the app's `chefs.json` / `menus.json` / `reviews.json`.
4. Kitchens table + detail, then the KYC queue. *(unblocks `isVerified`)*
5. Orders table + detail + status history + ledger view.
6. Wallet, ledger, reconciliation, escrow ageing.
7. Commission engine + payout runs.
8. Meals, stores, requests monitors.
9. Configuration: taxonomy, zones, fees, flags.
10. Overview dashboard last — it is assembled from everything above.
11. Disputes, reviews, broadcast.

Ship each module fully working before starting the next. Do not build twelve
half-modules.
