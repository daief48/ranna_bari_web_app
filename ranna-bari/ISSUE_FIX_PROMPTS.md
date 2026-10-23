# RannaBari — Fix Prompts for 8 User-Reported Issues

**Written:** 2026-10-24, after a full-system analysis of the code at `main`.
**How to use:** paste one prompt (the blockquote body) into a fresh agent
session opened at the repo root. `AGENTS.md` (the system map) is loaded there
automatically. Each prompt is self-contained — it carries its own root-cause
analysis with file:line references — but read the shared notes below once.

**Recommended order:** #8 (visibility bug, quick win) → #6 (division/area
model — foundational) → #7 (builds on #6's division data) → #4 (order notes) →
#1, #2, #3, #5 in any order.

**Shared ground rules (apply to every prompt):**

- Paths contain spaces — always quote them in shell commands.
- Field names are the wire format (Mongoose schemas are the app's contract,
  the app is plain JS with no compile-time check). **Add** fields, never
  rename; every new field needs a schema default so old rows keep working.
- Every user-facing string goes through `t('English text')` with a Bengali
  entry in `User and Cook App/src/i18n/bn.js`; numbers via `n()`.
- Images are resized data URIs via `src/lib/pickedImage.js` — never
  `blob:`/`file:` uris; respect `GALLERY_BUDGET_BYTES` (3 MB) with
  `fitGallery`/`weighGallery` when a screen holds a photo set.
- Money is whole taka, never floats.
- After backend changes run `npm test` in `backend-node/` (vitest +
  mongodb-memory-server). Pre-existing failures at HEAD that are NOT yours:
  `scripts/verify-wipe.ts` (TS2590) and `tests/meal-management.test.ts`
  ("1 meals" balance assertion). After app changes, smoke-pass in Expo.

---

## Issue 1 — Customer sees meals although the cook never created any

> **Symptom.** I created a cook account but never created any meal. Then I
> created a customer account, and the customer app's Meals tab shows meals
> anyway.
>
> **Root cause (analysis — verify as you go, then fix).** This is a mix of
> demo seed data and two deliberate design behaviours that together look like
> a bug:
>
> 1. `GET /meal-services` (`backend-node/src/routes/app/v1/meals.ts:367-431`)
>    lists every `MealService` with `active: true` whose kitchen is only
>    checked for `suspended: false`. It never checks `kycStatus`, so a
>    kitchen that cannot legally trade can still appear (only the *write*
>    side is KYC-gated via `cookOf(..., { trading: true })`).
> 2. `resolvePlan` (`backend-node/src/logic/mealplan.ts:573-607`) is
>    copy-on-write: a kitchen with no published plan of its own **inherits the
>    platform's system MealPlan** (`scope: 'system', kitchenId: ''`). So the
>    dish names on a card may not be the cook's menu at all — they are the
>    platform default, shown as if the cook chose them.
> 3. The dev database is seeded: `scripts/seed-meal-demo.ts` creates
>    "Nasrin's Kitchen" (approved KYC, `MealService active: true`, business
>    ৳300) and system-published plans for business/student/regular for this
>    month and next; `scripts/seed-lily.ts` creates "Lily Sweet Kitchen"
>    (active service, published cook-scope plan). A brand-new cook contributes
>    nothing — a new cook cannot even activate a service (KYC gate) and
>    `registerKitchen` creates no meal rows. What the customer sees is the
>    demo cooks' services decorated with the platform default menu.
>
> **Fix.**
> 1. In `/meal-services`' kitchen query (`meals.ts:375-378`) add
>    `kycStatus: 'approved'` so the read side matches the trading gate.
>    Audit the sibling read `GET /meal-services/:kitchenId` for the same gap.
> 2. Make the system-menu inheritance honest: have `resolvePlan` return which
>    source it used (`'cook' | 'system'`), thread that onto the shaped cards,
>    and when the plan is the system fallback render a small badge chip on the
>    Meals-tab card and on the booking calendar, e.g.
>    `t('RannaBari default menu — the cook has not published their own yet')`
>    (register the key in `bn.js`). Same badge in
>    `User and Cook App/app/meal-service/[kitchenId].js`.
> 3. Add a maintenance helper (extend `backend-node/scripts/check-meal-plans.ts`
>    or a new `scripts/check-meal-services.ts`) that prints every
>    `MealService.find({ active: true })` with its kitchen, KYC status and plan
>    source — so "who am I actually looking at" is one command.
> 4. In your final summary explain to the owner how to clear demo meal data if
>    they want a clean slate (which collections `seed-meal-demo.ts` wrote, and
>    that `delete-all-users.ts` keeps reference data).
>
> **Acceptance.** (a) A KYC-pending kitchen never appears in `/meal-services`
> even with a forced-active service. (b) Cards backed by the platform default
> menu show the badge; a cook's own published plan shows none. (c) With demo
> services deactivated, a fresh customer with a fresh cook sees an empty Meals
> tab. (d) `npm test` passes.

