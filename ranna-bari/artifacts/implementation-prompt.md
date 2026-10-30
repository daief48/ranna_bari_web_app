# Task: 7 changes to RannaBari (cook withdrawals, reviews, shop map, wallet-only, cook hub, order order, cook search)

You are working in the RannaBari monorepo (`d:\Jubair Islam Daief\Ranna Bari\ranna-bari`). Read `AGENTS.md`
first. Folder names contain spaces, so quote every path. Git Bash on Windows.

The owner asked for seven changes. Everything below was verified against the code on 2026-10-31; line numbers
are approximate and will drift, so re-find the code by name before editing. Where the code already does most of
the work, this prompt says so, so that you extend it and do not rebuild it.

## Rules that apply to every item (from AGENTS.md; do not break them)

1. **Server is the source of truth.** Writes go through the API and the app adopts the response. No client-made ids.
2. **Money never mutates.** `LedgerEntry` is append-only (the schema throws `AppendOnlyError`). A reversal is a new
   entry. Whole taka only, never floats. Every posting needs an `idemKey`.
3. **Field names are the wire format.** Mongoose schemas are the app's contract; a rename breaks the app silently.
   Add fields, do not rename them.
4. **Every user-facing string goes through `t('English text')`** and gets a Bengali entry in
   `User and Cook App/src/i18n/bn.js`. Numbers go through `n()`. Errors are server `code`s in
   `backend-node/src/lib/domain.ts` (`ERR`), mirrored by the app's `errorText()`.
5. **Match the surrounding code.** Plain `.js` in the app (no TypeScript), hand-rolled components, long "why"
   comments in English. Backend is TypeScript, validated with zod, errors via `fail(reply, ERR.X, status)`.
6. **Admin capabilities are real.** New admin screens/actions need a capability (`lib/domain.ts` in the admin
   panel, e.g. `payout.write`, `ledger.read`) checked in the page and the action, and in the backend route.
7. **Never run anything against Atlas.** `backend-node/.env` points `MONGODB_URI` at the production cluster, and
   scripts such as `seed-lily.ts` call `connect()` with no argument, which reads that `.env`. To test, run
   `npm run dev:local` in `backend-node` (in-memory replica set, seeds itself, serves on `PORT`) and point the
   app at it with `EXPO_PUBLIC_API_URL=http://localhost:<port>`. Pick a free port, because `localhost:4000` may
   be the Atlas-backed dev server. If you must run a script, override `MONGODB_URI` on the command line.
8. **Run `git status` before you start.** There may be uncommitted work from someone else in the app, backend
   and admin panel (it was ~40 files). Do not revert or reformat it. Touch only what each item needs.
9. Do not commit unless asked. Finish with a summary of what changed per item, what you tested, and what you
   could not test.

Work in this order: **6, 7, 5, 3, 2, 1, 4** (cheap and isolated first; money and payments last). Item 4 has a
blocking decision for the owner (see there). Ask the owner before starting it.

---

## Item 1 — Cook can withdraw money

**Current state**
- A cook's balance is the ledger bucket `cook`, per kitchen: `cookBalances()` in
  `backend-node/src/logic/ledger.ts` sums `to: 'cook'` minus `from: 'cook'` per `toRef/fromRef` (kitchen id).
- Money leaves only through **operator-run payout runs**: admin `POST /payouts` drafts a `PayoutRun` + frozen
  `PayoutItem`s from `cookBalances()` (minimum `settings.payoutMinimum`, default 100), then `POST /payouts/:id/pay`
  posts a `payout` ledger entry `cook -> external` with `idemKey: payout:<run>:<kitchen>`
  (`backend-node/src/routes/admin/v1/money.ts`). Only one draft may exist at a time.
- The cook can only **view** paid runs (`GET /kitchens/mine/payouts`, `routes/app/v1/index.ts`) and set a
  destination: `Kitchen.payoutMethod` (`''|'bkash'|'bank'`) and `payoutAccount`, edited inline in
  `User and Cook App/app/cook/(panel)/profile.js`. The earnings screen (`app/cook/(panel)/earnings.js`) shows
  "Released to you" and recent payouts via `useCookPayouts()` (`src/data/cook.js`).
