import { supabase } from '../config/supabase.js';

/**
 * Create a new task record when a job starts.
 */
export async function createTask({ userId, siteId, jobId, mode, projectName, keyword }) {
  const { data, error } = await supabase
    .from('generation_tasks')
    .insert({
      user_id: userId,
      site_id: siteId || null,
      job_id: jobId,
      mode,
      project_name: projectName,
      status: 'running',
      step_count: 0,
      keyword: keyword || null,
    })
    .select()
    .single();

  if (error) throw new Error(`Erreur création task: ${error.message}`);
  return data;
}

/**
 * Update task status and optionally link to a blog.
 */
export async function updateTask(jobId, { status, stepCount, blogId, keyword }) {
  const update = {};
  if (status !== undefined)    update.status     = status;
  if (stepCount !== undefined) update.step_count = stepCount;
  if (blogId !== undefined)    update.blog_id    = blogId;
  if (keyword !== undefined)   update.keyword    = keyword;

  const { error } = await supabase
    .from('generation_tasks')
    .update(update)
    .eq('job_id', jobId);

  if (error) console.error(`[TaskService] updateTask error: ${error.message}`);
}

/**
 * Get recent tasks accessible by a user (own tasks + tasks from sites they belong to).
 * Returns last 50 tasks ordered by creation date desc.
 */
export async function getUserTasks(userId) {
  // 1. Collect all site IDs the user has access to (owner + active member)
  const [{ data: ownedSites }, { data: memberSites }] = await Promise.all([
    supabase.from('sites').select('id').eq('user_id', userId),
    supabase.from('site_members').select('site_id').eq('user_id', userId).eq('status', 'active'),
  ]);

  const siteIds = [
    ...(ownedSites ?? []).map(s => s.id),
    ...(memberSites ?? []).map(m => m.site_id),
  ];

  // 2. Query tasks: own tasks OR tasks linked to accessible sites
  let query = supabase
    .from('generation_tasks')
    .select(`
      id, job_id, mode, project_name, status, step_count, keyword, created_at, updated_at,
      blog:blog_id ( id, title, slug )
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  if (siteIds.length > 0) {
    query = query.or(`user_id.eq.${userId},site_id.in.(${siteIds.join(',')})`);
  } else {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Erreur récupération tasks: ${error.message}`);
  return data;
}

/**
 * Delete a task record.
 */
export async function deleteTask(taskId, userId) {
  const { error } = await supabase
    .from('generation_tasks')
    .delete()
    .eq('id', taskId)
    .eq('user_id', userId);

  if (error) throw new Error(`Erreur suppression task: ${error.message}`);
}
