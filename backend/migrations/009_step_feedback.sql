-- ── Step-level like / dislike feedback ──────────────────────────────────────
--
-- Stores per-step votes for all workflow module types.
-- For AI modules (blog-generation, content-generation) a "like" also sets
-- workflow_runs.rating = 5 so the existing ratingExamples pipeline keeps working.

CREATE TABLE IF NOT EXISTS step_feedback (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_id      uuid        REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step_id     uuid        REFERENCES workflow_run_steps(id) ON DELETE CASCADE,
  module_type text        NOT NULL,
  vote        text        NOT NULL CHECK (vote IN ('like', 'dislike')),
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, step_id)
);

CREATE INDEX IF NOT EXISTS step_feedback_run_id_idx  ON step_feedback(run_id);
CREATE INDEX IF NOT EXISTS step_feedback_user_id_idx ON step_feedback(user_id);