- There is no way for a cook to ask for money.

**Build**
1. Model `Withdrawal` in `src/models/index.ts`: `kitchenId`, `amount` (whole taka), `method`, `account`
   (copied from the kitchen at request time, so a later edit cannot redirect an approved payout), `status`
   (`requested | paid | rejected | cancelled`), `code` (`WD-XXXXXX`), `requestedAt`, `decidedAt`, `decidedBy`,
   `note`, `ledgerEntryId`. Index `{kitchenId, status}`.
2. App routes in `routes/app/v1/` (cook-only via `cookOf`, kitchen from the token, never the body):
   - `GET /kitchens/mine/withdrawals` — the list plus `available`.
   - `POST /kitchens/mine/withdrawals` `{ amount }` — validate in one transaction: payout destination is set,
     `amount >= settings.payoutMinimum`, `amount <= available`, and the kitchen has no other `requested` row
     (or cap it; say which). `available = cook balance - sum(open requested withdrawals)`, so two requests
     cannot both claim the same taka.
   - `POST /kitchens/mine/withdrawals/:id/cancel` while still `requested`.
3. **Reserve, do not move.** Money stays in the `cook` bucket until an operator pays. Make the existing admin
   draft/pay logic subtract open withdrawals, so a batch run cannot also pay the same money (the double-payment
   case the existing comments warn about). Simplest: `cookBalances()` gets an optional `excludeReserved` flag
   that the admin payout draft and pay check use.
4. Admin: a **Withdrawals** page/tab under Payouts (capability `payout.write` to act, `ledger.read` to view)
   listing requests with kitchen, amount, method, account, and **Mark paid** / **Reject (with note)**.
   "Mark paid" posts the same `payout` entry (`cook -> external`, `idemKey: withdrawal:<id>`) inside a
   transaction that re-checks the balance, then sets `paid`. Audit-log every decision (`audit(...)`) and
   `notify` the cook ("You have been paid" / "Withdrawal declined").
5. App UI: on the cook **Earnings** screen add a clear **Withdraw** card: available amount, a whole-taka amount
   field with a "Withdraw all" shortcut, the payout destination shown read-only with an "Edit" link to the
   profile editor, a minimum/available error, and a list of requests with status chips. If no destination is
   set, the button opens the profile payout editor instead. Show pending requests and subtract them from the
   shown available figure.
6. Add ERR codes (e.g. `withdrawal-too-low`, `withdrawal-over-balance`, `no-payout-destination`,
   `withdrawal-open`) to `domain.ts` and `errorText()`, plus Bengali strings.

**Acceptance**: a cook with ৳4,500 released requests ৳2,000 and sees available ৳2,500; an operator pays it and the
ledger shows exactly one `payout` entry; double-clicking "Mark paid" posts once; a batch payout run drafted while
a request is open does not include the reserved amount; a cook cannot request more than available or below the
minimum; an unverified (KYC pending) kitchen is handled consistently with how payouts treat it today.

---

## Item 2 — Single product/dish page with the cook's reviews (so customers see reviews before ordering)

**Current state**
- A shop product page **already exists**: `User and Cook App/app/product/[id].js`, linked from `(tabs)/browse.js`,
  `stores/[id].js` and `(tabs)/cart.js`; backend `GET /products/:id` (`routes/app/v1/stores.ts`) returns
  `{product, store, mine}`. A dish page exists too: `app/dish/[id].js` (food).
- **The dish page crashes** with "Rendered more hooks than during the previous render". Cause: it returns early
  (`if (!found) { return ... }`, around line 39) before `useState`/`useRef` (around lines 63-64), so hook order
  changes once the dish loads. Move those hooks above the early return. Verify no other screen has the same
  early-return-before-hook pattern (grep `if (!` followed by `return` before any `use...`).
- **No customer-facing reviews exist.** `Review` (`models/index.ts`) has `kitchenId, orderId, name, avatar, area,
  rating, text, hidden, date` and is per kitchen (written by `POST /orders/:id/review`). The customer app shows only
  the aggregate `rating (reviewCount)`. Public reviews endpoints: only `/reviews/recent`; the cook-only list is
  `/kitchens/mine/reviews`.

