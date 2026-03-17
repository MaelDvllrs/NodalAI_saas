-- ── Workflow: is_public + description ──────────────────────────────────────
-- is_public: allows a workflow to be listed as a template (admin-managed via DB only)
-- description: optional human-readable summary shown on template cards

ALTER TABLE workflows
  ADD COLUMN IF NOT EXISTS is_public   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS description text;

-- Public workflows must be readable by anyone (authenticated or not)
CREATE POLICY "workflows_public_read" ON workflows
  FOR SELECT
  USING (is_public = true);

-- Optional: index for fast public listing
CREATE INDEX IF NOT EXISTS idx_workflows_is_public ON workflows (is_public) WHERE is_public = true;
