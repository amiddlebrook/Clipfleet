-- Social presets contain only public account handles; never OAuth tokens.
CREATE TABLE IF NOT EXISTS social_presets (
 id TEXT PRIMARY KEY,
 platform TEXT NOT NULL CHECK(platform IN ('youtube','tiktok','instagram','facebook','x')),
 handle TEXT NOT NULL,
 profile_url TEXT NOT NULL,
 confirmed_connected INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 UNIQUE(platform,handle)
);
-- Explicit small daily limit for optional Workers AI drafting.
CREATE TABLE IF NOT EXISTS ai_draft_daily (
 day TEXT PRIMARY KEY,
 requests INTEGER NOT NULL DEFAULT 0 CHECK(requests BETWEEN 0 AND 8)
);
