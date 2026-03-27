import type { Task } from '../contexts/TaskContext';
import type { LogEvent } from '../components/ProgressLog';

// Expected relative weight of each module in a typical workflow.
// Used to compute weighted progress: heavier modules occupy a larger share
// of the bar so fast modules (SERP) don't look disproportionate.
const MODULE_WEIGHTS: Record<string, number> = {
  'keyword-research':    5,
  'serp-analysis':       8,
  'webflow-structure':   4,
  'semantic-extraction': 10,
  'blog-generation':     55,
  'blog-translation':    12,
  'blog-summary':        5,
  'content-generation':  40,
  'webflow-publish':     4,
  'reddit-analyzer':     7,
  'geo-analysis':        5,
  'geo-content':         5,
};
const DEFAULT_WEIGHT = 5;

export function computeProgress(task: Task): number {
  if (task.status === 'done')  return 100;
  if (task.status === 'error') return 100;

  const events = task.events;

  // ── Option C: weighted module progress ──────────────────────────────────────

  // 1. Build the full module list from the workflow-start event (emitted by the
  //    engine before any module runs, so the total weight is fixed from the start
  //    and the bar never goes backwards).
  const workflowStart = events.find(
    (e): e is Extract<LogEvent, { type: 'workflow-start' }> => e.type === 'workflow-start',
  );

  const moduleList: string[] = workflowStart
    ? workflowStart.modules.map(m => m.type)
    : events
        .filter((e): e is Extract<LogEvent, { type: 'module-start' }> => e.type === 'module-start')
        .map(e => e.moduleType)
        .filter((t, i, arr) => arr.indexOf(t) === i); // unique, insertion order

  if (moduleList.length === 0) {
    // Fallback for tasks without module events (old runs / legacy)
    const steps = events.filter(e => e.type === 'step').length;
    return Math.round((1 - Math.pow(0.82, steps)) * 95);
  }

  const totalWeight = moduleList.reduce(
    (sum, type) => sum + (MODULE_WEIGHTS[type] ?? DEFAULT_WEIGHT),
    0,
  );

  // 2. Completed modules
  const doneTypes = new Set(
    events
      .filter((e): e is Extract<LogEvent, { type: 'module-done' }> => e.type === 'module-done')
      .map(e => e.moduleType),
  );

  const completedWeight = moduleList
    .filter(type => doneTypes.has(type))
    .reduce((sum, type) => sum + (MODULE_WEIGHTS[type] ?? DEFAULT_WEIGHT), 0);

  // 3. Active module (first started but not yet done)
  const startedTypes = events
    .filter((e): e is Extract<LogEvent, { type: 'module-start' }> => e.type === 'module-start')
    .map(e => e.moduleType);

  const activeModule = startedTypes.find(type => !doneTypes.has(type)) ?? null;

  // 4. Intra-module progress from `progress` events (emitted by heavy modules
  //    like blog-generation every 3 s via the time-based ticker)
  let intraContribution = 0;
  if (activeModule) {
    const progressEvents = events.filter(
      (e): e is Extract<LogEvent, { type: 'progress' }> =>
        e.type === 'progress' && e.moduleType === activeModule,
    );
    const lastPct = progressEvents.length > 0
      ? progressEvents[progressEvents.length - 1].pct
      : 0;
    const activeWeight = MODULE_WEIGHTS[activeModule] ?? DEFAULT_WEIGHT;
    intraContribution = activeWeight * (lastPct / 100);
  }

  const raw = totalWeight > 0
    ? ((completedWeight + intraContribution) / totalWeight) * 90
    : 0;

  return Math.min(95, Math.round(raw));
}
