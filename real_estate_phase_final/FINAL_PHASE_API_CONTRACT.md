# AssistQ Final Phase API Contract

All endpoints must enforce client/tenant authorization from the authenticated session.
Never trust client_id supplied by the browser.

## Leads
GET  /api/real-estate/leads
PATCH /api/real-estate/leads/:id/stage
POST /api/real-estate/leads/:id/assign
POST /api/real-estate/leads/:id/escalate
GET  /api/real-estate/leads/:id/timeline

## Site visits
GET  /api/real-estate/site-visits
POST /api/real-estate/site-visits
PATCH /api/real-estate/site-visits/:id
POST /api/real-estate/site-visits/:id/reschedule

## Inventory
GET  /api/real-estate/projects
POST /api/real-estate/projects
GET  /api/real-estate/inventory
POST /api/real-estate/inventory
POST /api/real-estate/inventory/match

## Automation
GET  /api/real-estate/automation/rules
PUT  /api/real-estate/automation/rules
GET  /api/real-estate/followups
POST /api/real-estate/followups/test

## Integrations
GET  /api/integrations
POST /api/integrations/:provider/connect
POST /api/integrations/:provider/disconnect
POST /api/integrations/meta/webhook
GET  /api/integrations/whatsapp/webhook
POST /api/integrations/whatsapp/webhook

## Analytics
GET /api/real-estate/analytics/funnel
GET /api/real-estate/analytics/roi
GET /api/real-estate/analytics/sales-team
GET /api/real-estate/analytics/projects

## Reports
GET /api/real-estate/reports/weekly
POST /api/real-estate/reports/weekly/send
