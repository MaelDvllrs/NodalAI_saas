-- Migration 003: generation_tasks
-- Stores generation/seo-preview task history per user
-- Run manually in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS generation_tasks (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  site_id       UUID        REFERENCES sites(id) ON DELETE SET NULL,
  blog_id       UUID        REFERENCES blogs(id) ON DELETE SET NULL,
  job_id        TEXT        NOT NULL,
  mode          TEXT        NOT NULL CHECK (mode IN ('generate', 'seo-test')),
  project_name  TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'error')),
  step_count    INTEGER     NOT NULL DEFAULT 0,
  keyword       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_generation_tasks_user_id    ON generation_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_tasks_site_id    ON generation_tasks(site_id);
CREATE INDEX IF NOT EXISTS idx_generation_tasks_blog_id    ON generation_tasks(blog_id);
CREATE INDEX IF NOT EXISTS idx_generation_tasks_created_at ON generation_tasks(created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_generation_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generation_tasks_updated_at
  BEFORE UPDATE ON generation_tasks
  FOR EACH ROW EXECUTE FUNCTION update_generation_tasks_updated_at();

-- RLS
ALTER TABLE generation_tasks ENABLE ROW LEVEL SECURITY;

-- Users can only see/edit their own tasks
CREATE POLICY "generation_tasks_select" ON generation_tasks
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "generation_tasks_insert" ON generation_tasks
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "generation_tasks_update" ON generation_tasks
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "generation_tasks_delete" ON generation_tasks
  FOR DELETE USING (user_id = auth.uid());

COMMENT ON TABLE generation_tasks IS
  'Stores generation and SEO-preview task history per user. '
  'Linked to blogs table when a full article is generated.';
