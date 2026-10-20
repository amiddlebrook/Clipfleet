CREATE TABLE IF NOT EXISTS campaigns (
 id TEXT PRIMARY KEY,
 url TEXT NOT NULL,
 title TEXT NOT NULL DEFAULT '',
 model TEXT NOT NULL DEFAULT 'unknown',
 rate REAL,
 budget_remaining REAL,
 priority_score REAL NOT NULL DEFAULT 0,
 accepting INTEGER NOT NULL DEFAULT 0,
 source TEXT NOT NULL,
 discovered_at TEXT NOT NULL,
 last_seen_at TEXT,
 detail_checked_at TEXT
);
CREATE TABLE IF NOT EXISTS jobs (
 id TEXT PRIMARY KEY,
 campaign_id TEXT NOT NULL REFERENCES campaigns(id),
 payload TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('queued','rendering','ready_for_review','failed')),
 created_at TEXT NOT NULL,
 claimed_at TEXT,
 completed_at TEXT,
 output_sha256 TEXT,
 error TEXT
);
CREATE INDEX IF NOT EXISTS jobs_queue_idx ON jobs(status,created_at);

CREATE TABLE IF NOT EXISTS trusted_campaigns (
 campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id),
 payload TEXT NOT NULL,
 max_variants INTEGER NOT NULL CHECK(max_variants BETWEEN 1 AND 3),
 enabled INTEGER NOT NULL DEFAULT 1,
 reviewed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS campaigns_active_idx ON campaigns(accepting,detail_checked_at);
