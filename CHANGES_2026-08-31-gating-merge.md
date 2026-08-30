# Merged — Aug 31, 2026: server-side plan gating

Merged `ASSISTQ_v16_FULL_GATING.zip` into the accumulated build (WhatsApp
automation, duplicate detection, portal import, WhatsApp inbox, schedule-visit
fix). That zip's changes were 100% contained in `server.js` — `public/app.js`,
`public/index.html`, and `.env.example` in it were byte-identical to the
original baseline, so nothing needed reconciling on the frontend.

## What it adds

**Real server-side enforcement, not just cosmetic UI hiding.** Before this,
`allowedPages()` in the dashboard just hid nav links based on plan — but
nothing stopped a Starter or Growth client's browser from calling a
Premium-only API endpoint directly (e.g. `POST /api/realestate/team`) and
getting the feature anyway. Now every one of these endpoints checks the
client's actual plan server-side and returns 403 if they don't have access,
regardless of how the request was made:

- **Growth+**: site visits, document vault, testimonials
- **Premium only**: sales team management/auto-assignment, the automation
  engine (missed-lead alerts, escalation, drip follow-ups — including the
  WhatsApp auto-send path from the previous round, which I extended to use
  the same gate), broker commissions, possession/post-sale tracking

The agency's own admin login always bypasses these gates — this only
restricts a *client's* dashboard session to their paid tier.

**Bug fix: automation settings are now genuinely per-client.** They used to
live in one shared object (`s.realEstate.automation`) — meaning every
Premium client's missed-lead timing, escalation timing, and follow-up
sequence were actually the same shared configuration; changing one client's
rules silently changed everyone's. Now each client gets their own config
(`s.realEstate.automationByClient`), seeded from the old shared template
the first time they need one.

**New: booking auto-starts possession tracking.** When a lead's pipeline
stage is moved to `BOOKING`, if the client's plan includes possession
tracking, a tracker record is created automatically instead of requiring a
separate manual step on the Possession Tracker page.

## How it was merged

Several of the functions this touched (`autoAssignLead`, `processRealEstateAutomation`)
had already been modified in earlier rounds — most notably `processRealEstateAutomation`,
which now also handles automated WhatsApp dispatch. Rather than a blind
patch apply, each change was merged by hand into the current version of
each function, and the same plan gate was additionally applied to the
WhatsApp auto-send loop (a code path that didn't exist yet when the gating
version was written), so automated WhatsApp follow-ups are correctly
Premium-gated too, not just the queueing step.

Verified after merge: `node --check` passes on every file, every helper
function referenced resolves to exactly one definition, no duplicates.
