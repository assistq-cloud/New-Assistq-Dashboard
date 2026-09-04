# 2026-09-05 — Per-client Google integration isolation

## What changed
- Every client can now store its own Google Apps Script Web App `/exec` webhook URL.
- Every client can store its own Google Spreadsheet ID.
- Every client keeps its own report/login email, business name and WhatsApp number.
- Optional per-client webhook secret is supported.
- `/api/chatbot` now selects the Apps Script webhook from the requested client record; there is no shared production webhook fallback.
- The server forwards that client's business name, email, WhatsApp, assistant profile, custom fields, scoring rules and Spreadsheet ID to its webhook.
- Apps Script no longer calls `/api/public/client-config` on AssistQ. This removes the old Apps Script -> AssistQ network dependency that produced "Adres niet beschikbaar".
- Apps Script uses its own per-client Script Properties and/or the Spreadsheet ID supplied by AssistQ.
- Weekly reports use the client script's own Spreadsheet and notification email.
- Client settings no longer mutate global AssistQ settings when one client changes its business name or email.
- Non-admin dashboard responses no longer expose Apps Script URLs, Spreadsheet IDs, webhook secrets or access codes.
- Admin-only Clients UI now shows Google integration status and lets the admin configure the webhook, Sheet ID and optional secret.
- Personalized landing pages and the existing chatbot fixes are preserved.

## Required onboarding
For each client, deploy a separate Apps Script Web App and give that client a separate Google Sheet. Then configure the `/exec` URL and Spreadsheet ID under Admin -> Clients in AssistQ.