---

## Issue 2 — `/cook/kitchen` cannot edit kitchen photos (gallery is view-only)

> **Symptom.** At `http://localhost:8081/cook/kitchen` I cannot edit the
> kitchen's photos.
>
> **Root cause.** `User and Cook App/app/cook/(panel)/kitchen.js` edits only
> two photos, each saved instantly: cover (`pickImage('coverImage')`, ~line
> 168) and avatar (`pickImage('avatar')`, ~line 228). The gallery is
> **view-only**: tiles rendered from `kitchen.photos` at lines ~333-348 with
> no press handler, and the empty state literally says
> `t('No photos on this kitchen. Contact support to change them.')` (~line
> 361). Full photo editing exists only in the 4-step wizard
> `app/cook/kitchen-details.js` (Photos step: cover/avatar/gallery add+remove
> with the 3 MB budget). The dashboard sends people here from three places:
> `app/cook/(panel)/index.js` ~612 (header photo card), ~740 ("Kitchen" chip)
> and ~1383 ("Add kitchen photos" nudge) — so the dead-end is a main path.
>
> **Fix.** Turn `/cook/kitchen` into a real kitchen photo manager:
> 1. Make the gallery editable on this screen: multi-select picking (model it
>    on `src/components/KitchenPhotoField.js` — `allowsMultipleSelection:
>    true`, `toStorableImages(res.assets, 'gallery')`, then
>    `fitGallery` against `GALLERY_BUDGET_BYTES`, cap 5 photos /
>    `MAX_KITCHEN_PHOTOS`), plus a remove action per tile with a confirm.
> 2. Keep this screen's instant-save semantics (each change posts
>    immediately) — it is the "photos" screen; the wizard keeps its
>    save-at-the-end draft.
> 3. Wire format: `POST /kitchens/mine` accepts `avatar`, `coverImage` and
>    `photos` (`backend-node/src/logic/sync.ts:79-128`) — `photos` is
>    **replaced wholesale, not merged**, so always send the full final array.
> 4. Keep the link to `/cook/kitchen-details` for the rest of the fields.
> 5. Replace the "Contact support" empty state with an add-photo call to
>    action. Register all new strings in `bn.js`.
>
> **Acceptance.** From `/cook/kitchen` I can add two gallery photos in one
> pick, remove one, exceed-budget is refused gracefully, and the set survives
> a kill+relaunch (server round-trip, not local state). Cover/avatar editing
> still works.

---

## Issue 3 — Dish editor should support multiple photos

