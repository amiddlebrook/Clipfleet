-- Grok Bot handoff ledger: no secrets, no auto-payout claims.
CREATE TABLE IF NOT EXISTS bot_tasks (
 id TEXT PRIMARY KEY,
 job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id),
 campaign_id TEXT NOT NULL REFERENCES campaigns(id),
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','dispatching','accepted','reported','blocked','failed')),
 reported_action TEXT,
 note TEXT NOT NULL DEFAULT '',
 published_url TEXT,
 webhook_http_status INTEGER,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 4),
 queued_at TEXT NOT NULL,
 dispatched_at TEXT,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bot_tasks_queue ON bot_tasks(status,queued_at);
