# AssistQ Real Estate — Final Phase Module Pack

This pack completes the product architecture for the final phase. It is additive:
existing AssistQ modules are preserved.

## Included modules

1. Meta Lead Ads connector contract + webhook adapter
2. Google Ads attribution/cost import contract
3. Calendar/site-visit scheduling service contract
4. WhatsApp Cloud API automation service contract
5. Automated follow-up sequence engine
6. Inventory-aware property matching
7. NRI / virtual consultation workflow
8. Lead escalation rules
9. Revenue and booking reports
10. Weekly client/sales-manager reporting
11. Channel-partner workflow
12. Portal-import adapter contracts
13. RERA marketing QA checklist
14. Client integration/configuration model
15. Production security checklist

## Important

External platforms require client-owned credentials, approved WhatsApp templates,
OAuth/API permissions, and sometimes partner approval. This pack therefore includes
provider-neutral adapters and configuration contracts instead of embedding credentials
or pretending external integrations are active without credentials.

Use the existing database/API conventions in the project when wiring these adapters
into the running server.
