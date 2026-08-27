-- AssistQ Real Estate Final Phase: additive schema reference
-- Adapt names/types to the existing project's migrations before production deployment.

CREATE TABLE IF NOT EXISTS integration_connections (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL,
  provider VARCHAR(80) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'disconnected',
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id, provider)
);

CREATE TABLE IF NOT EXISTS lead_followup_jobs (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL,
  lead_id BIGINT NOT NULL,
  job_type VARCHAR(80) NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'queued',
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_escalations (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL,
  lead_id BIGINT NOT NULL,
  level INTEGER NOT NULL,
  reason TEXT NOT NULL,
  escalated_to VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS site_visit_slots (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL,
  project_id BIGINT,
  salesperson_id BIGINT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'available'
);

CREATE TABLE IF NOT EXISTS site_visits (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL,
  lead_id BIGINT NOT NULL,
  project_id BIGINT,
  salesperson_id BIGINT,
  slot_id BIGINT,
  status VARCHAR(40) NOT NULL DEFAULT 'scheduled',
  scheduled_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_units (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL,
  project_id BIGINT NOT NULL,
  unit_code VARCHAR(100) NOT NULL,
  property_type VARCHAR(80),
  bedrooms INTEGER,
  price NUMERIC(16,2),
  location VARCHAR(180),
  possession VARCHAR(80),
  status VARCHAR(30) NOT NULL DEFAULT 'available',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(client_id, unit_code)
);

CREATE TABLE IF NOT EXISTS marketing_spend_daily (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL,
  source VARCHAR(80) NOT NULL,
  campaign_id VARCHAR(180),
  spend_date DATE NOT NULL,
  spend NUMERIC(16,2) NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(client_id, source, campaign_id, spend_date)
);

CREATE TABLE IF NOT EXISTS channel_partners (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL,
  name VARCHAR(180) NOT NULL,
  contact VARCHAR(180),
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL,
  actor_id BIGINT,
  event_type VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80),
  entity_id BIGINT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
