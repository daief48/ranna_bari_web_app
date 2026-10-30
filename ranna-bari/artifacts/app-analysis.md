# RannaBari — Application Analysis

Prepared 2026-10-31 for the promotional poster. Everything below was read from the
repository (`AGENTS.md`, route folders, scripts) or seen running in a local build.
Where a page could not be inspected, that is stated in "Limitations".

## 1. What it is

**RannaBari** is a home-cooking marketplace for Bangladesh (launching in Dhaka).
Home cooks open a kitchen; customers order cooked-to-order meals, pre-book a month of
meals, or buy pantry goods (achar, pitha, jorda, frozen goods, sweets) from a cook's shop.
A separate "meal management" module lets people sharing a mess/room track meals, bazar
(grocery) spending and the monthly rate.

**Audiences:** customers (order food), home cooks (run a kitchen and shop), platform
operators (verify cooks, run money and disputes).

**Value proposition (from the landing page and app copy):**
- Authentic home kitchens near you, cooked to order.
- Every cook is identity-checked (National ID + kitchen photos, reviewed by a person).
- Your money is held until you confirm the food arrived, then released to the cook.
- Pre-book a month of meals on the days you choose; the app is available in English and Bengali.

## 2. Architecture and stack

```
User and Cook App/     Expo SDK 57, React Native 0.86, expo-router  — one app, customer + cook modes
backend-node/          Fastify 5, Mongoose 8, MongoDB (Atlas)       — the only API
admin Panel Next.js/   Next.js 16 (App Router, server actions), Tailwind v4, Prisma/SQLite for operator identity
Landing page Rannabari Next.js 16 static marketing page
```

- Backend routes: `/api/app/v1` (mobile app), `/api/app/v1/meal-management` (mess module),
  `/api/admin/v1` (operator console), `/api/internal`, plus a `/ws` WebSocket for chat.
- Deployed as a Netlify serverless function; chat falls back to HTTP polling there.
- Two separate auth realms: app JWT sessions (customer phone-OTP; cook email + password
  with email OTP) and an admin realm with roles and optional TOTP.
- The app UI is plain JavaScript with hand-built components; light/dark mode;
  Fraunces + Inter + Noto Sans Bengali typography; warm vermilion palette (customer) and sage (cook).
- Money is an **append-only ledger**: updates and deletes are rejected by the schema;
  reversals are new entries; whole taka only.

## 3. Screens and modules (as found)

### Customer app (`app/(tabs)` and detail routes)
Home · Browse (artisans) · Map (kitchens clustered on a Dhaka map, search, "Open now")
· Monthly Meals (pre-booking) · Shops (pantry) · Cart · Profile · Kitchen page · Shop page
· Dish page · Wallet · Orders · Order tracking · Notifications · Requests (ask for something
nobody has listed) · Meal Management (mess) · Chat · Addresses · Saved shops · Edit profile.

### Cook panel (`app/cook/(panel)`)
Dashboard (kitchen + shop business cards, earnings today, 7-day sparkline) · Orders board
· Listings (Menu / Shop / Kitchen / Meal) · Profile (kitchen card, KYC, payout) · Earnings
· Monthly-meals hub (service switch + month calendar) · Reviews · Kitchen details wizard
· Meal plan · Shop hub · Food requests · Dish editor.

### Cook sign-up funnel
Become a cook → email + password → email OTP → NID documents upload → admin KYC decision.

### Admin console (`admin Panel Next.js/app/(dash)`)
Overview · KYC queue · Kitchens · Orders · Ledger · Payouts · Disputes · Refunds · Top-ups
· Carts · Customers · Requests · Reviews · Promotions · Meal plans / categories / bookings
· Preorders · Stores · Menu · Specialties · Icons · Search terms · Coverage · Chat
· Notifications · Settings · Admins · Audit log. Four seeded roles (superadmin, operations,
finance, support) see different navigation and may perform different actions.

### Landing page
Hero, "How it works", Features, Security, "Get the App" with the headline
"Home-cooked meals, from kitchens near you."

## 4. User journeys

1. **Customer:** browse or use the map → open a kitchen → add dishes → pay from wallet →
   follow order status (confirmed → preparing → ready → out for delivery → delivered)
   → confirm receipt → cook is paid.
2. **Monthly meals:** pick a kitchen's published month → choose days and meals → pay once →
   confirm each meal when it arrives.
3. **Cook:** register → verify email → upload NID → wait for KYC approval → publish menu,
   shop and monthly calendar → accept and run orders → watch earnings → get paid out.
4. **Operator:** review KYC → watch orders and ledger → run payouts → resolve disputes.

## 5. Responsive coverage
Mobile app screens were captured at 390 × 844 (phone). The admin console and landing page
were captured at 1440 × 900 desktop. No tablet-specific layout was inspected.

## 6. How the screenshots were made
- A local backend (port 4417) with a throwaway MongoDB, seeded with the repo's own demo
  seed and the "Lily Sweet Kitchen" demo cook (`scripts/seed.ts`, `scripts/seed-lily.ts`).
- The Expo web build pointed at that backend, driven with Puppeteer at a phone viewport.
- Signing in used the real sign-in endpoints (cook email + password; customer dev OTP).
- The Atlas-backed server that was already running on port 4000 was **not** used or modified.
- All data in the screenshots is demo seed data (names, photos, prices, earnings).

## 7. Limitations and observations
- **Dish detail page** (`/dish/:id`) crashed in the web build with
  "Rendered more hooks than during the previous render", so it is not in the screenshots.
  This looks like an app bug worth fixing; no app code was changed.
- The mobile app was inspected through Expo **web**, not on a device; native-only behaviour
  (haptics, native maps) was not inspected.
- Not inspected: the mess "Meal Management" inner pages, the sign-up OTP steps, and
  anything needing real SMS/SMTP, payments or an admin TOTP code.
- Demo photos in the seed come from stock image URLs; they are placeholders, not real cooks.
- The working tree contained uncommitted edits by someone else during this session; they were
  not touched.