> **Symptom.** At `/cook/dish/new` I can add only one image; I want multiple.
>
> **Root cause.** The whole stack is single-photo: `dishSchema.image` is one
> string (`backend-node/src/models/index.ts:337`); the editor
> `User and Cook App/app/cook/dish/[id].js` picks one asset
> (`res.assets[0]`, ~lines 142-161) and posts `{ ..., image, ... }`
> (~205-215); the customer screen `app/dish/[id].js` renders one
> `Image` (~106-111); the endpoint `POST /kitchens/mine/dishes`
> (`backend-node/src/routes/app/v1/index.ts:770-782`) zod-validates a single
> `image`. Note: shop **products** already have `images: [String]`
> (`models/index.ts:397`) — dishes are the odd one out.
>
> **Fix (additive — never rename `image`).**
> 1. Schema: add `photos: { type: [String], default: [] }` to `dishSchema`.
>    Keep `image` as the primary/first photo and set `image = photos[0]` on
>    every write so every existing reader (lists, search, cards, old app
>    builds) keeps working unchanged.
> 2. Endpoint: accept `photos: z.array(z.string()).max(5)` in the dish
>    zod body; server derives `image` from `photos[0] ?? image`.
> 3. Editor (`app/cook/dish/[id].js`): switch the photo section to a
>    multi-select gallery — reuse the `KitchenPhotoField` pattern
>    (`src/components/KitchenPhotoField.js`: multi-pick,
>    `toStorableImages(..., 'dish')`, `fitGallery` budget), first tile
>    labelled as cover, remove per tile, budget respected.
> 4. Customer screen (`app/dish/[id].js`): render a swipeable photo pager
>    (horizontal FlatList/ScrollView with page dots) over
>    `dish.photos?.length ? dish.photos : [dish.image]`; list cards keep
>    using `dish.image`.
> 5. i18n for new strings; keep the existing placeholder behaviour for
>    brand-new dishes.
>
> **Acceptance.** Create a dish with 3 photos → customer dish page swipes
> through all 3 and cards show the first. An old dish that only ever had
> `image` still renders everywhere. Editor refuses a gallery over the 3 MB
> budget with a readable message.

---

## Issue 4 — Customer cooking-note for the cook on every order kind

