# RannaBari — UI Reference

A screen-by-screen and page-by-page catalogue: what is on each one, what a
person can do there, and what they see when there is nothing yet.

Read with [SYSTEM.md](SYSTEM.md), which covers architecture, the API and the
data model. This file is only the interface.

Everything below was read out of the source — headings, section titles, field
labels, button text, empty states and table columns are quoted as they appear.

---

## Contents

- [Part 1 — Mobile app](#part-1--mobile-app)
  - [Design system](#design-system)
  - [Screen anatomy](#screen-anatomy)
  - [Customer screens](#customer-screens)
  - [Cook panel screens](#cook-panel-screens)
- [Part 2 — Admin panel](#part-2--admin-panel)
  - [Layout and UI kit](#layout-and-ui-kit)
  - [Overview](#overview)
  - [Supply](#supply)
  - [Demand](#demand)
  - [Money](#money)
  - [Platform](#platform)
- [Patterns worth knowing](#patterns-worth-knowing)

---

# Part 1 — Mobile app

## Design system

### Colour

Warm, food-first. Three brand hues carry meaning consistently across the app:

| Token | Light | Dark | Means |
|---|---|---|---|
| `primary` | `#C7381A` vermilion | `#EF6A3D` | The customer side, primary actions |
| `sage` | `#55703F` | `#8FAE72` | Shops, distance, "good" states |
| `saffron` | `#B8850F` | — | Meals, held money, warnings |
| `canvas` | `#FAF7F0` | dark sumi | The page ground |
| `surfaceSolid` | `#FFFFFF` | raised panel | Cards |

Each hue has a 50/100/200/300/600/700 ramp. Both themes are complete sets —
the app follows the device.

### Type

| Role | Face | Used for |
|---|---|---|
| Display | **Fraunces** — 400/600/700/800/900 + 800 italic | Headlines, prices, numbers that matter |
| UI | **Inter** — 400/500/600/700 | Everything else |
| Bengali | **Noto Sans Bengali** — 400/500/600/700/800 | Both roles when the language is Bengali |

Switching to Bengali swaps *both* faces, because neither Fraunces nor Inter
draws a single Bengali glyph. Sizes are fluid — they scale with screen width
between 1.0× and 1.06×.

### Shape and depth

`radius`: `xs 8 · sm 14 · md 22 · lg 30 · xl 38 · pill 9999`.
Five shadow steps, each with a matching Android `elevation` (up to 14).

### Component library — `src/components/`

```
Alert          Backdrop       Brand          Button         CartBar
ChatLauncher   ChefCard       CookBits       CookScreen     DistanceChip
FilmGrain      FilterSheet    FloatLabelInput Icon          LanguageSwitch
LocationPicker MapCanvas      MealBits       ModeSwitch     ModernLoader
MoodPill       Navbar         OrderTracker   PulseDot       RequestBits
Reveal         Screen         SectionHeader  StoreBits      Surfaces
TestimonialSlider  Typography
```

---

## Screen anatomy

Every screen is wrapped in `<Screen>`, which supplies the same furniture:

```
┌──────────────────────────────────────────┐
│  ╭────────────────────────────────────╮  │  ← Navbar: floating pill
│  │ 🍲 RannaBari      বাং  🔔  ☾      │  │    brand · language · alerts · theme
│  ╰────────────────────────────────────╯  │
│                                          │
│    KineticBackground + AmbientGlow       │  ← ambient wash, one per corner
│                                          │
│    ┌──────────────────────────────┐      │
│    │  page content, in a          │      │  ← ScrollView, padded clear
│    │  ScrollView                  │      │    of both floating bars
│    └──────────────────────────────┘      │
│                                          │
│    FilmGrain overlay                     │  ← subtle texture over everything
│                                          │
│  ╭────────────────────────────────────╮  │  ← the tab bar: a floating pill
│  │ Home Browse Meals Shops Map ...    │  │    12px above the home indicator
│  ╰────────────────────────────────────╯  │
└──────────────────────────────────────────┘
```

- The bars **float over** content rather than reserving layout space, so every
  scroll gets 110px of bottom clearance.
- Content fades and rises 10px on focus (260ms) — pages arrive rather than cut.
- Cards enter with `Reveal`: a staggered 30px rise, 800ms, honouring
  `prefers-reduced-motion`.
- On a cold start or refresh, `ModernLoader` covers the screen for 650ms — a
  full-screen `Modal` with the logo, an orbiting ring and a rotating quote.

---

## Customer screens

### Home — `(tabs)/index`

The pitch, then the neighbourhood.

- **Hero** — pill badge "100% Authentic Home Kitchens", then a three-line
  display headline: *CRAFTED AT / HOME. / DELIVERED TO YOU.*, a search box
  ("Search a dish, kitchen or area…") and a **Find Food** button.
- **Mood pills** — "What are you craving?" as a scrollable row.
- **Featured artisans** — "The highest-rated culinary artists near you", as
  `ChefCard`s.
- **Tomorrow's meals near you** — with *See all*.
- **Home shops near you** — with *View all*.
- **How it works** — "From their kitchen to your table in 3 simple steps".
- **Testimonials** — "Real orders, real kitchens, real neighbours."
- Bento tiles link to **Verified Artisans** and the **Kitchen map**.

### Browse — `(tabs)/browse`

The search surface. 1,927 lines — the largest screen in the app.

- Header *DISCOVER ARTISANS*, "Find the perfect meal curated by local chefs."
- Search box, an **All Areas** dropdown, a **Filters** sheet button and a
  round map shortcut.
- Category chips: **ALL · MORNING · LUNCH · EVENING …**
- Result count and sort — e.g. *"82 DISHES · NEAREST FIRST"*.
- **Recent searches**, with *Clear* and *Search again*.
- Rows show dish, kitchen, area, price and distance.
- Filter sheet: sort (nearest / top rated / cheapest / most expensive), price
  bands, diet, minimum rating, open-now, verified-only, free delivery.

### Meals — `(tabs)/meals`

*TOMORROW'S MEALS* — "Home cooks near you are planning tomorrow. Book your
plate tonight."

- **Wallet balance** shown at the top, because booking spends it.
- Tomorrow leads, today follows — the reverse of every other list.
- Prompts when signed out ("Sign in to book a meal and use your wallet") or
  when no address is set.
- Empty: *"No meals planned near you yet"* → **Browse kitchens**.

### Shops — `(tabs)/stores`

*HOME SHOPS* — "Cakes, pitha, achar and everything else cooks make to keep."

Deliberately separate from Browse: browsing kitchens is *what shall I eat
tonight*, this is *who sells the achar*. Same cooks, different errand.

- `StoreCard` grid with a save star; toasts confirm *"{name} saved."*
- Empty: *"No shops near you yet — Cooks near you have not opened a shop yet.
  If you cook, yours can be the first."*

### Map — `(tabs)/map`

A Leaflet map in a WebView, with clustering.

- One search box: **"Dish, kitchen, shop or area"**, with instant results as
  you type, grouped by kind.
- Three pin types: **kitchen** (vermilion, chef hat), **shop** (sage, box),
  **meal** (saffron, pot). Dishes and shelf items resolve to their place.
- Popups carry a photo, name, subtitle and a per-kind action.
- Bottom sheet: **"Nearest to you"**, with distance per row.
- **Open now** toggle. Degrades honestly: *"Some map tiles did not load."*

### Cart — `(tabs)/cart`

*YOUR CART* — cooked-to-order dishes only.

- Grouped by kitchen ("From: …"), quantity steppers per line.
- **AI Pairing Suggestion** — "Goes well with your order:" with an **Add**.
- Totals: Subtotal · Delivery Fee · Platform Fee.
- A separate **shop basket** line links out, since the two never merge.
- Empty: *"Nothing here yet — Pick a kitchen and the dishes you add will show
  up here."*

### Profile — `(tabs)/profile`

*YOUR PROFILE* — a bento grid of destinations.

Tiles: **Your orders** (with in-progress count) · **Your cart** · **Wallet** ·
**Notifications** · **Messages** · **Food requests** · **Home shops** ·
**Delivery addresses** · **Saved shops** · **Kitchen map** · **Become a cook**
· **Edit profile**.

- A **mode switch** for cooks: "Your kitchen is one tap away."
- Signed out: *"You're browsing as a guest"* → **Sign in or join**.
- **Log out** confirms with *Stay in* / *Log out*.

### Kitchen — `chef/[id]`

- Cover photo, avatar, name, **Top Artisan** badge, rating, area, distance,
  eco badge, tags.
- *CURATED MENU* — dishes with **Add to cart**.
- A link across to "Cakes, pitha, achar and gifts" if the cook has a shop.
- Closed state: *"{name} is not taking orders right now. The menu is here for
  when they open again."*
- A `CartBar` docks at the bottom once something is added.

### Dish — `dish/[id]`

Photo, name, price, description, tags, the kitchen row with a **distance
chip**, **Add to cart**, then *"From this kitchen"* / *"More from {name}"*.

### Meal — `meals/[id]`

The one screen with two deliberately different actions.

- Eyebrow *TODAY · DINNER*, title, price "per plate", description.
- The cook's row, with a distance chip.
- Three count tiles: **Interested · Confirmed · Left**.
- Facts: **Delivery** or **Collection**, and **Orders close** (or "No deadline").
- **Interested** is a quiet outline — free and reversible.
- **Confirm order · ৳220** is solid — it takes money. Confirming opens a sheet:
  *"Confirm this meal?"* listing Meal · Served · Amount · **Balance after**.

### Shop — `stores/[id]`

- Cover, logo, name, tagline, area, phone, distance chip, save star.
- Delivery line: *"Delivery ৳40 · free over ৳800"*.
- The cook's **own category tabs**, in the cook's own order.
- Product grid with stock pills; adding says *"{name} added to your basket"*
  or *"{name} added as a pre-order."*

### Product — `product/[id]`

Turns on one distinction: **on the shelf**, or **made if you ask**.

- Stock pill and category, name, price, "minimum {n}", description.
- The shop row, **Preparation**, **Delivery**, **In stock {n}**.
- Quantity stepper, running **Total**, and either **Buy now** or **Pre-order** —
  never the same button.

### Basket and checkout

| Screen | What it is |
|---|---|
| `checkout` | *SECURE CHECKOUT* — **Deliver to** (name, phone, house/road/flat, area, delivery instructions) then **Order summary**. Cash on delivery. |
| `store-checkout` | *YOUR BASKET* — one screen, no separate basket page. "Paid from your wallet, and held until the food reaches you." Shows wallet balance, *"Top up ৳{n} to place this order"*, *"৳{n} left after this order"*, and flags *"Some of this is a pre-order"*. |

### Order tracking

`order/[id]` is the full customer order view — timeline, **Delivering to**,
line items, totals, a chat launcher, and **Cancel order** (confirmed with
*Keep it* / *Cancel order*).

`meal-order/[id]`, `store-order/[id]` and `request-order/[id]` are all thin
wrappers over the shared **`OrderTracker`** — once money is held, a booked
meal, a shop basket and a haggled cake are the same object.

### Requests

| Screen | What it is |
|---|---|
| `requests/index` | *YOUR REQUESTS* — each row answers "has anyone answered, and what will it cost": *"{n} offers · ৳{low} – ৳{high}"*, *"Agreed at ৳{n} — pay to confirm"*, *"Negotiating with {who}"*. |
| `requests/new` | *Ask for something*. The top decision is reach: **Every cook who can reach you** ("{n} kitchens right now. You compare their prices") or **One cook**. Then what you want (a list you can add items to), notes, how many, budget (optional). |
| `requests/[id]` | Changes shape three times: offers coming in → one chosen → price haggled → paid. Shows a **NegotiationThread** ("How the price moved"), **Choose {who}**, **Accept ৳{n}**, **Withdraw this request**. |

### Account

| Screen | What it is |
|---|---|
| `auth` | Sign in (mobile number → six-digit code, no password) or Create account in three steps: **What brings you here?** (role), details (name, phone, email, password, kitchen name, National ID, terms), then the map pin with house/road/flat and a delivery-radius slider. |
| `edit-profile` | *EDIT PROFILE* — "Everything you gave us when you joined, yours to change." Photo (choose / camera / remove), **About you**, **How you use RannaBari**, **Default address** with a map picker. |
| `addresses` | *YOUR ADDRESSES* — "Orders go to the one marked delivering. Tap another to switch." Add, edit, **Deliver here instead**, remove (with a note that past orders keep the address they were sent to). |
| `wallet` | *YOUR WALLET* — "Meals are paid for from here, and held until the food arrives." **Available balance**, **Held for meals in progress**, preset top-up amounts plus a typed amount, then a ledger: Wallet top up · Held for {title} · Payment held · Refund. |
| `notifications` | *YOUR UPDATES* — one screen, two audiences; which list you get follows the mode you are in. **Clear** at the top. |
| `saved-shops` | *SAVED SHOPS* — "The shops you kept, in the order you kept them." |
| `become-cook` | *ELEVATE YOUR KITCHEN. OWN YOUR BUSINESS.* — Step 1 of 3: full legal name, secure phone, primary cooking location, National ID (encrypted). |
| `orders` | *YOUR ORDERS* — "Every meal you order shows up here." |

### Chat

| Screen | What it is |
|---|---|
| `chat/index` | *MESSAGES* — "Your customers, and our support desk" (cook) or "…your cook, or our support desk" (customer). Shows **Connected** / **Reconnecting…** / *"{n} waiting to send"*. |
| `chat/verify` | *VERIFY YOUR NUMBER* → *ENTER THE CODE*. In development it prints the code on screen and says so. |
| `chat/[id]` | The thread. Messages carry **Sending…** / **Not sent**. Composer: "Write a message" + **Send**. |

---

## Cook panel screens

Wrapped in `<CookScreen>` rather than `<Screen>` — same shell, cook chrome.

### Today — `(panel)/index`

- Kitchen name and state: *"{name} is taking orders."* or *"{name} is closed.
  Nothing can be ordered."*
- A prominent **open/closed switch**: "Tap to start taking orders".
- Two stat tiles: **Orders today**, **Earned today**.
- Action rows with counts: **Food requests** ("{n} waiting on you"), **Your
  shop**, **Notifications**, **Add a dish**, **Your menu**.

### Order board — `(panel)/orders`

*ORDER BOARD* — "Everything that comes through your kitchen."

Grouped into new / in progress / finished, each row with a status pill, the
customer, the amount and **Your cut**. Empty states differ by kitchen state:
*"Your kitchen is open. New orders land here first."* vs *"Your kitchen is
closed, so nothing can come in."*

### Meals — `(panel)/meals`

*YOUR MEALS* — "{n} plates confirmed for tomorrow."

A planning screen, not a catalogue: **the plate count is the largest thing on
each row**. Split into **Coming up** and **Earlier**. Status pills: confirmed ·
Cancelled · Closed · "{n} left". Primary action **Plan a meal**.

### Menu — `(panel)/menu`

*YOUR MENU* — "{live} of {total} available to order right now."

Dish rows with price and **Available today** / **Sold out** toggles. Warns
*"Your kitchen is closed, so none of this is orderable."* Empty: *"An empty
menu — Nothing listed yet. Add your first dish."*

### Shop — `(panel)/store`

*YOUR SHOP* — a hub, not a list. "Sell cakes, pitha, achar — anything you make
that keeps."

- Open/closed switch for the shop, separate from the kitchen's.
- Count tiles: **Pre-orders · Active orders · Out of stock · Released to you ·
  Held for you · Products · Categories · Pre-orderable · Completed**.
- Rows into: **Add a product · Products and stock · Categories · Pre-orders ·
  Shop orders · Shop settings · View your shop**.
- Empty: *"You have not opened a shop yet"* → **Open your shop**.

### Earnings — `(panel)/earnings`

*YOUR EARNINGS* — "You keep {pct}% of every dish you sell."

- **Meal wallet**: *Released to you* and *Held until customers confirm delivery*.
- **Cash on delivery**: *Payable to you*.
- **This week**: Food sales · Platform share ({pct}%) · **Your payout**.
- **Recent payouts** — "Payouts run every Sunday to your bank or bKash."
- Empty: *"Nothing released yet. Payment lands here when a customer confirms
  they got their meal."*

### Kitchen — `(panel)/kitchen`

*YOUR KITCHEN* — "How customers see you, and what you deliver."

Cover and profile photo (both tappable), three stats — **Rating · Live dishes ·
Delivered** — a KYC banner, then rows: **Kitchen details**, **Preview your
listing**, **Switch to ordering**, **Account details**, and log out.

### Cook detail screens

| Screen | What it is |
|---|---|
| `cook/kitchen-details` | Kitchen name, **What you cook best** (specialty picker), **About your cooking**, delivery-radius slider. "Changes reach customers immediately." |
| `cook/dish/[id]` | Add or edit a dish: photo, name, description, price in taka, **Tags** (at least one, so customers can find it), remove. |
| `cook/meal/new` | *Plan a meal*: photo, **Start from your menu**, name, description, price per plate, plates (optional — blank means no limit), **Day** (today/tomorrow), **Sitting**, **Handover** (Delivery / Collection), handover note. Date defaults to tomorrow. |
| `cook/meal/[id]` | One meal from the kitchen's side. The headline is a single number: plates confirmed. **Interested · Left · Held**, the order list, and two destructive actions — **Stop taking orders** and **Cancel this meal** (*"Cancelled. ৳{n} refunded to customers."*). |
| `cook/order/[id]` | **Customer** (with Call and **Message the customer**), **To cook**, money breakdown — Food total · Platform share · **You receive** — and **Progress**. Reject confirms with *Never mind* / *Reject this order*. |
| `cook/requests/index` | *FOOD REQUESTS* — "{n} people are looking for something you could make." Grouped **Waiting for your price · Your offers · Closed**. Shows nothing about other cooks' bids, by design. |
| `cook/requests/[id]` | Name a price, then haggle: **What would you charge?**, **How long you need**, a note, or **Just interested** / **Not interested**. Shows *your* offer only. |
| `cook/store/products` | *Products* — "Change stock here. Tap a product to edit everything else." Stock steppers inline, **In stock / On sale / Hidden** filters. |
| `cook/store/product/[id]` | Photo, name, description, price, stock, minimum, maximum, preparation time, delivery note, and the **Allow pre-orders** switch — which decides what happens when the shelf is empty. |
| `cook/store/categories` | *Categories* — "Your own shelves, in the order customers will see them." Name + icon, rename, reorder, delete, with common suggestions. |
| `cook/store/orders` | *Shop orders* — "You are paid when the customer confirms the parcel arrived." Filterable. |
| `cook/store/preorders` | *Pre-orders* — "Requests for things you were out of land here." Each shows *"৳{n} is held. Declining returns it in full."* with **Decline** / **Accept**. |
| `cook/store/settings` | Cover photo, logo, shop name, one-liner, description, phone, area picker, **Delivery fee**, **Free over** (optional). "This is the first thing a customer sees." |

---

# Part 2 — Admin panel

## Layout and UI kit

```
┌──────────────────────────┬────────────────────────────────────────┐
│ RannaBari · operations   │  Kitchens & cooks                      │
├──────────────────────────┤  ┌────────┬────────┬────────┬────────┐ │
│ OVERVIEW                 │  │ Stat   │ Stat   │ Stat   │ Stat   │ │
│   Dashboard              │  └────────┴────────┴────────┴────────┘ │
│ SUPPLY                   │  ┌──────────────────────────────────┐  │
│   Kitchens & cooks   ◀   │  │ Search · Filter · Filter         │  │
│   KYC queue              │  ├──────────────────────────────────┤  │
│   Menus & dishes         │  │ Table: rows link to detail       │  │
│   Meals                  │  │                                  │  │
│   Stores & products      │  ├──────────────────────────────────┤  │
│ DEMAND · MONEY · PLATFORM│  │ Pager                            │  │
└──────────────────────────┴──└──────────────────────────────────┘──┘
```

Every list page follows the same rhythm: **PageHeader → stat row → toolbar
(search + filters) → table → pager**. Detail pages are **stat row → cards**.

**UI kit** — `components/ui/`:

```
ActionButton  AttentionBoard  Avatar     Badge      Card       CopyCode
Empty         EmptyRow        Expandable Field      FilterSelect  GapNote
Grid          KeyValue        LinkButton Meter      Money      MoneyStat
PageHeader    Pager           RowLink    SearchBox  Sparkline  Stat
StatusBadge   SubmitButton    Table      ThemeToggle  Toolbar
```

Server components throughout, `force-dynamic`. Every page calls
`requirePage('<capability>')` — `kitchen.read`, `order.read`, `ledger.read`,
`request.read`, `config.read`. When the backend is unreachable the page renders
a **BackendDown** panel rather than an error.

---

## Overview

### `/` — Dashboard

Stats: **GMV · 30 days · Platform revenue · Held in escrow · Owed to cooks ·
Orders in flight · Kitchens open · Shops open · Open food requests**.

Cards: **Waiting on you** (the attention board) · **GMV** (sparkline) ·
**By system** · **Escrow by age** · **Live now** · **Broadcasts that reached
nobody**. An open-requests table shows Request · Area · Budget · Posted.

---

## Supply

### `/kitchens` — Kitchens & cooks

Columns: **Kitchen · Area · Status · Dishes · Orders · Lifetime GMV ·
Cancelled · Rating**. Filters: search, area, and status (*Verified · Not
verified · Open now · Suspended*).

### `/kitchens/[id]`

Stats: **Lifetime GMV · Owed to this cook · Paid to this cook · Cancellation
rate**. Cards: **Profile** (verified, open now, coordinates, eco badge, tags,
owner) · **Documents** · **Operator controls** · **Menu** · **Shop** ·
**Recent orders** · **Meals**.

### `/kyc` — KYC queue

Applications with **Owner · Phone · Email · National ID · Pinned at ·
Applied**, and a **Recent decisions** card. The gate that keeps a kitchen
invisible to customers until a person has checked an ID.

### `/menu` — Menus

"Every dish on every kitchen's menu, on one board."
Columns **Dish · Kitchen · Tags · Price · Today**; stats **Dishes matching ·
Switched off · Average price, this page**; filter *Available / Switched off*.

`/menu/[id]` adds **The dish · Where it comes from · The rest of this menu**.

### `/meals` — Meals

"Pre-booked services, by serve date and slot."
Columns **Meal · Kitchen · Serve · Slot · Price · Sold · Interest · Status ·
Actions**. Stats: **Meals matching · Open for orders · Serving today · Open
past their date**. Filters: *Today / Upcoming / Past*, *Published / Closed /
Cancelled*.

`/meals/[id]`: **Price · Seats taken · Taken so far · Marked interested**, plus
**The meal · Where and how · What the customer sees · Orders for this meal**.

### `/stores` — Stores & products

"A shop per kitchen — jars, frozen things and sweets off the shelf."
Columns **Shop · Kitchen · Area · Shelves · Products · Orders · Delivery ·
State**, and a second table for stuck stock: **Product · Shop · Price · Empty
since · Age · Set stock**. Stats: **Shops · Listed products · Stuck at zero
stock · Pre-orders waiting**.

---

## Demand

### `/orders` — Orders

"Every order across all four systems, on one rail."
Columns **Code · System · Item · Kitchen · Customer · Status · Money · Amount ·
When**. Money filter: *Held in escrow / Released / Refunded / Cash on
delivery*. Stats: **Matching orders · Money held against them · With a
dispute**.

`/orders/[id]`: **Timeline · Customer · Kitchen · Line items · Ledger entries ·
Operator actions**.

### `/chat` — Live chat

"Support, and every conversation between a customer and a cook."
Stats: **Waiting on the desk · Open support threads · Messages in 24 hours**.
Live over a WebSocket the panel relays server-side, so the operator's token
never reaches page JavaScript.

### `/requests` — Requests & offers

Columns **Request · Area · Budget · Reach · Offers · First reply · Status ·
Posted**. Stats: **Requests · Still open · Reached nobody · Fill rate** —
"Reached nobody" is the supply gap made visible.

### `/reviews` — Reviews

"Moderation, and the ratings that follow from it."
Columns **Reviewer · Kitchen · Rating · Review · Date · State · Moderate**.
Stats: **Reviews · One and two stars · Hidden · Average, visible only** — the
average counts only what is shown, so hiding a review moves the rating.

### `/search-terms` — What people looked for

"Searches that found nothing — the demand the catalogue is missing."
Columns **Term · Searches · Found nothing · People · Areas · Last searched**.
Filters *Misses only / Every search* over 7/30/90 days.
`/search-terms/[term]` re-runs the search live: **Meals · Kitchens · Dishes on
kitchen menus · Shop products**.

---

## Money

### `/ledger` — Ledger & escrow

"Append-only. A correction is a new entry in the opposite direction."

- Stats: **Customer wallets · Held in escrow · Owed to cooks · Platform
  earned**.
- **Reconciliation** card: *Account · Folded balance · Implied by entries ·
  **Drift*** — it checks itself against its own history.
- Held-money table: Order · Kitchen · Customer · Delivered · Age · Amount, with
  a **Release all** action.
- Entries table: Kind · From · To · Amount.

`/ledger/[id]`: **The entry · What it refers to · Everything posted against
this order · The order**.

### `/payouts` — Payouts

"Batching what cooks are owed, and paying it."
**Owed to cooks right now** (Kitchen · Area · Owed) and **Runs**. Stats: **Due
this run · Carried forward · Paid all time · Runs**.

`/payouts/[id]`: **Run total · Lines add up to · Posted to the ledger ·
State**, then per-cook lines and the ledger entries the run wrote — a run is
reconciled against its own postings.

### `/topups` — Top-up reconciliation

"Wallet credits, against the payments that should be behind them."
Columns **Customer · Credited · Method · State · PSP reference · When ·
Reconcile**. Filters: *Orphans / Disagreements / Matched*. Stats: **Credited
all time · Matched · No payment behind them · Amount disagrees**.

### `/disputes` — Disputes

"Where the app stops and a person has to decide."
Stats: **Open cases · Money contested · Resolved**.
`/disputes/[id]`: **Why it was raised · The dispute · Resolution · The order it
is about · Case notes · Every taka on this order**, with **Order value** and
**Money state**.

---

## Platform

### `/settings` — Configuration

"Everything here used to be a constant inside the mobile bundle."
Cards: **Fees · Commission · Timings · Feature flags · Zones · Platform
categories**.

### `/notifications` — Notifications

"What the platform has told people, and a way to tell them something."
**Compose a broadcast** plus a sent log: Audience · Kind · Title · Read · From ·
When. Stats: **Notifications on file · Unread by customers · Unread by cooks**.

### `/admins` — Admin users

"Who can operate this panel, and what each of them may do."
Columns **Operator · Role · State · Last signed in · Audit rows · Actions**,
plus **Add an operator** and **What each role may do**.

`/admins/[id]`: **The account · Most-used actions · Recent actions**, with
**Actions recorded · Last signed in · Two-factor**.

### `/audit` — Audit log

"Every state-changing action in this panel, with a before and an after."
Columns **When · Operator · Action · Target · Summary · Diff**. Stats: **Rows
on file · Money actions · In the last 24 hours**. Filter: *Money only*.

`/audit/[id]` shows a field-level diff: **Field · Before · After**, plus **Who ·
What · What changed · Else done to this target**.

---

## Patterns worth knowing

**Empty states carry the next step.** Never a bare "No results" — each names
why it is empty and offers the action: *"Cooks near you have not opened a shop
yet. If you cook, yours can be the first."*

**Two actions of different weight never look alike.** On a meal, *Interested*
is a quiet outline and *Confirm order* is solid, because one is free and
reversible and the other moves money.

**Money language is exact.** *Held*, *Released*, *Refunded* and *Payable* are
distinct words used consistently in both the app and the console, because they
are distinct states in the ledger.

**Destructive actions confirm in the user's words.** *Stop taking orders?* ·
*Cancel this meal?* · *Remove {label}?* — with the consequence spelled out
("Cancelled. ৳{n} refunded to customers.") and a benign escape (*Never mind*,
*Keep it*, *Move on*).

**A cook is never shown a competitor's price.** The request board deliberately
omits other offers so a cook prices the work, not the auction.

**The console reconciles rather than reports.** Ledger drift, payout lines
against ledger entries, and top-ups against PSP records — three places where a
page checks the system against itself instead of restating it.
