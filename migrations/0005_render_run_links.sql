-- Link each generated clip to the specific GitHub Actions run holding its downloadable MP4 artifact.
ALTER TABLE jobs ADD COLUMN actions_run_url TEXT;