> **Symptom / requirement.** When a customer orders (menu dishes, monthly
> meal plates, shop goods) they should be able to add a note for the cook —
> "jhal kom diben", "sweet kom hobe" — and the cook must see that note when
> the order arrives.
>
> **Current state (analysis).** There is **no note field anywhere** in the
> order path. The only free text riding an order is
> `address.instructions` (a *rider* instruction: `checkout.js` lines ~304-310
> submit it inside `address`; `cook/order/[id].js` ~260-285 shows it in a
> saffron callout). Details per kind:
> - **Dish orders** — `POST /orders` → `recordOrder`
>   (`backend-node/src/logic/sync.ts:211`, draft type at :174-195,
>   persist :281-318, `shapeOrder` :386+). No note. Cook's board cards
>   (`src/components/OrderCards.js`) show items/address but never
>   instructions.
> - **Monthly meal booking** — `POST /meal-bookings`
>   (`backend-node/src/routes/app/v1/meals.ts:499`, zod body :503-513
>   strips unknown keys) → `bookMeals` (`logic/mealplan.ts:839`, Order.create
>   :970-993). No note client- or server-side
>   (`src/features/meal-plan/api.js:110-115`).
> - **Shop orders** — `POST /store-checkout` zod accepts only
>   `name, phone, address` (`routes/app/v1/stores.ts:1083-1089`);
>   `checkout()` lines :1092-1100 build lines with no note. Client
>   `app/store-checkout.js:52-55` + `addressFromAccount`
>   (`src/lib/ledger.js:89-101`) hardcode `instructions: ''`.
> - **Request orders** — `Request.details`/`description` already carry the
>   customer's text (`routes/app/v1/requests.ts:231-252`, input in
>   `app/requests/new.js:141`), but `payForRequest`
>   (`logic/requests.ts:1429`, order built :1465-1506) does **not** copy it
>   onto the kind-`'request'` Order, so the cook's order view loses it.
>
> **Fix — one first-class field, threaded end to end.**
> 1. Schema: add `note: { type: String, default: '' }` to `orderSchema`
>    (`models/index.ts:852+`) and to `mealBookingSchema` (~:658). Additive
>    only.
> 2. Dish orders: add `note` to `OrderDraft` + `recordOrder` + `shapeOrder`
>    (`logic/sync.ts`).
> 3. Meal bookings: add `note: z.string().max(300)` to the
>    `POST /meal-bookings` zod body; thread through `bookMeals` onto both the
>    MealBooking and the per-slot Orders it creates.
> 4. Shop orders: add `note` to `POST /store-checkout` zod; persist on the
>    created order in `checkout()`.
> 5. Request orders: in `payForRequest`, copy `request.details` (or
>    description) into the order's `note` so it follows the order rail.
> 6. Customer UI — a **separate** "Note for the cook" input (distinct from
>    rider "Delivery instructions"; cap 300 chars, counter optional):
>    - `app/checkout.js` (next to the instructions field),
>    - `app/meal-service/[kitchenId].js` confirm flow,
>    - `app/store-checkout.js` (and stop hardcoding `instructions: ''` while
>      there — surface the saved address's rider instructions input too).
>    Placeholders in the user's own vocabulary, English originals e.g.
>    `t('Anything the cook should know? Less spicy, less sweet…')`.
> 7. Cook UI — the note must be unmissable where work is triaged:
>    - `MemoOrderCard`, `MemoShopCard`, `MemoMealPlate` in
>      `src/components/OrderCards.js`: render the note as a highlighted
>      callout (match the saffron style of `cook/order/[id].js:260-285`),
>      never truncated to oblivion — allow 2 lines + tap to expand.
>    - `app/cook/order/[id].js`: show "Note for the cook" and "Delivery
>      instructions" as two clearly labelled blocks.
>    - Give meal-plate rows on the board a tap-through to a detail view (or
>      at minimum an expandable note) — today `MemoMealPlate` has no
>      `onOpen` at all.
> 8. Customer's own receipt (`app/order/[id].js`) shows their note back to
>    them. All new strings in `bn.js`.
>
> **Acceptance.** For each of the four kinds: customer writes a note at
> checkout → cook sees it on the board card without opening anything → note
> survives the full order lifecycle (advance/receive) and appears on both
> receipts. Request-order note appears on the cook's order view after payment.

---

## Issue 5 — Shop tagline should feel real, and add tags

> **Symptom.** On `/cook/store` the tagline should be more realistic, and
> shops need tags.
>
> **Current state.** `Store.tagline` exists
> (`backend-node/src/models/index.ts:358`) and already reaches customers
> (`src/components/StoreBits.js:534-546` two-line slot, `app/stores/[id].js:287-291`,
> `app/(tabs)/browse.js:1178`, search in `src/components/ShopResults.js:82`,
> map `app/(tabs)/map.js:135`). It is collected in the setup wizard step 0
> with placeholder "One line on what this shop sells"
> (`app/cook/(panel)/store.js:461, 583-588`) and edited in
> `app/cook/store/settings.js:76, 283-288`. There is **no tags field** on
> Store (StoreCategory is the shop's own shelves, not label chips — do not
> conflate them). The shop hub header (`store.js:99-107`) never shows the
> tagline.
>
> **Fix.**
> 1. Schema: add `tags: { type: [String], default: [] }` to `storeSchema`;
>    zod `tags: z.array(z.string()).max(5)` in `storePatchSchema`
>    (`routes/app/v1/stores.ts:422-436`); include in `shapeStore` (:291+).
> 2. Tag input UI in setup step 0 **and** settings: suggested chips
>    (`t('Homemade')`, `t('Achar')`, `t('Pitha')`, `t('Cakes & bakes')`,
>    `t('Dry snacks')`, `t('Honey & ghee')`, `t('Gift boxes')`…) plus free
>    text entry; selected tags render as removable chips.
> 3. Tagline realism: replace the dry placeholder with concrete examples and
>    offer 3 tappable example taglines that fill the field, e.g.
>    `t('Small-batch achar, ground and bottled every week')`,
>    `t('Village-style pitha made to order')`,
>    `t('Home bakes — cakes, cupcakes, gift boxes')`. Same suggestions in
>    settings. Validate lightly (≤ 90 chars).
> 4. Customer surfaces: render tag chips under the tagline on the store
>    detail header (`app/stores/[id].js`) and on `StoreCard`
>    (`src/components/StoreBits.js`) when tags exist; include tags in
>    ShopResults search text.
> 5. Shop hub: show the tagline in the header subtitle area (under the
>    open/closed sentence) so the cook sees their own storefront words.
> 6. Thread `tags` through `shop.saveStore`
>    (`src/store/CommerceContext.js:1143-1149`). All strings in `bn.js`.
>
> **Acceptance.** A new shop created with 3 tags and an example tagline shows
> tagline + chips on the customer store page and cards; tags appear in search;
> old shops with no tags render exactly as before.

---

## Issue 6 — Division → area delivery coverage (multi-select, all-Bangladesh, select-all-division)

> **Requirement.** Replace the pin-and-radius idea of "where I deliver" with
> a division → area picker: pick one or many divisions; inside a division pick
> specific areas, or hit one button to cover **all areas of that division**;
> or one master option **"All over Bangladesh"**.
>
> **Current state (analysis).** There is **no division/district data
> anywhere** in the repo. The only area vocabulary is `KNOWN_AREAS` — 37
> Dhaka neighbourhoods (`User and Cook App/src/lib/areas.js:18-56`,
> `normaliseArea` falls back to `'Dhaka'`). An address is
> `{ id, label, area (free text), detail, instructions, lat, lng, selected }`
> (`backend-node/src/models/index.ts:69-84`) — no division field. Delivery
> matching is purely client-side haversine: `deliversTo`
> (`src/lib/kitchen.js:27-32`) compares distance to
> `deliveryRadiusKm`; applied in `app/(tabs)/browse.js:227-230` (kitchens),
> `:104-105/:131-132` (shops/products), `src/store/CommerceContext.js:1102`
> (storesNearby). The `Zone` model is dead reference data (only `/config` and
> admin CRUD read it). This radius model is what previously hid all Dhaka
> kitchens from a Gopalgonj address.
>
> **Fix — data, schema, matching, UI.**
> 1. **Shared data module** (foundation for #7 too): a new
>    `src/lib/bd-areas.js` with all 8 divisions (Dhaka, Chattogram, Khulna,
>    Rajshahi, Barishal, Sylhet, Rangpur, Mymensingh) and their districts,
>    plus a curated `areas` list per district (start with districts as areas
>    where unsure; keep it one static file). Mirror the same data in
>    backend-node (`src/lib/bd-areas.ts`) or serve it via `GET /config` —
>    pick one source of truth and say which in the file header.
> 2. **Schema (additive):**
>    - `kitchenSchema` and `storeSchema`: `serviceAreas:
>      [{ division: String, areas: [String] }]` (empty `areas` array under a
>      division = whole division) and `allBangladesh: Boolean, default false`.
>      Keep `deliveryRadiusKm` — old sellers must keep working.
>    - `Account.addresses` subdoc: add `division: String` and `district:
>      String` next to `area`. Backfill nothing; absence = legacy.
> 3. **Matching helper** in `src/lib/kitchen.js` (and backend mirror for the
>    request broadcast at `routes/app/v1/requests.ts:163-192`):
>    `coversCustomer(seller, addr)` → true if `allBangladesh`; else any
>    serviceArea where `division === addr.division` and (`areas` empty or
>    contains `addr.district`/`addr.area`); **fallback** — seller with no
>    `serviceAreas` at all keeps the old `deliversTo` radius behaviour so
>    nothing regresses for existing cooks.
> 4. **Cook UI:** in `kitchen-details.js` Delivery step, shop setup step 3
>    (`store.js:773-848`) and `store/settings.js`: division accordion → area
>    chips; a **"Select all of {division}"** button per division; a
>    **"All over Bangladesh"** master switch at top (disables the rest when
>    on). Multi-select everywhere. Show a summary line
>    (`t('Delivering to: Dhaka (all), Gopalgonj')`).
> 5. **Customer UI:** `app/addresses.js` (and signup step 3 / edit-profile
>    where an address is entered) gains division → district cascading
>    selects; keep the pin optional for fine-tuning; `area` stays as the
>    display string so old screens don't break.
> 6. **Apply the matcher** in `browse.js`, `CommerceContext.storesNearby`,
>    the Meals tab (which currently has no location sense at all), and the
>    backend request broadcast. When a customer has no division on file, fall
>    back to today's behaviour (show everything / radius as applicable).
> 7. All strings in `bn.js`. Run backend tests. This change touches the wire
>    contract — no renames, defaults everywhere.
>
> **Acceptance.** A cook selects only "Gopalgonj — all areas" → a customer
> whose address division is Gopalgonj sees that kitchen/shop at any distance;
> a customer in Dhaka does not. "All over Bangladesh" sellers are visible to
> every address. A legacy kitchen with only a radius behaves exactly as
> today. No old address records break.

---

## Issue 7 — Inside-Dhaka vs outside-Dhaka delivery fee for shops

> **Requirement.** At shop creation the cook sets two delivery charges: one
> for customers inside Dhaka, one for outside Dhaka.
>
> **Current state.** A single `Store.deliveryFee`
> (`backend-node/src/models/index.ts:367`, default 0) with optional
> `freeDeliveryOver`. Charged per store in `priceCart`
> (`backend-node/src/logic/stores.ts:946-959`) and `checkout`
> (`routes/app/v1/stores.ts:1049-1077`, stamped at :1121); mirrored
> client-side in `src/lib/storeLogic.js:495-510, 592, 624` and shown in
> `app/store-checkout.js:119-125`. Collected in setup step 3 as one `fee`
> field (`app/cook/(panel)/store.js:466, 827-836`) and edited in
> `store/settings.js`. No inside/outside notion exists anywhere.
>
> **Fix (additive — keep `deliveryFee` as the legacy fallback).**
> 1. Schema: `deliveryFeeInsideDhaka: { type: Number, default: null }` and
>    `deliveryFeeOutsideDhaka: { type: Number, default: null }` on
>    `storeSchema`. Effective fee = the specific field if non-null, else
>    legacy `deliveryFee` (default 0) — so existing shops behave unchanged.
> 2. Setup step 3 and `store/settings.js`: two labelled inputs
>    (`t('Delivery fee inside Dhaka')` / `t('Delivery fee outside Dhaka')`),
>    whole taka; keep `freeDeliveryOver` shared by both.
> 3. Fee selection at checkout: which fee applies follows the **customer's
>    address division** — build on the division data + address fields from
>    Issue #6 (if that hasn't landed yet, use a temporary helper
>    `isInsideDhaka(address)` reading `address.division === 'Dhaka'` with a
>    legacy fallback that treats unknown divisions as inside-Dhaka pricing
>    only when the shop has no outside fee). Implement it **server-side** in
>    `priceCart` + `checkout` (the server is the source of truth for money)
>    and mirror the display in `src/lib/storeLogic.js`.
> 4. `app/store-checkout.js`: show the fee that will actually be charged
>    ("Delivery (outside Dhaka) — ৳80") before the pay button; if the
>    customer has no address yet, prompt to add one rather than guessing.
> 5. `shapeStore` returns both fees so the app can preview them on the shop
>    page. i18n; whole taka everywhere; `npm test`.
>
> **Acceptance.** A Dhaka-division customer is charged the inside fee, a
> Chattogram customer the outside fee, on both server pricing and the
> client-displayed basket. A legacy shop with only `deliveryFee` charges the
> same number to everyone, exactly as before.

---

## Issue 8 — Shop is OPEN but customers don't see it (+ second-shop invisible to the cook)

> **Symptom.** I opened the shop's shutter, but the customer app doesn't show
> the shop.
>
> **Root cause (three stacked causes — verify each).**
> 1. **Client distance filter with a borrowed pin.** The customer Stores tab
>    renders `storesNearby` (`src/store/CommerceContext.js:1086-1103`) which
>    drops shops where `deliversTo(store, km)` fails
>    (`src/lib/kitchen.js:27-32`). A new store has `lat/lng: null`, so the
>    backend **borrows the kitchen's pin and radius** when shaping the
>    directory (`routes/app/v1/stores.ts:301-303`). Any customer farther than
>    that radius — e.g. Gopalgonj address vs Dhaka shop, ~250 km vs a 3 km
>    default — silently sees nothing. Same gate hides shops in browse
>    (`app/(tabs)/browse.js:104-105, 131-132`).
> 2. **Area string equality.** `browse.js:77` `inArea = (row) => area ===
>    'all' || row.area === area` (applied :83, :101, :129) — the setup wizard
>    allows an **empty** `area`, and `'' === 'Dhanmondi'` is false, so once a
>    customer picks any area chip the shop (and its products) vanish.
> 3. **Cook-side state gap (the shop is invisible to the cook too).**
>    `reloadMyStore` (`CommerceContext.js:914-923`) only refetches via
>    `GET /stores?kitchenId=` when the cook has **zero** shops in client
>    state; but client `state.stores` is fed by the public directory
>    (`GET /stores` → `Store.find({ isOpen: true })`, `stores.ts:490-491`),
>    so a newly created **closed** shop never enters state, the guard never
>    trips, and the hub switcher never shows the new shop until a full app
>    restart. Worse, the setup wizard ends with
>    `router.push('/cook/store/settings')` **without `?shop=`**
>    (`store.js:551`), and the settings screen resolves `shops[0]`
>    (`store/settings.js:41-44`) — the **old** shop. So the cook can believe
>    they opened the new shop while actually toggling the first one.
>
> **Fix.**
> 1. Fix the state gap first (it also explains "I opened it" being untrue):
>    after a successful **create** in `shop.saveStore`
>    (`CommerceContext.js:1143-1149`), unconditionally refetch the kitchen's
>    shops via `GET /stores?kitchenId=<id>` (bypassing the zero-guard in
>    `reloadMyStore`), and have the wizard push
>    `/cook/store/settings?shop=<newId>` with the id from the create
>    response. Verify every post-create push in the wizard and hub does the
>    same.
> 2. Fix the area match: treat an empty seller area as matching any selected
>    area — `inArea` becomes `area === 'all' || !row.area || row.area ===
>    area` at all three call sites.
> 3. Soften the silent distance hide (full replacement comes with Issue #6's
>    coverage model): in `ShopResults` / the Stores tab, don't drop
>    out-of-range shops into nothing — show them in a collapsed
>    `t('Outside your delivery area')` section (or a distance caption
>    `t('~{n} km away')`), so an open shop is never a total invisibility
>    event. Keep purchase gating (`STORE_CLOSED`/range refusals at cart time,
>    `logic/stores.ts:773`) as-is.
> 4. Add a cook-side truth line on the shop hub: based on the same matcher,
>    show `t('Customers within {n} km of {area} can see this shop')` (or the
>    coverage summary once #6 lands), so "open" and "visible" stop being
>    confusable.
> 5. Regression-test the Gopalgonj case explicitly and note it in the final
>    summary.
>
> **Acceptance.** Create a second shop → it appears in the hub switcher
> immediately (no restart); the wizard's finishing push lands on the **new**
> shop's settings; open its shutter → it appears in the customer Stores tab
> for an in-range customer within one refresh; a customer with an area chip
> selected still sees shops that have no area set (in the out-of-range/
> in-range section as appropriate).
