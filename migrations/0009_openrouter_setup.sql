-- Extend setup checklist to preferred free OpenRouter and local Browser Use.
-- Preserve optional legacy Grok Bot states without making them required.
CREATE TABLE IF NOT EXISTS onboarding_steps_v2 (
 step_id TEXT PRIMARY KEY CHECK(step_id IN
 ('contentrewards','whop','grokbot','grokbot_webhook','youtube','tiktok','instagram','x','openrouter','local_browser')),
 completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
 updated_at TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO onboarding_steps_v2(step_id,completed,updated_at,note)
 SELECT step_id,completed,updated_at,note FROM onboarding_steps;
DROP TABLE onboarding_steps;
ALTER TABLE onboarding_steps_v2 RENAME TO onboarding_steps;
