# AssistQ v8 — Unified Lead Hub

## What changed
AssistQ can now treat the dashboard as the central lead hub for each client.

Lead sources supported by the built-in architecture:
- AssistQ chatbot
- Existing website contact forms
- Client landing pages
- WhatsApp-originated leads (via an official API/middleware connection)
- Meta/Facebook/Instagram lead forms
- Google Ads lead forms
- Property portals and other sources
- Make/Zapier/custom backends
- Offline/manual leads
- CSV import remains available through the existing trusted import path

## Universal client webhook
Each client receives a separate token-protected endpoint:
`POST /api/inbound/<clientId>`

Send the token as `X-AssistQ-Token`.

The endpoint normalizes common field names and sends the lead through the same AssistQ engine as chatbot leads. This means:
- client isolation
- duplicate detection
- lead scoring
- UTM/source attribution
- area-based salesperson routing
- follow-up seeding
- pipeline stages
- dashboard visibility

## Offline leads
Owners and salespeople can use Integrations Hub → Add offline lead. Manual leads enter the exact same pipeline.

## Security
- Integration credentials/tokens are not placed in public chatbot code.
- Each client has a separate token.
- Integration management is restricted to the client owner/admin; staff cannot retrieve the integration token.
- Regenerating a token invalidates the old token.
- Public browser chatbot routes remain rate-limited and client-scoped.

## Important connection rule
AssistQ cannot automatically read a client's Meta, Google, WhatsApp, portal, or existing CRM account merely from a website URL. The client/developer must authorize/connect the relevant provider or point that provider's webhook/API/middleware to the client's AssistQ endpoint.
