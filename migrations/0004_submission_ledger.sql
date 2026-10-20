-- Separate submissions per campaign/clip; no verified platform data is implied.
CREATE TABLE IF NOT EXISTS campaign_submissions (
 id TEXT PRIMARY KEY,
 campaign_id TEXT NOT NULL REFERENCES campaigns(id),
 job_id TEXT NOT NULL REFERENCES jobs(id),
 platform TEXT NOT NULL,
 published_url TEXT NOT NULL,
 published_at TEXT NOT NULL,
 submitted_at TEXT NOT NULL,
 submission_reference TEXT NOT NULL DEFAULT '',
 outcome TEXT NOT NULL DEFAULT 'pending' CHECK(outcome IN ('pending','accepted','rejected','paid')),
 updated_at TEXT NOT NULL,
 UNIQUE(campaign_id,job_id),
 UNIQUE(campaign_id,published_url)
);
CREATE INDEX IF NOT EXISTS campaign_submissions_recent ON campaign_submissions(campaign_id,submitted_at DESC);
