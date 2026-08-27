# Production Security Checklist

- [ ] All real credentials are deployment secrets, never committed.
- [ ] Tenant/client authorization is enforced server-side on every endpoint.
- [ ] Webhook signatures are verified for Meta and WhatsApp.
- [ ] External event IDs are idempotent/deduplicated.
- [ ] Rate limits are enabled on public webhooks.
- [ ] Lead PII is minimized in application logs.
- [ ] Database backups are enabled.
- [ ] HTTPS is enforced.
- [ ] OAuth refresh tokens are encrypted at rest.
- [ ] Admin actions are audit logged.
- [ ] Client exports require authorization.
- [ ] RERA checker is presented as QA, not legal advice.
- [ ] Portal integrations use authorized APIs/imports only.
- [ ] WhatsApp templates are approved before production sends.
