# RannaBari — System Analysis (AGENTS.md)

**Purpose:** the full-system map for any agent or developer working in this
monorepo. Read this first; it exists so nobody has to re-derive the architecture
from scratch every session.

**Last verified:** 2026-10-18. If something here contradicts the code, the code
wins — and this file should be updated.

---

## 1. What RannaBari is

A home-cooking marketplace in Bangladesh: home cooks open kitchens, customers
order cooked-to-order meals, pre-book monthly meal plans, and buy pantry goods
(shops). Plus a mess/meal-management system (shared meal rooms). Three clients
talk to one Fastify + MongoDB backend:

```
ranna-bari/
├── User and Cook App/     Expo (React Native) — customer AND cook app in one
├── backend-node/          Fastify 5 + Mongoose 8 — the only API
├── admin Panel Next.js/   Next.js 16 — operator console (client of backend-node)
├── Landing page Rannabari/ Next.js 16 — marketing landing page
├── SYSTEM.md, UI.md, correct_ui.md, meal_system.md, user_independent_feature.md
│                          — older specs/notes (trust code over these)
└── Smart_Meal_Management_System_Complete_Documentation_v1.0.docx
```

Folder names contain spaces — always quote paths in shell commands.

---

## 2. backend-node (the API — source of truth)

Fastify 5, Node ≥ 20, Mongoose 8 → **MongoDB Atlas** (URI in `.env`, zod-validated
in `src/config/env.ts`; missing vars fail at boot). Deployed as a serverless
function on Netlify (`netlify.toml`, `@fastify/aws-lambda`) at
`https://ranna-bari-backend.netlify.app`. `bodyLimit` is 24MB because images
travel as data URIs. Local dev: `npm run dev` (port 4000).

### Route mounting (`src/app.ts`)
- `/api/app/v1/*` — the mobile app (`src/routes/app/v1/index.ts`, ~1300 lines)
- `/api/app/v1/meal-management/*` — mess system module (`src/modules/meal-management/routes.ts`)
- `/api/admin/v1/*` — admin panel (`src/routes/admin/v1/{index,money,operations}.ts`)
- `/api/internal/*` — service-to-service
- `/ws` — WebSocket (chat + realtime fan-out, `src/server.ts` + `src/realtime/hub.ts`).
  **Needs a long-lived process — does not work on serverless.** On Netlify the
  socket is dead weight; chat still works over HTTP polling.

### Auth — two realms, never mix them
- **App** (`src/auth/app-auth.ts`): JWT (jose, `APP_AUTH_SECRET`), subject =
  account id, claims `{key, role, kid, v}`. Phone-OTP sign-in for customers
  (dev mode returns `devCode` unless `SMS_PROVIDER` set) + **email+password
  cook flow** (`/auth/cook/register` → email OTP `/verify-email` → NID
  documents → admin KYC): nodemailer + `SMTP_*` env; resend cooldown
  (`/auth/cook/resend-otp`, `EmailOtpChallenge`), forgot/reset password.
  Sessions: `AppSession` rows, revocable; `tokenVersion` bump kills all.
- **Admin** (`src/auth/admin-auth.ts`): separate secret + `AdminUser` with
  TOTP (otpauth) and capabilities.
- The panel calls the backend with `x-service-token` (`BACKEND_SERVICE_TOKEN`)
  + `x-actor` (base64 JSON of the operator). An admin token never opens an app
  endpoint and vice versa.
- `customerKey` = `(email || phone).toLowerCase()` — the account's unique key.
  Lookups use `$or: [{customerKey}, {email/phone}]` (a cook registered by email
  has their phone in another column).
- Phone canonical form: `+8801XXXXXXXXX` (`normalisePhone`); `phoneVerifiedAt`
  proves handset ownership.

### Models (`src/models/index.ts` — the only schema file)
- **Identity:** `Account` (role user/cook, passwordHash, emailVerifiedAt,
  addresses embedded, nid, savedStores), `AppSession`, `OtpChallenge` (phone),
  `EmailOtpChallenge`, `AdminUser`, `AuditLog`.
- **Kitchens:** `Kitchen` (unique `accountId`, `legacyId` for old bundle ids,
  `kycStatus: pending|approved|rejected` + note/decidedAt/decidedBy,
  coverImage/photos as **data URIs**), `KitchenDocument` (NID front/back, in
  `kitchen_documents`), `Dish`, `Review`, `Specialty` (reference, admin-edited).
