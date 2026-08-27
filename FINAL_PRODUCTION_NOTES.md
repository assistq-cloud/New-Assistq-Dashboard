# AssistQ Production Notes — corrected build

## Railway
- Set `DATABASE_URL` from the Railway PostgreSQL service.
- Set `APP_BASE_URL=https://assistq.in` (or the actual public Railway custom domain used by the dashboard).
- Set a strong `ADMIN_PASSWORD`, `SESSION_SECRET` (32+ chars), and `WEBHOOK_SECRET` (16+ chars).
- Keep Google OAuth, SMTP and WhatsApp credentials in Railway Variables only.

## Chatbot
The client chatbot now supports URL configuration:
- `?clientId=<client-id>`
- `&dashboardUrl=https://assistq.in`
- `&webhookUrl=<Apps-Script-/exec-URL>` (optional if the default URL is correct)

Example:
`chatbot.html?clientId=demo-realty&dashboardUrl=https%3A%2F%2Fassistq.in`

Do not put Railway secrets into chatbot HTML.

## Apps Script
Replace the old Apps Script with `ASSISTQ_AppsScript_MULTI_CLIENT_v8.js` from this build and deploy it as a Web App (execute as owner, accessible to anyone who needs to submit the public chatbot request). Keep the same deployment URL if possible.

Set Script Properties:
- `ASSISTQ_DASHBOARD_URL=https://assistq.in`
- `ANTHROPIC_API_KEY=<your key>`
- `ASSISTQ_CLAUDE_MODEL=claude-sonnet-5` (optional; this is already the default)

Run `createWeeklyTrigger()` once if you want the Sunday weekly funnel email from Apps Script. The function is idempotent in this corrected build, so rerunning it will not create duplicate weekly triggers.

## Database
The live application stores its current AssistQ state in the `assistq_store` JSONB table through `db.js`. Do **not** run `real_estate_phase_final/FINAL_PHASE_SCHEMA.sql` blindly against the current database; that SQL is an architectural reference for future normalized migrations and its BIGINT IDs do not match the current JSON-store implementation.
