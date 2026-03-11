-- Migration 004: Update generation_tasks RLS to allow site members to see tasks
-- Run manually in Supabase SQL Editor

-- Drop old restrictive SELECT policy
DROP POLICY IF EXISTS "generation_tasks_select" ON generation_tasks;

-- New policy: visible to the task owner OR any active member/owner of the linked site
CREATE POLICY "generation_tasks_select" ON generation_tasks
  FOR SELECT USING (
    -- Task creator always sees their own tasks
    user_id = auth.uid()
    -- OR: user is the owner of the linked site
    OR site_id IN (
      SELECT id FROM sites WHERE user_id = auth.uid()
    )
    -- OR: user is an active member of the linked site
    OR site_id IN (
      SELECT site_id FROM site_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );
