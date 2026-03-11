/**
 * Workflow Service
 *
 * Persists workflow definitions, run records, and per-step results to Supabase.
 */
import { supabase } from '../config/supabase.js';

// ── Workflow definitions ─────────────────────────────────────────────────────

export async function saveWorkflow({ userId, projectId, name, workflowJson }) {
  const { data, error } = await supabase
    .from('workflows')
    .insert({ user_id: userId, project_id: projectId || null, name, workflow_json: workflowJson })
    .select()
    .single();
  if (error) throw new Error(`[workflow.service] saveWorkflow: ${error.message}`);
  return data;
}

export async function getWorkflows(userId, projectId) {
  let q = supabase
    .from('workflows')
    .select('id, name, project_id, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (projectId) q = q.eq('project_id', projectId);
  const { data, error } = await q;
  if (error) throw new Error(`[workflow.service] getWorkflows: ${error.message}`);
  return data;
}

export async function getWorkflow(id, userId) {
  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();
  if (error) throw new Error(`[workflow.service] getWorkflow: ${error.message}`);
  return data;
}

export async function updateWorkflow(id, userId, { name, workflowJson }) {
  const updates = { updated_at: new Date().toISOString() };
  if (name       !== undefined) updates.name          = name;
  if (workflowJson !== undefined) updates.workflow_json = workflowJson;

  const { data, error } = await supabase
    .from('workflows')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw new Error(`[workflow.service] updateWorkflow: ${error.message}`);
  return data;
}

export async function deleteWorkflow(id, userId) {
  const { error } = await supabase
    .from('workflows')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw new Error(`[workflow.service] deleteWorkflow: ${error.message}`);
}

// ── Workflow runs ────────────────────────────────────────────────────────────

export async function createWorkflowRun({ workflowId, projectId, userId }) {
  const { data, error } = await supabase
    .from('workflow_runs')
    .insert({
      workflow_id: workflowId || null,
      project_id:  projectId  || null,
      user_id:     userId     || null,
      status:      'running',
    })
    .select()
    .single();
  if (error) throw new Error(`[workflow.service] createWorkflowRun: ${error.message}`);
  return data;
}

export async function updateWorkflowRun(id, status) {
  const { error } = await supabase
    .from('workflow_runs')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`[workflow.service] updateWorkflowRun: ${error.message}`);
}

export async function getWorkflowRuns(userId, projectId) {
  let q = supabase
    .from('workflow_runs')
    .select('id, workflow_id, project_id, status, created_at, updated_at, workflows!workflow_id(name), sites!project_id(name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (projectId) q = q.eq('project_id', projectId);
  const { data, error } = await q;
  if (error) throw new Error(`[workflow.service] getWorkflowRuns: ${error.message}`);
  return data;
}

export async function getWorkflowRun(id, userId) {
  const { data, error } = await supabase
    .from('workflow_runs')
    .select('id, workflow_id, project_id, status, created_at, updated_at, workflows!workflow_id(name), sites!project_id(name)')
    .eq('id', id)
    .eq('user_id', userId)
    .single();
  if (error) throw new Error(`[workflow.service] getWorkflowRun: ${error.message}`);
  return data;
}

// ── Workflow run steps ───────────────────────────────────────────────────────

export async function saveWorkflowRunStep({ workflowRunId, moduleType, stepIndex, status, resultJson, errorMessage }) {
  const { error } = await supabase
    .from('workflow_run_steps')
    .insert({
      workflow_run_id: workflowRunId,
      module_type:     moduleType,
      step_index:      stepIndex,
      status:          status || 'done',
      result_json:     resultJson || null,
      error_message:   errorMessage || null,
    });
  if (error) {
    // Non-blocking — log but don't crash the workflow
    console.error(`[workflow.service] saveWorkflowRunStep: ${error.message}`);
  }
}

export async function getWorkflowRunSteps(workflowRunId) {
  const { data, error } = await supabase
    .from('workflow_run_steps')
    .select('*')
    .eq('workflow_run_id', workflowRunId)
    .order('step_index', { ascending: true });
  if (error) throw new Error(`[workflow.service] getWorkflowRunSteps: ${error.message}`);
  return data;
}
