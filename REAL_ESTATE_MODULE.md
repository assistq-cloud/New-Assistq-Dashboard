# ASSISTQ Real Estate Conversion Engine v2

This build extends the existing ASSISTQ lead, SEO, GA4, GSC, UTM and client-dashboard platform into a real-estate lead-to-booking system.

## Existing foundation retained
- Client login and client-specific workspace
- AI chatbot configuration
- Lead qualification and Hot/Warm/Cold scoring
- UTM/source tracking
- Google Search Console + GA4 integration
- SEO audit + keyword tracking
- PostgreSQL persistence

## Real-estate sales layer
- Lead pipeline: New → Qualified → Contacted → Interested → Site Visit Scheduled → Site Visit Completed → Negotiation → Booking → Lost
- Automatic lead assignment by sales-area match
- Sales team records and performance dashboard
- Site visit scheduling and status tracking
- Projects and unit inventory
- Lead activity timeline
- Follow-up queue
- Missed-lead and escalation detection
- Automation rules for assignment and follow-up queue creation
- Marketing spend records
- CPL / CPQL / CPSV / CPB reporting
- Channel partner management
- Inventory matching endpoint for qualified leads
- Maharashtra RERA marketing-material QA checklist

## WhatsApp Cloud API bridge
The project now includes an official WhatsApp Cloud API bridge:
- Connection/status screen
- Approved template test sender
- Webhook verification endpoint
- Incoming webhook activity capture
- Signature verification when `WA_APP_SECRET` is configured

Meta's Cloud API requires a WhatsApp Business Account, business phone number and access token. Approved message templates are required for template sends. See Meta's official Cloud API documentation for setup and template requirements.

### Environment variables
Add these to production `.env`:

```text
WA_PHONE_NUMBER_ID=
WA_ACCESS_TOKEN=
WA_VERIFY_TOKEN=
WA_APP_SECRET=
WA_API_VERSION=v23.0
```

The access token is intentionally kept in environment configuration rather than the client database.

## Important WhatsApp limitation
The automation engine creates and queues follow-ups. Actual unattended WhatsApp delivery requires the configured Cloud API and approved templates. Without those credentials, AssistQ must use click-to-chat/manual WhatsApp actions instead of pretending that messages were sent automatically.

## RERA QA limitation
The RERA checker is a marketing-material QA checklist. It is not legal advice and does not certify regulatory compliance. Current MahaRERA requirements should always be verified before publishing.

## Recommended production roadmap
1. WhatsApp Cloud API onboarding / Embedded Signup
2. Meta Lead Ads webhook + lead retrieval
3. Google Ads cost ingestion
4. Calendar integration for site visits
5. Official portal/API or export integrations where available
6. Inventory-aware chatbot recommendations
7. NRI/virtual consultation workflow
8. Channel-partner lead ownership and commission tracking
9. Advanced revenue reports and client-facing weekly sales alerts
