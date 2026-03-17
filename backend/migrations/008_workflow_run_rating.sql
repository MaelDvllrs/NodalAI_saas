-- ── Add rating to workflow runs ────────────────────────────────────────────
-- Allows users to rate the quality of blog generation workflows (1-5 stars).
-- Runs with rating >= 4 can be used as quality examples for future generations.

ALTER TABLE workflow_runs 
ADD COLUMN IF NOT EXISTS rating integer CHECK (rating >= 1 AND rating <= 5);

-- Add index for querying high-rated runs
CREATE INDEX IF NOT EXISTS workflow_runs_rating_idx ON workflow_runs(rating) WHERE rating IS NOT NULL;
