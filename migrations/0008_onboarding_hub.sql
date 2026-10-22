-- Setup checklist: all completion states are operator assertions, never OAuth.
CREATE TABLE IF NOT EXISTS onboarding_steps (
 step_id TEXT PRIMARY KEY CHECK(step_id IN ('contentrewards','whop','grokbot','grokbot_webhook','youtube','tiktok','instagram','x')),
 completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
 updated_at TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT ''
);
