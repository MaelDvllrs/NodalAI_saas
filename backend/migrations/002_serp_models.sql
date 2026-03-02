-- Migration 002: serp_models table
-- Stores SERP semantic model snapshots for drift detection
-- Run manually in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS serp_models (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword     TEXT NOT NULL UNIQUE,
  model       JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast keyword lookup
CREATE INDEX IF NOT EXISTS serp_models_keyword_idx ON serp_models(keyword);

-- RLS: service role only (this table is written/read by the backend service key)
ALTER TABLE serp_models ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "service role full access" ON serp_models
  USING (true)
  WITH CHECK (true);

-- Comment
COMMENT ON TABLE serp_models IS
  'Stores SERP semantic model snapshots (top-10 competitor analysis) per keyword. '
  'Used for SERP drift detection and content coverage scoring.';
