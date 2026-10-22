-- Four independent platform lanes for each approved campaign.
-- Each completed publication has a separate record in campaign_submissions.
CREATE TABLE IF NOT EXISTS distribution_targets (
 campaign_id TEXT NOT NULL REFERENCES campaigns(id),
 platform TEXT NOT NULL CHECK(platform IN ('youtube','tiktok','instagram','x')),
 preset_id TEXT NOT NULL REFERENCES social_presets(id),
 job_id TEXT UNIQUE REFERENCES jobs(id),
 status TEXT NOT NULL DEFAULT 'configured' CHECK(status IN ('configured','queued','rendering','ready','reviewed','published','submitted','accepted','rejected','paid','failed')),
 published_url TEXT,
 published_at TEXT,
 submitted_at TEXT,
 submission_reference TEXT NOT NULL DEFAULT '',
 outcome TEXT NOT NULL DEFAULT 'pending' CHECK(outcome IN ('pending','accepted','rejected','paid')),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(campaign_id,platform)
);
CREATE INDEX IF NOT EXISTS distribution_targets_status ON distribution_targets(status,updated_at);
CREATE INDEX IF NOT EXISTS distribution_targets_job ON distribution_targets(job_id);
