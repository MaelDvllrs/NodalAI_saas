/**
 * Workflow Entry Point
 *
 * Public API for running workflows.
 *
 * Two execution modes:
 *   1. runCustomWorkflow(steps, input, runtime)  — canvas-driven, ad-hoc step list
 *   2. runWorkflow(templateId, input, runtime)   — named template (legacy / kept for reference)
 *
 * Usage (from worker):
 *
 *   import { runCustomWorkflow } from '../workflows/index.js';
 *
 *   await runCustomWorkflow(steps, {
 *     theme: 'formation excel',
 *     tone: 'professionnel',
 *     siteId: '...',
 *     dbSiteId: '...',
 *     userId: '...',
 *   }, { jobId, emitEvent, workflowRunId, saveStep });
 */

import { WorkflowEngine }        from './engine.js';
import { registry }              from './registry.js';
import { BlogSeoTemplate }       from './templates/blog-seo.js';

/** Registry of available named workflow templates */
const TEMPLATES = {
  'blog-seo': BlogSeoTemplate,
};

/**
 * Run a workflow from an array of step definitions coming from the canvas.
 * Each step: { instanceId: string, type: string, config: object, optional?: boolean }
 * Edges define the execution order: { source: instanceId, target: instanceId }[]
 *
 * @param {Array<{ instanceId: string, type: string, config: object, optional?: boolean }>} steps
 * @param {Record<string, unknown>} input  - seed context (keyword, theme, siteId…)
 * @param {{ jobId: string, emitEvent: Function, workflowRunId?: string, saveStep?: Function, edges?: Array<{source: string, target: string}> }} runtime
 * @returns {Promise<WorkflowContext>}
 */
export async function runCustomWorkflow(steps, input, { jobId, emitEvent, workflowRunId = null, saveStep = null, edges = [] }) {
  // Sort steps by topological order derived from canvas edges
  const orderedSteps = topoSort(steps, edges);

  // Emit execution plan before starting
  const plan = buildExecutionPlan(orderedSteps, edges);
  emitEvent(jobId, {
    type: 'step',
    message: `📋 Plan d'exécution (${orderedSteps.length} modules) :\n${plan}`,
  });
  console.log(`[Workflow] Execution plan:\n${plan}`);

  // Resolve each step's module implementation + default config from the registry
  const resolvedSteps = orderedSteps.map((step) => registry.resolveStep(step));

  const engine = new WorkflowEngine({ emitEvent, jobId, workflowRunId, saveStep });

  return engine.run(
    { id: 'custom', name: 'Workflow personnalisé', steps: resolvedSteps },
    input,
    edges
  );
}

/**
 * Build a human-readable execution plan string.
 * Shows each step in order with its direct upstream dependencies.
 */
function buildExecutionPlan(orderedSteps, edges) {
  const lines = orderedSteps.map((step, i) => {
    const preds = edges
      .filter(e => e.target === step.instanceId)
      .map(e => {
        const src = orderedSteps.find(s => s.instanceId === e.source);
        return src ? src.type : e.source;
      });
    const deps = preds.length > 0 ? ` (attend: ${preds.join(', ')})` : ' (départ)';
    return `  ${i + 1}. ${step.type}${deps}`;
  });
  return lines.join('\n');
}

/**
 * Topological sort of steps using canvas edges (Kahn's algorithm).
 * When a cycle is detected, breaks it by force-inserting the unprocessed node
 * with the lowest in-degree (preserving original index as tiebreaker).
 *
 * @param {Array<{instanceId?: string, type: string}>} steps
 * @param {Array<{source: string, target: string}>} edges
 */
function topoSort(steps, edges) {
  // Steps without instanceId cannot be sorted by topology — return as-is
  if (!edges || edges.length === 0 || steps.every(s => !s.instanceId)) return steps;

  const idExists = new Set(steps.map(s => s.instanceId).filter(Boolean));

  // Only keep edges where both ends are known steps
  const validEdges = edges.filter(e => idExists.has(e.source) && idExists.has(e.target));

  const inDegree = new Map(steps.map(s => [s.instanceId, 0]));
  const adj      = new Map(steps.map(s => [s.instanceId, []]));

  for (const { source, target } of validEdges) {
    adj.get(source).push(target);
    inDegree.set(target, inDegree.get(target) + 1);
  }

  const idToStep    = new Map(steps.map(s => [s.instanceId, s]));
  const originalIdx = new Map(steps.map((s, i) => [s.instanceId, i]));
  const processed   = new Set();
  const result      = [];

  // Seed with all root nodes (in-degree 0), preserving original relative order
  const queue = steps
    .filter(s => inDegree.get(s.instanceId) === 0)
    .map(s => s.instanceId);

  while (result.length < steps.length) {
    // Normal Kahn processing
    while (queue.length > 0) {
      const id = queue.shift();
      if (processed.has(id)) continue;
      processed.add(id);
      result.push(idToStep.get(id));
      for (const neighbor of adj.get(id) || []) {
        const deg = inDegree.get(neighbor) - 1;
        inDegree.set(neighbor, deg);
        if (deg === 0) queue.push(neighbor);
      }
    }

    // Queue empty but nodes remain → cycle detected: force-insert the
    // unprocessed node with the lowest in-degree (original index as tiebreaker)
    if (result.length < steps.length) {
      const remaining = steps.filter(s => !processed.has(s.instanceId));
      remaining.sort((a, b) => {
        const degDiff = inDegree.get(a.instanceId) - inDegree.get(b.instanceId);
        return degDiff !== 0 ? degDiff : originalIdx.get(a.instanceId) - originalIdx.get(b.instanceId);
      });
      const forced = remaining[0];
      console.warn(`[topoSort] Cycle détecté — forçage de "${forced.type}" (${forced.instanceId}) pour débloquer`);
      queue.push(forced.instanceId);
    }
  }

  return result;
}

/**
 * Run a named workflow template (e.g. 'blog-seo').
 *
 * @param {string} templateId
 * @param {Record<string, unknown>} input
 * @param {{ jobId: string, emitEvent: Function, workflowRunId?: string, saveStep?: Function }} runtime
 * @returns {Promise<WorkflowContext>}
 */
export async function runWorkflow(templateId, input, { jobId, emitEvent, workflowRunId = null, saveStep = null }) {
  const template = TEMPLATES[templateId];
  if (!template) throw new Error(`[Workflow] Template inconnu : "${templateId}"`);

  const steps  = template.build(input.opts ?? {});
  const engine = new WorkflowEngine({ emitEvent, jobId, workflowRunId, saveStep });

  return engine.run({ id: template.id, name: template.name, steps }, input);
}

/**
 * List all available workflow templates (for UI / API endpoint).
 */
export function listTemplates() {
  return Object.values(TEMPLATES).map(t => ({
    id:          t.id,
    name:        t.name,
    description: t.description ?? '',
  }));
}
