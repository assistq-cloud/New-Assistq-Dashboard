# REAL ESTATE TERRITORY ASSIGNMENT — 2026-09-05

## What changed

AssistQ now routes real-estate leads using geographic territory hierarchy instead of only literal text matches.

### Example
- Salesperson territory: `Pune`
- Prospect location: `Kharadi`
- Result: lead is assigned to the Pune salesperson.

Specific locality assignments take priority over a parent city:
- Rep A: `Pune`
- Rep B: `Kharadi`
- Lead: `Kharadi, Pune`
- Result: Rep B (Kharadi specialist)

### Supported territory groups
The routing dictionary includes common real-estate locations for Pune, Mumbai, Navi Mumbai, Thane, Bengaluru, Hyderabad, Delhi, Gurgaon/Gurugram, Noida, Chennai, Ahmedabad, Kolkata, Jaipur and Goa. Directly entering an exact locality is also supported.

### Fallback
If a location is genuinely unknown/unmapped, the system uses round-robin assignment so one salesperson does not silently receive every unmatched lead.

### Dashboard visibility
The Leads table now shows:
- Prospect location
- Assigned salesperson
- Salesperson's configured territories

The Lead Detail view also shows the assigned salesperson, and the pipeline cards show ownership.

### Existing leads
Sales Team now has a `Route unassigned leads` action. This applies the same territory engine to existing unassigned leads after the team has been configured.

## Files changed
- `server.js`
- `public/app.js`
