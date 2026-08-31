# Added — Aug 31, 2026: individual staff logins + real accountability

This is the fix for the "mid-level business" gap identified earlier: every
client used to share exactly one login across their whole team, with no
individual accountability. Built as a real, enforced role — not just a UI
toggle — since the whole point is that a mid-size team can trust who did
what.

## What changed

**Three session roles now, not two.** `admin` (you) and `client` (the
business owner — unchanged, full access) already existed. New: `staff` — an
individual salesperson, logged in with their own email/password, set up by
the owner from the Team page.

**Staff logins are scoped to their own leads, enforced server-side.**
`GET /api/realestate/leads`, the lead detail PATCH, visit scheduling, and
visit status changes all check `staffScope()` and reject (403) any attempt
to touch a lead not assigned to that rep — this isn't hidden-in-the-UI-only,
a staff session hitting the API directly gets blocked the same way.

**Staff logins are locked out of management/financial endpoints,
server-side.** Team management (add/remove/set logins), automation
configuration, commissions, marketing spend/ROI, channel partners, and
business/chatbot settings all now reject staff sessions via a shared
`requireOwner()` check (or an inline equivalent on the two routes that
didn't already have a try/catch to hang it off of). Reassigning a lead to a
different rep is also owner-only now, for the same reason.

**The activity feed now names who actually did something.** `activity()`
takes an optional actor name and appends "— by [Name]" to the log line for
lead-stage changes, visit scheduling/status changes, assignments, and
automation config changes. Automated/system events (webhooks, the
automation engine) still log without an actor, since there isn't a human to
attribute them to.

**Team page rebuilt** to actually manage this: each salesperson card shows
whether they have an individual login, an "Set up login" button (owner
enters/confirms their email, gets a generated password shown exactly once —
same pattern as a client's access code), and "Revoke login" to cut a
former team member off immediately. "Remove salesperson" is also new — it
wasn't wired to any button before either.

## What this doesn't change

- Client (owner) and admin logins work exactly as before — this is
  additive, not a breaking change to existing accounts.
- Individual staff logins require the Premium plan (same tier team
  management already required) — a Growth client's shared login is
  unaffected.
- No staff login exists until an owner explicitly sets one up — nothing
  changes for any current client until they use the new Team page feature.

## Setup required

None to enable the capability — it's live. Per salesperson: owner opens
Team page → "Set up login" → enters the rep's email → shares the generated
password with them once. That's it; the rep can then log in at the normal
login page with their own credentials and sees only their own leads.

## Honest scope note

This does not add per-branch/office hierarchy, granular custom permission
levels beyond owner-vs-staff, or a UI for staff to change their own
password (that still requires the owner to revoke and re-issue a login).
Those would be reasonable next steps for a genuinely large, multi-branch
client, but weren't part of this fix — this specifically closes the "shared
password across the whole team" accountability gap, which was the concrete
problem identified.

## Verified

`node --check` passes on both `server.js` and `public/app.js`. Every helper
function referenced (`requireOwner`, `staffScope`, `actorName`,
`hashPassword`, `verifyPassword`) resolves to exactly one definition.