- **Commerce:** `Store` (cook's pantry, 1:1 with kitchen), `StoreCategory`,
  `Product`, `Cart`, `Order` (all order kinds: cod/wallet/meal/store/request),
  `Offer`, `Request`, `Promotion` + `Redemption`, `Dispute`.
- **Meal plans (monthly):** `MealPlan`, `MealCategory`, `MealDish`,
  `MealService`, `MealBooking` — cook publishes a monthly calendar; customers
  pre-book plates. Spec: `meal_system.md`.
- **Meal management (mess):** separate subsystem under
  `src/modules/meal-management/` (service/: mess, meals, bazar, board, chat,
  money, reports, closing…). Members share a mess room; caller always comes
  from the token, mess verified via `contextFor` — isolation is that one gate.
  App screens: `app/meal-management/`, `MessScreen`, `DoorCard`, `Doorway`.
- **Money:** `LedgerEntry` — **append-only, enforced**: schema middleware throws
  `AppendOnlyError` on any update/delete (bypass only via raw
  `collection.deleteMany` in maintenance scripts). Kinds: topup/hold/release/
  refund/commission/payout/adjustment; buckets: customer/held/cook/platform/
  external with `{fromRef,toRef}` party ids; `idemKey` unique-sparse for
  idempotency. `TopUp`, `PayoutRun`, `PayoutItem`.
- **Platform/reference:** `Icon`, `TaxonomyCategory`, `StoreCategory`, `Zone`,
  `SearchTerm`, `Setting`, `FeatureFlag`, `Notification`, `ChatThread`,
  `ChatMessage`.
- Error vocabulary: `src/lib/domain.ts` `ERR` codes (`name-required`,
  `no-kitchen`, `meal-sold-out`, `wallet-low-balance`, …); handlers answer
  `{error: code, message, detail?}`. The app's `errorText()` maps the same codes.

### Key backend behaviours
- Kitchen registration: `POST /kitchens/mine` upserts on the caller's account;
  creation requires a name; `kycStatus` starts `pending` and **nothing in the
  body can change verification**. `kitchenMayTrade()` = `approved` only.
- Order creation is idempotent on the app's own `code` (RB-XXXXXX).
- Cook registration endpoints (see Auth) return `devCode` only when SMTP is
  unset — fails closed in production.
- KYC admin surface: `GET /api/admin/v1/kyc` (pending queue + recent decisions,
  joins account NID), decision `POST /api/admin/v1/kitchens/:id/kyc`.

### Scripts (`backend-node/scripts/`)
`seed.ts` (full deterministic demo DB — customers, orders, ledger; `npm run
seed`), `seed-catalog.ts` (catalogue only: kitchens/dishes/stores/products,
no accounts — safe to rerun), `delete-all-users.ts` (wipe user data, dry-run
default, `--yes` applies; keep-list = reference + admin), `delete-test-cooks.ts`,
`rm-test-orders.ts`, `check-sessions.ts` (runs before vitest), `seed-meal-demo.ts`,
`mint-cook-session.ts`. Tests: vitest + mongodb-memory-server (`npm test`).

---

## 3. User and Cook App (Expo)

Expo SDK 57, React Native 0.86, React 19, **expo-router** file routing,
TypeScript-free (plain `.js`), no UI library — hand-rolled components.
Run: `npx expo start`. `API_BASE` in `src/lib/server.js` defaults to the
Netlify URL; `EXPO_PUBLIC_API_URL` overrides. Realtime: WS to `/ws` for chat.

### Routing map (`app/`)
- `(tabs)/` — customer: index (home), browse, map, meals, stores, cart, profile
- `auth.js` — sign-in (phone OTP) + 3-step signup; `become-cook.js` (cook
  funnel step 1) → `auth?role=cook` → `cook-verify.js` (email OTP) →
  `cook-documents.js` (NID front/back upload) → admin KYC
- `cook/(panel)/` — cook tabs: **index = Dashboard (right-now tiles, NextUp,
  7-day trend, top dishes, quick actions), orders, listings (4 catalogues:
  Menu/Shop/Kitchen/Meal), profile (kitchen card, KYC, earnings, account,
  log out)**; hidden routes (still served, not in the bar): menu, meals,
  meal-hub, store, earnings, kitchen. Listing editors: `dish/[id]` and
  `store/product/[id]` are photo-first sectioned forms with live preview +
  publish switch; `kitchen-details` is a 4-step wizard (basics → photos →
  delivery → publish); `meal-hub` carries the service switch and a month
  calendar grid. `WizardSteps`, `FieldError`, `PublishSwitch` live in
  `src/components/CookBits.js`
- `chat/`, `order/`, `orders.js`, `checkout.js`, `wallet.js`, `stores/`,
  `product/`, `chef/`, `dish/`, `meal-*` (booking/service/order/management),
  `request-order/`, `requests/`, `saved-shops.js`, `edit-profile.js`,
  `addresses.js`, `notifications.js`

### State (`src/store/`) — know which context owns what
- `AuthContext` — **local** profile + view mode (customer/cook), AsyncStorage
- `SessionContext` — **server** identity: token, `requestCode`/`verifyCode`,
  profile writes (`saveProfile`, `saveAddress`) which adopt the server's
  response back into AuthContext
- `KitchenContext` — cook's kitchen + dishes; `ensureKitchen` registers on
  signup (ask-server-first, shared promise); `KitchenSync` in root layout
- `CommerceContext` — wallet, stores/products, meal orders, promotions
- `OrdersContext` — order board; `ChatContext` — chat + WS;
  `CartContext`, `ConfigContext`, `LoadingContext`, `SyncContext`
- API conventions: `api()` (GETs de-duped in flight), `call()` →
  `{ok, result|error, message, detail, retryable}`; errors are server `code`s;
  401 → `onSessionExpired` → app signs out everywhere.

### UI system (`src/theme/`, `src/components/`)
- Tokens: `font` (Fraunces display + Inter UI + Noto Sans Bengali),
  `radius`, `type` (fluid scale getters), `tracking`; warm palette
  (vermilion primary for customer, **sage for cook side**); dark mode via
  `ThemeProvider` (`colors.*`, `shadow.*`, `rgbRaised`).
- Recurring pieces: floating BlurView pill tab bar (both panels), `BentoBox`,
  `IconTile`, `Reveal`/`FadeInDown` entrances, `FloatLabelInput`, `FormNote`,
  `SectionHeader` (`lead` + `accent`), `Price`, `StockPill`, `ActionRow`,
  `StatTile`, `NextUp` (pending actions), `CookScreen`/`Screen`/`Container`.
- **i18n: every user-facing string goes through `t('English text')`** with a
  Bengali entry in `src/i18n/bn.js` (missing key falls back to English);
  placeholders `{n}`, numbers via `n()`.
- **Images are data URIs** resized via `expo-image-manipulator`
  (`src/lib/pickedImage.js`: roles avatar/cover/gallery/dish,
  `GALLERY_BUDGET_BYTES` 3MB, `fitGallery`). Never store `blob:`/`file:` uris.
- The codebase carries long narrative comments explaining *why* — match that
  style; comments are English.

---

## 4. admin Panel Next.js

Next.js 16 app router + server actions; **Prisma/SQLite only for admin
identity, AuditLog, settings** — all marketplace data is read/written through
backend-node (`lib/backend.ts`: `BACKEND_URL` + service-token/actor headers,
15s timeout). Capability model (`lib/domain.ts`): e.g. `kitchen.read`,
`kitchen.write`, `kyc.decide` — checked in pages (`requirePage`) and actions.
- KYC queue: `app/(dash)/kyc/page.tsx` + `decision.tsx` → `actions/kitchens.ts`
  `decideKyc()` → `POST /api/admin/v1/kitchens/:id/kyc`
- Kitchen detail shows NID + KYC docs deliberately (never shown to customers).
- No email infra in the panel — notifications are the backend's job.

---

## 5. Landing page Rannabari

Static Next.js 16 marketing page (no API). Unrelated to auth flows.

---

## 6. Cross-cutting rules (do not violate)

1. **The server is the source of truth.** Device state is a cache. Writes go
   through the API and adopt the response; never invent ids client-side.
2. **Money never mutates.** Reversals are new ledger entries. Whole taka —
   never floats (`src/lib/format.ts`).
3. **KYC gates trading.** A pending/rejected kitchen cannot open for orders;
   the app gates the UI, the backend enforces it (`kitchenMayTrade`).
4. **Roles are the server's call.** `role` on the token/identity comes from
   kitchen existence; the local flag is a hint that gets overwritten.
5. **Every string is translatable** (t()/n()); register new English keys in
   `bn.js` too.
6. **Images** are resized data URIs within budget; the kitchen gallery posts in
   one request.
7. **Field names are the wire format** — Mongoose schemas are the app's
   contract; renames break the app silently (no compile-time check).
8. **Existing docs at root are specs/history**, some stale (Sept 2026);
   `meal_system.md` drives the mess module; trust code over prose.
9. Shell paths contain spaces — quote them. Git Bash on Windows.

## 7. Current in-flight work (context for new sessions)

- Cook registration funnel (email + password → email OTP → NID documents →
  admin KYC) is built end-to-end: backend endpoints, `cook-verify.js`,
  `cook-documents.js`, admin KYC queue. Resend has a server cooldown; the app
  counts it down.
- Known UI debt the owner wants addressed: cook panel "Today" tab →
  informative Dashboard; merge Today + Business into a Profile menu; make
  Menu/Shop/Kitchen/Meal listing flows fully user-friendly.
  **Done 2026-10-18:** Dashboard/Profile tabs + all four listing flows
  redesigned per the brief (see Routing map above). Untested on device —
  worth a smoke pass in Expo before calling it shipped.
