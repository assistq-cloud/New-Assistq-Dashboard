# What was added — Aug 30, 2026 (round 2)

Since there are no live clients yet, this round prioritized features that (a)
need no external account/approval to be fully usable today, and (b) map to
what actual Indian real-estate CRM comparisons (Leadrat, Realatic, Leeado,
Smartx) name as baseline requirements — portal auto-capture, a real WhatsApp
inbox, and duplicate control. `node --check` passes on every edited file;
every helper function referenced was verified to resolve to exactly one
definition.

## 1. Duplicate lead detection + one-click merge

New leads are checked against existing leads for the same client on last-10
phone digits or email. A match doesn't block or silently combine anything —
it tags the new lead `possibleDuplicateOf`, shows a **DUPLICATE?** badge in
the Leads table, and a **Merge into that lead** button in the lead detail
panel. Merging moves the duplicate's site visits, follow-ups, documents and
commissions onto the original, fills any blank fields, appends notes, and
hides the duplicate from active views — it stays in the database, just
flagged `mergedInto`, for audit purposes. Nothing is ever deleted.

**Setup:** none — active immediately for every new lead.

## 2. Universal portal/Meta lead-import endpoint

`POST /api/leads/import` (protected by `WEBHOOK_SECRET`, same as the
existing `/api/leads` bridge) accepts a raw payload plus a `source` label
and normalises the field-name variants that 99acres, MagicBricks,
Housing.com, NoBroker, and Meta/Instagram Lead Ads actually send
(`name`/`full_name`/`contact_name`, `phone`/`mobile`/`contact_number`, etc.)
into ASSISTQ's lead schema — then runs it through the exact same
scoring/pipeline/automation path as a chatbot lead. This was the single
most-cited "must-have" across every CRM comparison researched.

**Setup (when you get your first client):** point that portal's
Zapier/Make webhook, or Meta's Lead Ads webhook subscription, at
`https://yourdomain/api/leads/import?clientId=<theirId>&source=99acres`
with the `WEBHOOK_SECRET` header. No per-portal code changes needed.

## 3. WhatsApp Inbox — real two-way conversations

Incoming WhatsApp replies used to only get flattened into the general
activity feed as a one-line log entry — there was no actual conversation
view, which is a baseline expectation for "WhatsApp CRM." Added:
- A per-contact thread store (`s.whatsappThreads`), capped at 200 messages,
  auto-linked to a matching lead by phone number.
- A new **WhatsApp Inbox** page: conversation list on the left (unread
  badge, last message preview), full thread + reply box on the right.
- Automated follow-ups and manual template sends now also log into the
  same thread, so it's the complete picture — not just inbound.
- Free-text replies are only offered within WhatsApp's real 24-hour
  customer-service window after the contact's last message (checked
  server-side); outside that window the UI tells staff to use an approved
  template instead, matching Meta's actual policy rather than pretending
  free text always works.

**Setup:** none beyond the WhatsApp Cloud API credentials already documented
— works with the same `WA_PHONE_NUMBER_ID` / `WA_ACCESS_TOKEN` from the
previous round.

## Nothing removed

All three are additive: existing leads without a duplicate match are
unaffected, `/api/leads` (the original bridge) is untouched by the new
`/api/leads/import`, and the activity feed still logs everything it did
before — the inbox supplements it with a proper thread view.
