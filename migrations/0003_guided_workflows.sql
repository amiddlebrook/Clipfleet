-- Per-campaign workflow; information is operator-attested unless inferred from jobs/profiles.
CREATE TABLE IF NOT EXISTS campaign_workflows (
  campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id),
  state TEXT NOT NULL DEFAULT '{}',
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS campaign_workflow_events (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS campaign_workflow_events_recent ON campaign_workflow_events(campaign_id,created_at DESC);
