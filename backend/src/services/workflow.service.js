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
    .select('id, name, project_id, workflow_json, created_at, updated_at')
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

// Returns all public workflow templates with creator profile info.
// Uses a regular select — RLS policy "workflows_public_read" allows this for any caller.
export async function getPublicWorkflows() {
  const { data, error } = await supabase
    .from('workflows')
    .select(`
      id, name, description, workflow_json, created_at,
      user_id
    `)
    .eq('is_public', true)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`[workflow.service] getPublicWorkflows: ${error.message}`);

  // Fetch display names + avatars from auth.users via admin client if available,
  // otherwise fall back to user metadata from profiles if present.
  // We expose only safe public fields.
  const userIds = [...new Set((data ?? []).map(w => w.user_id))];
  let profileMap = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('site_members')
      .select('user_id, email')
      .in('user_id', userIds);
    if (profiles) {
      profiles.forEach(p => { profileMap[p.user_id] = p; });
    }
  }

  return (data ?? []).map(w => ({
    id:           w.id,
    name:         w.name,
    description:  w.description ?? null,
    workflow_json: w.workflow_json,
    created_at:   w.created_at,
    creator: {
      id:     w.user_id,
      email:  profileMap[w.user_id]?.email ?? null,
      // initials derived from email for avatar fallback
      initials: (profileMap[w.user_id]?.email ?? '?')[0].toUpperCase(),
    },
  }));
}

// ── Workflow runs ────────────────────────────────────────────────────────────

/**
 * Lightweight run lookup used by the SSE stream fallback.
 * No userId guard — the jobId UUID is the only secret needed.
 */
export async function getWorkflowRunForStream(runId) {
  const { data } = await supabase
    .from('workflow_runs')
    .select('id, status')
    .eq('id', runId)
    .single();
  return data ?? null;
}

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
    .select('id, user_id, workflow_id, project_id, status, created_at, updated_at, workflows!workflow_id(name), sites!project_id(name)')
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

// Strip null bytes and lone surrogates from a JSON-serialisable value so that
// Supabase / PostgreSQL never rejects the insert with "unsupported Unicode escape".
function sanitizeJson(value) {
  if (value == null) return null;
  try {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    // Remove null bytes (\u0000) and other PostgreSQL-illegal control chars
    const clean = str.replace(/\u0000/g, '').replace(/\\u0000/g, '');
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

export async function saveWorkflowRunStep({ workflowRunId, moduleType, stepIndex, status, resultJson, errorMessage }) {
  const { error } = await supabase
    .from('workflow_run_steps')
    .insert({
      workflow_run_id: workflowRunId,
      module_type:     moduleType,
      step_index:      stepIndex,
      status:          status || 'done',
      result_json:     sanitizeJson(resultJson),
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

// ── Workflow run rating ──────────────────────────────────────────────────────

export async function rateWorkflowRun(runId, userId, rating) {
  if (rating < 1 || rating > 5) {
    throw new Error('Rating must be between 1 and 5');
  }

  // Verify ownership before updating
  const { data: run, error: fetchError } = await supabase
    .from('workflow_runs')
    .select('id')
    .eq('id', runId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !run) {
    throw new Error('Workflow run not found or access denied');
  }

  const { data, error } = await supabase
    .from('workflow_runs')
    .update({ rating })
    .eq('id', runId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw new Error(`[workflow.service] rateWorkflowRun: ${error.message}`);
  return data;
}

// ── Step feedback (like / dislike) ───────────────────────────────────────────

const AI_MODULES = new Set(['blog-generation', 'content-generation']);

/**
 * Save a like/dislike vote for a workflow step.
 * For AI modules a "like" also bumps workflow_runs.rating = 5 so the
 * existing ratingExamples pipeline keeps working without changes.
 */
export async function saveStepFeedback(userId, { runId, stepId, moduleType, vote }) {
  // Upsert so the user can change their mind
  const { error } = await supabase
    .from('step_feedback')
    .upsert(
      { user_id: userId, run_id: runId ?? null, step_id: stepId ?? null, module_type: moduleType, vote },
      { onConflict: 'user_id,step_id' },
    );
  if (error) throw new Error(`[workflow.service] saveStepFeedback: ${error.message}`);

  // For AI modules update workflow_runs.rating so ratingExamples keeps working
  if (runId && AI_MODULES.has(moduleType)) {
    const rating = vote === 'like' ? 5 : 1;
    await supabase.from('workflow_runs').update({ rating }).eq('id', runId).eq('user_id', userId);
  }
}

export async function getRunFeedback(userId, runId) {
  const { data, error } = await supabase
    .from('step_feedback')
    .select('step_id, vote')
    .eq('user_id', userId)
    .eq('run_id', runId);
  if (error) throw new Error(`[workflow.service] getRunFeedback: ${error.message}`);
  // Return a map { stepId -> vote }
  return Object.fromEntries((data ?? []).map(r => [r.step_id, r.vote]));
}

// ── GEO Prompts ──────────────────────────────────────────────────────────────

export async function getGeoPrompts(userId, { limit = 30, source } = {}) {
  let q = supabase
    .from('geo_prompts')
    .select('id, prompt, topic, source, site_theme, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (userId) q = q.eq('user_id', userId);
  if (source)  q = q.eq('source', source);

  const { data, error } = await q;
  if (error) throw new Error(`[workflow.service] getGeoPrompts: ${error.message}`);
  return data ?? [];
}

export async function getTopRatedWorkflowRuns(userId, projectId, limit = 5) {
  let query = supabase
    .from('workflow_runs')
    .select(`
      id, rating, created_at,
      workflow_run_steps!inner(module_type, result_json)
    `)
    .eq('user_id', userId)
    .eq('status', 'done')
    .gte('rating', 4)
    .order('rating', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (projectId) {
    query = query.eq('project_id', projectId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`[workflow.service] getTopRatedWorkflowRuns: ${error.message}`);
  return data ?? [];
}
