# RannaBari — Verified Feature Inventory

Each feature is either **seen** (visible on a captured screen, file named) or **code/docs**
(documented in `AGENTS.md`, the landing page, or the source, but not shown in a screenshot).
Marketing importance: ★★★ headline, ★★ supporting, ★ footnote.

## Core features

| Feature | What it does | Why it matters | Page | Evidence | Marketing |
|---|---|---|---|---|---|
| Home-kitchen ordering | Browse verified home kitchens and order cooked-to-order meals | The core product | Home, Browse, Kitchen page | seen: c01, c02, c08 | ★★★ |
| Map discovery | Kitchens clustered on a Dhaka map with search and "Open now" filter | Find food near you | Map | seen: c03 | ★★★ |
| Monthly meals | Choose days and meals from a cook's published month, pay once, confirm each meal | Predictable daily food, no rigid subscription | Meals | seen: c04, k06 | ★★★ |
| Pantry shops | Buy achar, pitha, jorda and other goods from a cook's own shop | A second revenue line for cooks, more choice for customers | Shops, Shop page | seen: c05, c10 | ★★ |
| Wallet and held payment | Pay from a wallet; money is held and released to the cook after you confirm delivery | Trust between strangers | Wallet, Order tracking | seen: c11, c13 | ★★★ |
| Order tracking | Timeline: confirmed → preparing → ready → out for delivery → delivered | Visibility | Order page | seen: c13 | ★★ |
| Ratings and reviews | 1–5 rating and reviews after delivery | Social proof | Kitchen page, cook Reviews | seen: c08, k07 | ★★ |
| Food requests | Ask for something nobody has listed and let cooks respond | Custom orders | Requests | seen: c16, k11 | ★★ |

## Advanced features

| Feature | What it does | Page | Evidence | Marketing |
|---|---|---|---|---|
| Two businesses per cook | Kitchen and shop are separate, each with its own shutter, stats and 7-day trend (up to 5 shops) | Cook Dashboard | seen: k01, k10 | ★★★ |
| Monthly menu calendar | Cook publishes a month calendar; today's plates and bookings | Meal hub, Meal plan | seen: k06, k09 | ★★ |
| Cook earnings view | Released vs held money, share per order, recent-order totals | Earnings | seen: k05 | ★★ |
| Payout destination | Cook sets bKash or bank account used for payout runs | Cook Profile | code/docs | ★ |
| Mess meal management | Shared meal rooms: meals, bazar, money, reports, month closing | Meal Management | seen: c15 (landing screen only) | ★★ |
| Chat with the cook | Ask about a dish, agree a custom order | Chat | code/docs, landing page | ★★ |

## User experience features

| Feature | Detail | Evidence | Marketing |
|---|---|---|---|
| English and Bengali | One-tap language switch; every string translatable | seen: language button on all app screens | ★★★ |
| Dark mode | Theme toggle in the app and admin console | seen: moon icon on screens | ★★ |
| Floating tab bar | Pill-shaped navigation for both customer and cook modes | seen: c01, k01 | ★ |
| Live notifications | Badge counts for updates and pending deliveries | seen: c01, k01 | ★ |
| Cook setup wizards | Step-by-step kitchen and shop setup, photo-first dish editor | seen: k08, k12 | ★★ |

## Admin / management features

| Feature | Detail | Evidence |
|---|---|---|
| Operator console | One desk for kitchens, orders, ledger, payouts, disputes, refunds, top-ups, reviews, promotions, meal plans, coverage, chat, notifications, settings | code: `admin Panel Next.js/app/(dash)`; seen: d00 (login) and d01–d12 where captured |
| KYC queue | Review cook NID documents and approve or reject | code/docs; d02 |
| Role-based access | Superadmin, operations, finance, support see different tools | seen: d00 |
| Settings | Fees, zones/areas, categories configurable by operators | code/docs |
| Audit log | Operator actions recorded | code: `/audit` |

## Automation / integration features

| Feature | Detail | Evidence |
|---|---|---|
| Email OTP for cooks | Verification code by email (SMTP); resend cooldown | docs |
| Phone OTP for customers | Code by SMS (provider-configurable) | docs |
| Auto-release of held money | Escrow release window is configurable (3 days by default config) | seen in `/config` response |
| Real-time chat | WebSocket fan-out; HTTP polling fallback on serverless | docs |
| Payout runs | Operators pay cooks in batches | docs |

## Security and privacy features

| Feature | Detail | Evidence | Marketing |
|---|---|---|---|
| Identity-checked cooks | NID + kitchen photos reviewed by a person; unverified kitchens cannot trade | landing page, docs | ★★★ |
| Append-only ledger | Money records cannot be edited; corrections are new entries | docs, login page copy (d00) | ★★★ |
| Held payments | Cook is paid only after the customer confirms receipt | seen: c13 | ★★★ |
| Separate auth realms | An admin token never opens an app endpoint and vice versa | docs | ★ |
| Revocable sessions | Sessions can be revoked; a version bump signs a device out everywhere | docs | ★ |
| TOTP for operators | Authenticator code when the account has one | seen: d00 | ★ |
| NID privacy | NID documents are visible to operators only, never to customers | docs | ★★ |

## Not claimed
No statistics, testimonials or integrations beyond those above are used. The figures that
appear in screenshots (earnings, order counts, ratings) are demo seed data and are not
presented as real results.
