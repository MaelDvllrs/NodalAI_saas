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
 * Each step: { type: string, config: object, optional?: boolean }
 *
 * @param {Array<{ type: string, config: object, optional?: boolean }>} steps
 * @param {Record<string, unknown>} input  - seed context (keyword, theme, siteId…)
 * @param {{ jobId: string, emitEvent: Function, workflowRunId?: string, saveStep?: Function }} runtime
 * @returns {Promise<WorkflowContext>}
 */
export async function runCustomWorkflow(steps, input, { jobId, emitEvent, workflowRunId = null, saveStep = null }) {
  // Resolve each step's module implementation + default config from the registry
  const resolvedSteps = steps.map((step) => registry.resolveStep(step));

  const engine = new WorkflowEngine({ emitEvent, jobId, workflowRunId, saveStep });

  return engine.run(
    { id: 'custom', name: 'Workflow personnalisé', steps: resolvedSteps },
    input
  );
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
