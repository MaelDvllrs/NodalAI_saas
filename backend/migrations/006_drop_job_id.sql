-- Remove job_id from workflow_runs — workflow_run.id IS the identifier everywhere
ALTER TABLE workflow_runs DROP COLUMN IF EXISTS job_id;
