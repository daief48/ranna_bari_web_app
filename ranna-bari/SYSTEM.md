# RannaBari — System Documentation

A Bangladeshi home-kitchen marketplace. Customers order from neighbours who cook;
cooks run a kitchen, a meal board and a shelf of packaged goods; operators watch
the money and settle disputes.

Every figure here was counted from the working tree — routes from the filesystem,
endpoints from the Fastify registrations, collections from the Mongoose models.
Figures drift as the code does.

**Last counted:** 2026-09-02

---

## Contents

> **Screen-by-screen detail lives in [UI.md](UI.md)** — what is on every
> mobile screen and admin page, what a person can do there, and what they see
> when there is nothing yet.

1. [The three codebases](#1-the-three-codebases)
2. [Mobile app — UI structure](#2-mobile-app--ui-structure)
3. [Admin panel — UI structure](#3-admin-panel--ui-structure)
4. [Backend](#4-backend)
5. [Authentication](#5-authentication)
6. [Domain concepts](#6-domain-concepts)
7. [Known debt and open bugs](#7-known-debt-and-open-bugs)
8. [Running it locally](#8-running-it-locally)
9. [Appendix — full API surface](#appendix--full-api-surface)

---

## 1. The three codebases

| Project | Stack | Port | Files | Lines |
|---|---|---:|---:|---:|
| `User and Cook App` | Expo SDK 57 · React Native · expo-router | 8081 | 120 | 44,911 |
| `admin Panel Next.js` | Next.js 16 · server components | 3100 | 101 | 21,533 |
| `backend-node` | Fastify 5 · Mongoose 8 · MongoDB Atlas | 4000 | 83 | 33,582 |

Totals: **~100,000 lines · 58 mobile screens · 40 admin pages · 145 API endpoints · 30 collections.**

```
                    ┌──────────────────────┐
   phone  ─────────▶│  backend-node :4000  │◀───────── admin panel :3100
   Bearer token     │  Fastify + Mongoose  │   httpOnly cookie, relayed
   APP_AUTH_SECRET  └──────────┬───────────┘   ADMIN_AUTH_SECRET
                               │
                    ┌──────────▼───────────┐
                    │  MongoDB Atlas       │
                    │  30 collections      │
                    └──────────────────────┘
```

The phone and the console never share an endpoint or a secret. Business rules live
in nine logic modules that both surfaces call, so a refund behaves identically
whether a customer triggered it or an operator did.

---

## 2. Mobile app — UI structure

### One binary, two products

The same app is a customer app **and** a cook's back office. Which one you see is
decided by `account.role` plus a view-mode toggle — a cook can flip between
ordering dinner and running their kitchen without signing out.

Each side has its own floating bar — five tabs for the customer, four for
the cook. Both were seven until the screens behind them were grouped: Map and
Shops became segments of Browse, and Menu / Meals / Shop and Earnings /
Kitchen became two cook hubs. Every one of those routes still exists and every
link to them still works; they simply are not bar residents.

### Customer tab bar — `app/(tabs)/`

```
┌──────────────────────────────────────────────────┐
│  Home    Browse    Meals    Cart    Profile      │
└──────────────────────────────────────────────────┘
   + a live order strip above it whenever something is in flight
```

| Tab | Route | What it is |
|---|---|---|
| Home | `(tabs)/index` | The feed — nearby kitchens, what's cooking |
| Browse | `(tabs)/browse` | Search and filter every dish, ranked by distance |
| Meals | `(tabs)/meals` | Tomorrow's meal board |
| Cart | `(tabs)/cart` | Both baskets — kitchen dishes and the shelf |
| Profile | `(tabs)/profile` | Account, orders, wallet, mode switch |

Off the bar but still routed: `(tabs)/stores` is the Shops segment of Browse,
and `(tabs)/map` is its map view.

### Customer screens — 32 total

**Discover** (7 tabs + 5 detail)

```
(tabs)/index   (tabs)/browse   (tabs)/meals   (tabs)/stores   (tabs)/map
chef/[id]      dish/[id]       meals/[id]     stores/[id]     product/[id]
```

Four ways in — a feed, a search, tomorrow's meal board, the shelf directory —
plus a live map where dishes, meals, kitchens and shops all resolve to pins.

**Buy** (8 screens)

```
(tabs)/cart    checkout        store-checkout  orders
order/[id]     meal-order/[id] store-order/[id] request-order/[id]
```

Three separate purchase paths that never share a basket:

- **Cooked to order** — `cart` → `checkout` → `order/[id]`
- **A plate off the meal board** — `meals/[id]` → `meal-order/[id]`
- **Packaged goods off a shelf** — `stores/[id]` → `store-checkout` → `store-order/[id]`

**Ask for something** (3 screens)

```
requests/index   requests/new   requests/[id]
```

Custom food requests — a reverse marketplace. A customer describes what they want,
cooks bid, the customer picks one.

**Account and money** (7 screens)

```
auth   edit-profile   addresses   wallet   notifications   saved-shops   become-cook
```

Phone-and-code sign-in, a saved address book, and a wallet that holds money in
escrow between confirming an order and receiving it.

**Talk to someone** (3 screens)

```
chat/index   chat/[id]   chat/verify
```

Live chat with a cook or with support, over a WebSocket.

### Cook panel tab bar — `app/cook/(panel)/`

```
┌──────────────────────────────────────────────────┐
│  Today   Orders   Listings   Business            │
└──────────────────────────────────────────────────┘
```

| Tab | Route | What it is |
|---|---|---|
| Today | `(panel)/index` | What is cooking, what is owed, what needs a decision now |
| Orders | `(panel)/orders` | Incoming orders and their state |
| Listings | `(panel)/listings` | Hub: menu, meals and the shelf |
| Business | `(panel)/business` | Hub: earnings, kitchen and its details |

Behind the hubs, still routed: `menu`, `meals`, `store`, `earnings`, `kitchen`.

### Cook panel screens — 24 total

**The menu** (3)

```
cook/dish/[id]   cook/kitchen-details   cook/order/[id]
```

**The meal board** (2)

```
cook/meal/new   cook/meal/[id]
```

Publish one dish for one service — tomorrow's lunch, capped at a plate count.
Customers confirm against that cap.

**The shop** (6)

```
cook/store/products    cook/store/product/[id]   cook/store/categories
cook/store/orders      cook/store/preorders      cook/store/settings
```

A shelf of packaged goods with stock counts, categories, delivery fees, and a
pre-order queue for things made only on request.

**Bidding** (2)

```
cook/requests/index   cook/requests/[id]
```

---

## 3. Admin panel — UI structure

Eighteen destinations in five groups, organised by **what an operator is doing**,
not by database table. Every list page has a matching detail page.

```
┌─────────────────────────────┐
│  RannaBari · operations     │
├─────────────────────────────┤
│  OVERVIEW                   │
│    Dashboard              / │
│                             │
│  SUPPLY                     │
│    Kitchens & cooks         │
│    KYC queue                │
│    Menus & dishes           │
│    Meals                    │
│    Stores & products        │
│    Coverage map             │
│    Pre-orders               │
│                             │
│  DEMAND                     │
│    Orders                   │
│    Customers                │
│    Live chat                │
│    Requests & offers        │
│    Reviews                  │
│    What people looked for   │
│                             │
│  MONEY                      │
│    Ledger & escrow          │
│    Payouts                  │
│    Top-up reconciliation    │
│    Refunds                  │
│    Disputes                 │
│                             │
│  PLATFORM                   │
│    Configuration            │
│    Notifications            │
│    Admin users              │
│    Audit log                │
└─────────────────────────────┘
```

### Overview

| Page | Route |
|---|---|
| Dashboard | `/` |

### Supply — 5 sections, 10 pages

Everything a cook offers. **KYC is a genuine gate** — a kitchen stays invisible to
customers until an operator has checked an identity document.

| Section | List | Detail |
|---|---|---|
| Kitchens & cooks | `/kitchens` | `/kitchens/[id]` |
| KYC queue | `/kyc` | — |
| Menus & dishes | `/menu` | `/menu/[id]` |
| Meals | `/meals` | `/meals/[id]` |
| Stores & products | `/stores` | `/stores/[id]` |

### Demand — 5 sections, 9 pages

| Section | List | Detail |
|---|---|---|
| Orders | `/orders` | `/orders/[id]` |
| Live chat | `/chat` | — |
| Requests & offers | `/requests` | `/requests/[id]` |
| Reviews | `/reviews` | `/reviews/[id]` |
| What people looked for | `/search-terms` | `/search-terms/[term]` |

**What people looked for** records searches that returned nothing — a demand signal
for where to recruit cooks next.

### Money — 4 sections, 7 pages

A **double-entry ledger**, not a balance column. Money is held from the moment an
order is confirmed and released only when the customer says the food arrived; a
dispute freezes that release.

| Section | List | Detail |
|---|---|---|
| Ledger & escrow | `/ledger` | `/ledger/[id]` |
| Payouts | `/payouts` | `/payouts/[id]` |
| Top-up reconciliation | `/topups` | `/topups/[id]` |
| Disputes | `/disputes` | `/disputes/[id]` |

### Platform — 4 sections, 6 pages

| Section | List | Detail |
|---|---|---|
| Configuration | `/settings` | — |
| Notifications | `/notifications` | `/notifications/[id]` |
| Admin users | `/admins` | `/admins/[id]` |
| Audit log | `/audit` | `/audit/[id]` |

Feature flags, delivery zones, notification templates, operator accounts, and an
append-only audit log of every action an operator took.

Plus `/login`, outside the dashboard shell.

---

## 4. Backend

**79 endpoints for the phone** (`/api/app/v1`), **61 for the console** (`/api/admin/v1`).

### Domains

| Domain | Endpoints | Logic module | Owns |
|---|---:|---|---|
| `/auth` `/account` | 8 | — | Phone OTP, sessions, the address book |
| `/kitchens` `/dishes` | 7 | `sync` | The directory and every cook's menu |
| `/meals` | 7 | `meals` | The meal board, plate caps, confirmations |
| `/stores` `/products` | 15 | `stores` | Shelves, stock, categories, pre-orders |
| `/orders` `/cart` | 11 | `ledger` | Baskets, checkout, order state machine |
| `/requests` `/offers` | 12 | `requests` | Custom requests and the bidding round |
| `/wallet` | 2 | `wallet` | Top-ups, balance, escrow holds |
| `/chat` | 5 | `chat` | Threads and messages, live over WebSocket |
| `/notifications` | 3 | — | Per-audience inbox for cook and customer |
| `/taxonomy` `/config` | 3 | `taxonomy` · `settings` | Categories, zones, feature flags |

### Logic modules — `src/logic/`

```
chat   ledger   meals   requests   settings   stores   sync   taxonomy   wallet
```

These hold the business rules. Both API surfaces call them, which is what keeps
operator actions and customer actions consistent.

### Collections — 30

```
Account          AdminUser        AppSession       AuditLog         Cart
ChatMessage      ChatThread       Dish             Dispute          FeatureFlag
Kitchen          LedgerEntry      Meal             MealInterest     Notification
Offer            Order            OtpChallenge     PayoutItem       PayoutRun
Product          Request          Review           SearchTerm       Setting
Store            StoreCategory    TaxonomyCategory TopUp            Zone
```

---

## 5. Authentication

Two realms, two secrets, no overlap.

### The phone — `APP_AUTH_SECRET`

- **Proof:** a six-digit code sent to a mobile number. No password anywhere in the app.
- **Carried:** Bearer token in the `Authorization` header.
- **Identity:** the phone number is the account key (`customerKey`); a `kitchenId`
  is attached only once a cook registers one.
- **Role:** `account.role` becomes `cook` server-side when a kitchen is registered —
  clients cannot set it. `viewerFor` uses it to decide which side of a chat thread
  a caller is on.

### The console — `ADMIN_AUTH_SECRET`

- **Proof:** operator credentials, with TOTP where enabled.
- **Carried:** an httpOnly cookie that page JavaScript can never read.
- **Chat:** the panel relays the WebSocket server-side, so the operator's token
  never reaches the browser.

### Service to service

`x-service-token` + `x-actor` (base64 JSON) for panel → backend calls.

---

## 6. Domain concepts

**Kitchen** — a cook's storefront. Has a delivery radius; only customers inside
that circle see it. Opens closed: the cook decides when to start taking orders.

**Dish** — cookable to order at any time, off a kitchen's menu.

**Meal** — one dish, one service, one date, capped at a plate count. Customers
*confirm* against the cap, which is what makes the meal board different from the
menu. Confirming moves money.

**Store** — a shelf of packaged goods belonging to a kitchen. Has stock counts,
categories, a delivery fee and a free-delivery threshold.

**Pre-order** — a shelf item made only on request; the cook accepts or rejects.

**Request** — a customer describes food they want; cooks post offers; the customer
selects one and pays. A reverse marketplace.

**Escrow** — money leaves the customer's wallet when an order is confirmed and is
*held*, not paid. It reaches the cook only when the customer confirms receipt. A
dispute freezes the release.

**Ledger** — append-only double-entry. Corrections are new entries in the opposite
direction, never updates, which is what keeps the history auditable.

---

## 7. Known debt and open bugs

### Migration debt

- **24 admin pages still read Prisma/SQLite** — most of the console. An
  earlier count said eight, because it grepped for the word "prisma"; these
  pages import `db` from `@/lib/db` instead and never write it. The full list:
  `admins`, `admins/[id]`, `audit`, `audit/[id]`, `disputes/[id]`, `kitchens`,
  `kitchens/[id]`, `kyc`, `ledger/[id]`, `meals`, `meals/[id]`,
  `notifications`, `notifications/[id]`, `orders`, `orders/[id]`, the
  dashboard, `payouts/[id]`, `requests/[id]`, `reviews`, `reviews/[id]`,
  `search-terms/[term]`, `stores`, `stores/[id]`, `topups/[id]`.

  Several read *both* — the backend for the rows and Prisma for a filter list
  or a count the endpoint does not carry yet, which is why some show "—" where
  a number belongs. Until they move, the console has two sources of truth.

  The pages added since — `customers`, `customers/[id]`, `preorders`,
  `refunds`, `coverage` — are backend-only, and are the shape the rest should
  end up in.
- **9 dead API routes inside the panel.** `app/api/app/v1/*` still hosts
  `auth/me`, `auth/request-otp`, `auth/verify-otp`, `chat/threads`, `config`,
  `kitchens`, `kitchens/mine`, `offers` and `orders` — nothing calls them; the
  phone talks to Fastify directly. The two `chat` routes under `admin/v1` *are*
  live, so check which is which before deleting.
- **`prisma/dev.db` is 1.8 MB** and still in the tree. It goes once the pages
  above do — not before, or twenty-four screens break at once.
- **Custom admin roles** exist as backend endpoints with no UI on `/admins`.
- **`prisma/` and the SQLite file** can go once the 8 pages move.

### Bugs, since fixed

All five are closed. Kept here because each is the kind that comes back:

| Bug | What it was |
|---|---|
| Every meal order confirm failed | the app sent `address` as a string where the route wanted an object — now `addressFromAccount()`, used by both checkouts |
| The error message misled | `badBody` called every invalid field an `amount-invalid`, so a bad address read "That amount is not valid" on a request with no amount. It names the failing field now |
| The order screen crashed | `order.items.map` on an order with no items |
| Wallet top-up by typing failed | the field holds a string, the route takes `z.number()` with no coercion |
| Wallet orders claimed a phantom escrow | `recordOrder` wrote `payment: 'held'` for any non-cash kind and never posted a ledger entry — the shape existed, the money did not |

The canonical address shape, from `app/checkout.js`:

```js
address: {
  label,
  line: line.trim(),
  area: area.trim(),
  lat: account?.lat ?? null,
  lng: account?.lng ?? null,
  instructions: instructions.trim(),
}
```

---

## 8. Running it locally

```bash
# backend — needs the current public IP on the Atlas access list
cd backend-node        && npm run dev     # :4000

# admin console
cd "admin Panel Next.js" && npm run dev   # :3100

# the app
cd "User and Cook App"  && npm start      # :8081
```

**Atlas access list.** `MongooseServerSelectionError: ReplicaSetNoPrimary` with
`commonWireVersion: 0` means the current public IP is not on the list — DNS
resolves and TCP connects, but the handshake never completes. Add the IP under
Network Access, or check whether a free-tier cluster has auto-paused.

**The app's backend URL** is `EXPO_PUBLIC_API_URL`, set per profile in
`eas.json`. For a device build it must be the machine's LAN IP, not `localhost`.

### Build notes

- `.easignore` **must live at the git repository root**, not beside `app.json`.
  EAS archives from the git root; a copy in the project folder is never read.
  Verified: 594 MB → 13 MB after moving it. Check with
  `npx eas-cli build:inspect --platform android --stage archive --output <dir>`.
- APK size options live in the `expo-build-properties` plugin in `app.json`:
  `buildArchs` (arm64-v8a + armeabi-v7a — the x86 pair is emulator-only),
  `enableMinifyInReleaseBuilds`, `enableShrinkResourcesInReleaseBuilds`.
  These took the APK from 110.9 MB to 53.7 MB.

### Data policy

The app takes **no data from JSON files or local fixtures** — everything comes
live from MongoDB. There is deliberately **no offline cache**: with the backend
unreachable the screens are empty, and that is correct. Do not reintroduce a
"paint last known good" cache or seeded form values.

---

## Appendix — full API surface

### `/api/app/v1` — 79 endpoints

**Auth and account**

```
POST   /auth/request-otp            POST   /auth/verify-otp
GET    /auth/me                     GET    /account
POST   /account                     POST   /account/addresses
POST   /account/addresses/:id/select
POST   /account/addresses/:id/remove
```

**Kitchens and dishes**

```
GET    /kitchens                    GET    /kitchens/mine
POST   /kitchens/mine               POST   /kitchens/mine/dishes
POST   /dishes/:id/toggle           POST   /dishes/:id/remove
GET    /taxonomy
```

**Meals**

```
GET    /meals                       GET    /meals/:id
POST   /meals                       POST   /meals/:id/confirm
POST   /meals/:id/interest          POST   /meals/:id/close
POST   /meals/:id/cancel
```

**Stores and products**

```
GET    /stores                      GET    /stores/:id
GET    /stores/saved                POST   /stores/:id/save
POST   /stores/mine                 POST   /stores/mine/open
POST   /stores/mine/categories      POST   /stores/mine/products
PATCH  /categories/:id              POST   /categories/:id/move
POST   /categories/:id/remove
GET    /products                    GET    /products/:id
POST   /products/:id/toggle         POST   /products/:id/stock
POST   /products/:id/remove         POST   /products/:id/preorder-toggle
GET    /preorders                   POST   /preorders/:id/accept
POST   /preorders/:id/reject
```

**Cart and orders**

```
GET    /cart                        POST   /cart
PATCH  /cart                        POST   /cart/remove
POST   /cart/clear                  POST   /store-checkout
GET    /orders                      GET    /orders/:id
POST   /orders                      POST   /orders/:id/advance
POST   /orders/:id/received         POST   /orders/:id/cancel
```

**Requests and offers**

```
GET    /requests                    GET    /requests/:id
POST   /requests                    POST   /requests/:id/offers
POST   /requests/:id/select         POST   /requests/:id/pay
POST   /requests/:id/cancel         POST   /requests/:id/decline
GET    /offers                      POST   /offers/:id/accept
POST   /offers/:id/counter          POST   /offers/:id/reject
POST   /offers/:id/withdraw
```

**Wallet, chat, notifications, misc**

```
GET    /wallet                      POST   /wallet/topup
GET    /chat/threads                POST   /chat/threads
GET    /chat/messages               POST   /chat/messages
POST   /chat/read
GET    /notifications               POST   /notifications/read
POST   /notifications/clear
GET    /config                      POST   /search-terms
```

### `/api/admin/v1` — 61 endpoints

Operator-side equivalents plus KYC review, payout runs, dispute resolution,
ledger adjustments, feature flags and the audit log.