**Build**
1. Backend: public `GET /api/app/v1/kitchens/:id/reviews?take=&before=` returning non-hidden reviews, newest first,
   cursor-paged, plus a `summary` `{ rating, reviewCount, histogram: {1..5} }` computed from the same non-hidden
   set the kitchen rating uses. Do not leak `customerKey` or `orderId`.
2. App: a shared `KitchenReviews` component in `src/components/` (summary block with average and star bars, the
   latest ~5 reviews with avatar/name/area/stars/text/date, "Show more" that loads the next page, an honest empty
   state "No reviews yet"). Heading: "What customers say about {cook}".
3. Use it at the bottom of the **dish page** and the **product page** (a product's cook is `store.kitchenId`), and
   on the **chef page** `app/chef/[id].js`, which currently shows only a score. Reviews are about the cook, which
   is what the owner wants ("so the user can see the cook's reviews before ordering"). Do **not** add per-product
   reviews or change the `Review` schema.
4. Make the product/dish card tap reliably open its single page everywhere a product or dish is listed (home,
   browse, map list, shop page, cart). Check each list's card has an `onPress` to `/product/:id` or `/dish/:id`.
5. i18n for all new strings.

**Acceptance**: opening any dish or product shows the page without a crash, the cook's reviews appear under it
(hidden ones never), pagination works, and a kitchen with no reviews shows the empty state.

---

## Item 3 — Pick the shop's area on a map when creating a shop

**Current state**
- The create flow is `StoreSetup` in `app/cook/(panel)/store.js` (about line 540), `STEPS = [storefront, Photos,
  Delivery]`. `area` is a plain text field; **no pin** is captured. The final call is `shop.saveStore(kitchen.id,
  { ..., area: area ? normaliseArea(area) : '', ... })`.
- The map component already exists: `src/components/LocationPicker.js` (`onChange({lat, lng, address})`, `center`,
  area search, jump chips from `KNOWN_AREAS` in `src/lib/areas`, "use my location", MapTiler reverse geocode;
  `MapCanvas.web.js` for web). Shop **settings** (`app/cook/store/settings.js`) already uses it and posts
  `lat`/`lng`, so the backend patch already accepts them. Only the creation flow lacks it.

**Build**
1. In the Delivery step (or a new "Location" step before it; update `STEPS` and `WizardSteps`), render
   `LocationPicker` centred on the kitchen's own pin as a *starting point only* (`kitchen.lat/lng`), with a
   short instruction ("Move the map to your shop").
2. On change, keep `{lat, lng}` in state and derive `area`: match the reverse-geocoded address against
   `KNOWN_AREAS` using the existing `normaliseArea`; if nothing matches, keep the cook's typed/selected area
   chip. Show the chosen area name under the map and let the cook correct it.
3. **Require a pin** before continuing from that step (an error via `FieldError`, like the existing step guards).
4. Send `lat` and `lng` with the same `saveStore` call. Confirm the backend persists them on create and that the
   shop then shows on the map screen and in distance filters.
5. Keep shop independence (shop is its own business; do not silently copy the kitchen's pin on save).
   Strings through `t()` + `bn.js`.

**Acceptance**: a new shop cannot be created without choosing a spot; the saved shop has `lat`, `lng`, `area`;
reopening shop settings shows the same pin; works on Expo web and on device (test web at minimum).

---

## Item 4 — Wallet is the only payment method

**Current state**
- Checkout offers cash on delivery and wallet (`app/checkout.js`: `PAYMENT_METHODS` from
  `src/store/OrdersContext`, default `useState('cod')` around line 101, cash UI and copy around 670-690, 818-842,
  913, 966; `(tabs)/cart.js` copy "Choose cash on delivery or your wallet at checkout").
- Backend: order creation in `backend-node/src/logic/sync.ts` defaults `kind` to `'cod'` (around line 276), gated by
  feature flag `system.cod` (`logic/settings.ts`, default `enabled: true`). COD has its own flow, commission
  (`commissionCod`) and admin metrics. **Orders already placed as COD exist in the database** and must still
  display and finish correctly (`order.kind === 'cod'` branches in `app/order/[id].js`,
  `app/cook/order/[id].js`, `logic/orders.ts`, `lib/domain.ts`).
- Shop, meal and request orders are already wallet-only.
- **Blocker:** the wallet cannot be funded in production. `POST /wallet/topup`
  (`routes/app/v1/wallet.ts`) has no payment gateway behind it, writes the `TopUp` as
  `reconciled: 'orphan'`, and returns 403 in production unless `ALLOW_DEV_FLOWS` is set. Wallet-only without a
  real top-up means nobody can pay.

**Ask the owner first** which top-up they want, and do not guess:
- (a) **Manual top-up (recommended to start):** the customer pays the platform's bKash/Nagad number, then submits
  amount + transaction id + sender number; an operator confirms it in the admin Top-ups screen; only then is the
  ledger `topup` posted (idempotent). Fits the existing `TopUp`/reconciliation model.
- (b) A real gateway API (bKash/Nagad/SSLCommerz): needs merchant credentials; scope and test accordingly.

**Build (after the owner decides)**
1. Implement the chosen top-up path so the wallet is fundable in production, without opening the "money from a
   request body" hole the current route guards against.
2. Remove cash from **new** orders: delete the COD option and its copy from checkout (wallet is the only,
   pre-selected method; keep the existing "wallet too low -> top up with the shortfall filled in" door); update the
   cart note; backend refuses new `kind: 'cod'` (default to `'wallet'`, return `ERR.FEATURE_OFF` or a new code),
   and set the `system.cod` flag default to `false` plus a one-off way to turn it off in existing databases.
3. **Keep all legacy COD read/finish paths.** Do not delete `commissionCod`, the COD flow, or the order-detail
   branches; cooks and customers still have historic COD orders. Hide or relabel the admin "Commission - cash on
   delivery" setting only if it is clearly legacy.
4. Out of scope: the mess/meal-management module's own "cash" deposit methods
   (`app/meal-management/...`); that is roommates settling up, not platform payment. Say so in your summary.

**Acceptance**: a new order of any kind can only be paid from the wallet; a customer with too little balance is
sent to top up; a legacy COD order still opens and completes; the wallet can actually be funded under the chosen
mechanism; ledger invariants (no drift) still hold - run `npm test` in `backend-node`.

---

## Item 5 — Kitchen row in Listings opens a full kitchen manager

**Current state**
- `app/cook/(panel)/listings.js`: the **Kitchen** `ActionRow` (icon `gem`) goes straight to
  `/cook/kitchen-details`, the 4-step edit wizard. **Menu** goes to `/cook/menu`. The **Shop** row opens a proper
  hub (`app/cook/(panel)/store.js`) whose rows are Add product, Products and stock, Categories, Pre-orders,
  Shop orders, Shop settings, View your shop.
- A hidden screen `app/cook/(panel)/kitchen.js` (`KitchenForm`) already has the photo gallery, a dish preview,
  "Preview your listing" (`/chef/:id`), "Switch to ordering", account details. It is not in the tab bar and the
  Kitchen row does not open it.
- The backend has `POST /kitchens/mine` (create/update), `POST /kitchens/mine/dishes`, dish toggle/remove. There is
  **no kitchen delete** endpoint. The orders board accepts `?tab=` (menu/shop/meals/requests) via
  `useLocalSearchParams`.

**Build**
1. Make the Kitchen row open a **Kitchen hub**, mirroring the Shop hub's structure and visual language (reuse
   `ActionRow`, `CookScreen`, `Reveal`; consider evolving `kitchen.js` into the hub rather than creating a new
   screen, and keep its photo gallery in a "Photos" section or move it behind a row):
   - **Add a dish** -> `/cook/dish/new`
   - **Menu and availability** -> `/cook/menu` (count live of total, as listings does now)
   - **Kitchen orders** -> `/cook/orders?tab=menu` with a pending count badge
   - **Kitchen details** (edit name, specialty, description, area/pin, radius, photos) -> `/cook/kitchen-details`
   - **Open/closed shutter** toggle
   - **Reviews** -> `/cook/reviews`
   - **View your kitchen** -> `/chef/:id`
2. **CRUD**: Create and Read/Update already exist (registration + edit wizard). For **Delete**, do not hard
   delete: a kitchen carries orders, reviews and an append-only ledger. Ask the owner; the safe default is a
   guarded "Close kitchen" (permanently hide from customers, only when there are no open orders and no money
   held), implemented as a flag, never as removal of rows. If the owner wants real deletion, scope it separately.
3. Keep the dashboard "Your businesses" kitchen card consistent: tapping it should open the same hub.
4. i18n for new strings.

**Acceptance**: from Listings, tapping Kitchen shows the hub; every row above navigates and returns cleanly; no
dead ends; the hub works for a kitchen with zero dishes and zero orders.

---

## Item 6 — Latest orders first on the cook orders board

**Current state**: `app/cook/(panel)/orders.js`, `bucketLanes()`. The working lanes **New, Cooking, Delivering**
are sorted **oldest first** on purpose (comment: "the longest wait is the one going cold"); History is newest
first. The same function is reused by the Requests tab's orders view, and the shop orders screen has its own list
(`app/cook/store/orders.js`).

**Build**
1. Flip the comparator so every lane, including the working lanes, is **newest first** (`stampOf(b) - stampOf(a)`),
   and update the two explanatory comments that now lie.
2. Check every other place an order list is built for a cook: shop orders (`cook/store/orders.js`), meal orders,
   the Requests-tab orders view, the dashboard "NextUp", and `OrdersContext`. They should agree. Verify the
   `/orders` response order and that polling/merging does not re-sort differently.
3. Because oldest-first existed to stop old orders going cold, keep that signal without the ordering: give a card
   that has waited long (e.g. over the existing late threshold, or 20+ minutes in `New`) a small "waiting N min"
   marker. Keep it subtle and optional if there is already a late indicator.

**Acceptance**: place three orders a minute apart; the newest is on top in each lane; a just-arrived order appears
at the top after a poll; history is unchanged.

---

## Item 7 — Search and pick one cook in "New request"

**Current state**: `app/requests/new.js`. "Who should see this" has two choices: every reachable cook, or **One
cook**. Choosing One cook auto-selects `reachable[0]` and shows a **horizontal strip of avatar chips** (84px wide,
no search). `reachable = chefs.filter(c => eligible.includes(String(c.id)))`, i.e. only kitchens that can deliver to
the customer's address. `?cook=<id>` preselects (arriving from a kitchen page). There is a reusable
`src/components/SearchBar.js`.

**Build**
1. Replace the chip strip (shown when `target !== 'all'`) with a **search input**: filters `reachable` as the user
   types by name (also specialty and area), case-insensitive, trimmed, and works for Bengali text. Show matches as a
   vertical list (avatar, name, area, rating, "open now"), tap to select.
2. The selected cook appears as a chip/card with a clear (x) action. Choosing **One cook** must no longer
   auto-pick `reachable[0]`; the user has to choose, and **Send** stays disabled with a short hint until they do
   (check the `submit` guard).
3. Empty states: no matches ("No kitchen with that name can reach you"; explain that only kitchens that deliver to
   the address on file are listed), and the no-address case consistent with how `eligible` is derived.
4. Keep the `?cook=` deep link working (preselect and show the selected card).
5. i18n for new strings. No backend change expected.

**Acceptance**: typing "lil" lists Lily Sweet Kitchen; selecting it shows it as chosen; clearing returns to the
search; submitting with no cook chosen is blocked; arriving from a kitchen page still preselects that kitchen.

---

## Definition of done
- `npm test` in `backend-node` passes (money invariants included); `npx tsc --noEmit` clean in `backend-node` and
  `admin Panel Next.js` where applicable.
- Each screen you changed was opened in the Expo web build (phone viewport, signed in as a seeded cook / customer
  against `dev:local`) and checked with real data, not just "no error page".
- No change touches Atlas, no ledger row is edited or deleted, no field is renamed.
- Final message lists, per item: files changed, behaviour added, what was verified, and open questions
  (the item-4 top-up choice and the item-5 delete scope).
