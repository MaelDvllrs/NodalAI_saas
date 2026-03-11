-- ── Workflows ──────────────────────────────────────────────────────────────
-- Persists workflow definitions created in the canvas editor.
CREATE TABLE IF NOT EXISTS workflows (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id  uuid        REFERENCES sites(id) ON DELETE CASCADE,
  user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL DEFAULT 'Mon workflow',
  workflow_json jsonb     NOT NULL DEFAULT '{}',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflows_owner" ON workflows
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Workflow Runs ───────────────────────────────────────────────────────────
-- One row per execution of a workflow.
CREATE TABLE IF NOT EXISTS workflow_runs (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id  uuid        REFERENCES workflows(id) ON DELETE SET NULL,
  project_id   uuid        REFERENCES sites(id) ON DELETE CASCADE,
  user_id      uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id       text        UNIQUE,
  status       text        NOT NULL DEFAULT 'running'
                           CHECK (status IN ('running', 'done', 'error')),
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow_runs_owner" ON workflow_runs
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Workflow Run Steps ──────────────────────────────────────────────────────
-- One row per module executed within a run. Stores the full output JSON.
CREATE TABLE IF NOT EXISTS workflow_run_steps (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_run_id  uuid        NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  module_type      text        NOT NULL,
  step_index       integer     NOT NULL,
  status           text        NOT NULL DEFAULT 'done'
                               CHECK (status IN ('done', 'error', 'skipped')),
  result_json      jsonb,
  error_message    text,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE workflow_run_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow_run_steps_owner" ON workflow_run_steps
  USING (
    EXISTS (
      SELECT 1 FROM workflow_runs wr
      WHERE wr.id = workflow_run_steps.workflow_run_id
        AND wr.user_id = auth.uid()
    )
  );

-- Indexes for common look-ups
CREATE INDEX IF NOT EXISTS workflow_runs_job_id_idx   ON workflow_runs(job_id);
CREATE INDEX IF NOT EXISTS workflow_run_steps_run_idx ON workflow_run_steps(workflow_run_id, step_index);
