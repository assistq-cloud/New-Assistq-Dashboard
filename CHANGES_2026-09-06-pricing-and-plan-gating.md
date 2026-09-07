# Changes — 2026-09-06: New pricing + plan-scoped dashboard

## What changed and why

### 1. Pricing updated (server.js — PLAN_CATALOG)
| Plan | Old setup / monthly | New setup / monthly |
|---|---|---|
| Starter | ₹1,999 / ₹999 | ₹4,999 / ₹2,999 |
| Growth | ₹2,999 / ₹3,499 | ₹9,999 / ₹6,999 |
| Premium | ₹4,999 / ₹6,999 | ₹19,999 / ₹14,999 |

Note: your Razorpay Plan IDs (RAZORPAY_PLAN_STARTER/GROWTH/PREMIUM) are prices
set *inside Razorpay itself*, not in this code. You must update the amount on
each corresponding Plan in your Razorpay Dashboard to match, or checkout will
still charge the old amounts. This code only decides which Razorpay Plan ID
to use and what the one-time setup addon costs — the recurring amount comes
from Razorpay's own Plan object.

### 2. Starter now gets a real (scoped) dashboard
Previously, Starter clients were blocked from logging into the dashboard
entirely (leads only went out via WhatsApp/email). This is now changed:
Starter clients can log in and see: Overview, Leads, Real Estate pipeline
view, Conversations, My Plan, and Settings. They do NOT see (and the backend
still independently blocks): SEO/Keywords/UTM reporting, multi-portal
integrations, Site Visits, Documents, Testimonials, Team, Automation,
Commissions, or Possession tracking — those stay Growth/Premium as before.

### 3. New "My Plan" page (public/app.js, public/index.html)
Every client (any plan) now has a "My Plan" nav item showing a checklist of
every feature in the system, a checkmark for what's included in their plan,
and a lock icon + which plan unlocks it otherwise. Backed by a new
`planMatrix` field returned from `/api/state`, built by `buildPlanMatrix()`
in server.js from the single `PLAN_FEATURE_CATALOG` list — so if you add or
move a feature between plans later, update that one list and both the
gating logic and this page stay in sync.

### 4. Starter is now limited to one connected property portal
`/api/integrations/portal` now rejects adding a *second* portal
(99acres/MagicBricks/Housing/NoBroker) on Starter — matches "one portal via
email/CSV import" on the pricing page. Growth/Premium are unaffected
(unlimited, as before). Editing an already-connected portal is still always
allowed.

### 5. AI Voice Receptionist — explicitly NOT sold yet
Added to the My Plan feature list as "coming soon — not yet available on any
plan," matching reality: there is still no telephony/voice provider wired
into this codebase (no Twilio/Vapi/Retell/etc. in package.json). Don't quote
this to a client as a paid line item until it's actually built.

## 2026-09-06 (update 2): Premium re-priced + Foundation Offer added

- **Premium**: setup fee changed 19,999 → **4,999**; monthly changed 14,999 → **11,999**.
- **Foundation Offer** (server.js — `FOUNDATION_OFFER`, `foundationOfferStatus()`): 50% off
  the one-time setup fee, automatically applied to the first 5 clients on
  each plan. Monthly price is never discounted. Once a plan's 5th client
  signs up, the offer silently stops applying to new checkouts on that plan
  — no manual toggle needed. Applied automatically inside
  `/api/billing/create-subscription`, so the discount is real (charged
  amount), not just a marketing label.
- New public endpoint `GET /api/public/plans` — returns live pricing and
  remaining founding slots per plan, for any future pricing page or for
  quoting a prospect accurately without checking the code.
- "My Plan" dashboard page now shows a green Foundation Offer banner with
  remaining slots when the logged-in client's plan still has some.

1. Update the three Razorpay Plan objects' recurring amounts to match the
   new prices above (Razorpay Dashboard → Subscriptions → Plans).
2. Redeploy to Railway (push this code, or manually copy `server.js`,
   `public/app.js`, and `public/index.html` into your existing repo).
3. Since you have zero live clients right now, there's no migration risk —
   this only affects checkouts and dashboard logins from this point forward.

## 2026-09-07: Setup fees lowered per owner decision
- Starter setup: 4,999 → **2,299**
- Growth setup: 9,999 → **3,999**
- Premium setup: 4,999 → **4,499**
- Monthly prices unchanged (2,999 / 6,999 / 11,999).
- Foundation Offer (50% off setup, first 5 clients/plan) recalculates
  automatically from these new numbers — founding-slot setup fees are now
  ₹1,150 / ₹2,000 / ₹2,250.

## 2026-09-07 (update 2): Foundation Offer reduced from 50% to 20% off
- `FOUNDATION_OFFER.discountPercent` changed 50 → 20 (server.js).
- New founding-slot setup fees (first 5 clients/plan): Starter ₹1,839,
  Growth ₹3,199, Premium ₹3,599 (20% off the ₹2,299 / ₹3,999 / ₹4,499
  standard setup fees).

## 2026-09-07 (update 3): Foundation Offer set to 15% off
- `FOUNDATION_OFFER.discountPercent` changed 20 → 15 (server.js).
- New founding-slot setup fees (first 5 clients/plan): Starter ₹1,954,
  Growth ₹3,399, Premium ₹3,824 (15% off the ₹2,299 / ₹3,999 / ₹4,499
  standard setup fees).
