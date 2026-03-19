/**
 * Workflow Routes
 *
 * CRUD for workflow definitions + endpoint to queue execution.
 *
 * POST   /api/workflows                 — save a new workflow definition
 * GET    /api/workflows?projectId=...   — list workflows for a user / project
 * GET    /api/workflows/:id             — get one workflow
 * PUT    /api/workflows/:id             — update name / steps
 * DELETE /api/workflows/:id             — delete
 *
 * POST   /api/workflow/run              — run ad-hoc workflow from canvas steps
 * POST   /api/workflows/:id/run         — run a saved workflow
 *
 * GET    /api/workflow/runs?projectId=  — list recent runs
 * GET    /api/workflow/runs/:runId/steps — get step results for a run
 * POST   /api/workflow/runs/:runId/rate — rate a workflow run (1-5 stars)
 */
import express from 'express';
import { authenticateUser as requireAuth, optionalAuth } from '../middleware/auth.middleware.js';
import { generationQueue }           from '../queues/generation.queue.js';
import { initJob }                   from '../services/events.service.js';
import {
  saveWorkflow,
  getWorkflows,
  getWorkflow,
  updateWorkflow,
  deleteWorkflow,
  getPublicWorkflows,
  createWorkflowRun,
  getWorkflowRuns,
  getWorkflowRunSteps,
  getWorkflowRun,
  rateWorkflowRun,
  saveStepFeedback,
  getRunFeedback,
  getGeoPrompts,
} from '../services/workflow.service.js';

const router = express.Router();

// ── Workflow definitions ─────────────────────────────────────────────────────

// POST /api/workflows — save a workflow definition from the canvas
router.post('/workflows', requireAuth, async (req, res) => {
  try {
    const { name, projectId, workflowJson } = req.body;
    if (!workflowJson || !Array.isArray(workflowJson.steps)) {
      return res.status(400).json({ error: 'workflowJson.steps requis (array).' });
    }
    const workflow = await saveWorkflow({
      userId:       req.user.id,
      projectId:    projectId || null,
      name:         name || 'Mon workflow',
      workflowJson,
    });
    
    res.status(201).json(workflow);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workflows
router.get('/workflows', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.query;
    const workflows = await getWorkflows(req.user.id, projectId || null);
    console.log('Workflows récupérés:', workflows);
    res.json(workflows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workflows/public — list public workflow templates (no auth required)
router.get('/workflows/public', async (req, res) => {
  try {
    const templates = await getPublicWorkflows();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workflows/:id
router.get('/workflows/:id', requireAuth, async (req, res) => {
  try {
    const workflow = await getWorkflow(req.params.id, req.user.id);
    res.json(workflow);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// PUT /api/workflows/:id
router.put('/workflows/:id', requireAuth, async (req, res) => {
  try {
    const { name, workflowJson } = req.body;
    const updated = await updateWorkflow(req.params.id, req.user.id, { name, workflowJson });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/workflows/:id
router.delete('/workflows/:id', requireAuth, async (req, res) => {
  try {
    await deleteWorkflow(req.params.id, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GEO Prompts ──────────────────────────────────────────────────────────────

// GET /api/workflows/geo-prompts — list saved GEO prompts for the current user
router.get('/workflows/geo-prompts', requireAuth, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '30', 10), 100);
    const source = req.query.source || undefined;
    const prompts = await getGeoPrompts(req.user.id, { limit, source });
    res.json(prompts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Workflow execution ───────────────────────────────────────────────────────

/**
 * POST /api/workflow/run
 *
 * Run an ad-hoc workflow directly from canvas step definitions.
 * Body: {
 *   steps:      [{ type, config, optional? }],   // canvas topology
 *   input:      { theme, tone, siteId, apiKey, collectionName, ... },
 *   projectId?: string,
 *   workflowId?: string,  // optional: link run to a saved workflow
 * }
 */
router.post('/workflow/run', optionalAuth, async (req, res) => {
  try {
    const { steps, edges, input, projectId, workflowId } = req.body;

    if (!Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({ error: 'steps[] requis et non vide.' });
    }

    // Create the workflow_run record first — its id IS the jobId
    let runId;
    if (req.user?.id) {
      const run = await createWorkflowRun({
        workflowId: workflowId || null,
        projectId:  projectId  || null,
        userId:     req.user.id,
      });
      runId = run.id;
    } else {
      runId = crypto.randomUUID(); // unauthenticated: transient ID, no DB record
    }

    initJob(runId);
    res.json({ jobId: runId });

    await generationQueue.add('workflow', {
      type:           'workflow',
      jobId:          runId,
      steps,
      edges:          Array.isArray(edges) ? edges : [],
      input:          input || {},
      userId:         req.user?.id || null,
      projectId:      projectId    || null,
      workflowRunId:  req.user?.id ? runId : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/workflows/:id/run
 *
 * Run a saved workflow definition.
 * Body: { input: { theme, tone, siteId, ... } }
 */
router.post('/workflows/:id/run', requireAuth, async (req, res) => {
  try {
    const workflow = await getWorkflow(req.params.id, req.user.id);
    const { steps, edges } = workflow.workflow_json;

    if (!Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({ error: 'Ce workflow ne contient aucun step.' });
    }

    const run = await createWorkflowRun({
      workflowId: workflow.id,
      projectId:  workflow.project_id || null,
      userId:     req.user.id,
    });

    initJob(run.id);
    res.json({ jobId: run.id });

    await generationQueue.add('workflow', {
      type:          'workflow',
      jobId:         run.id,
      steps,
      edges:         Array.isArray(edges) ? edges : [],
      input:         req.body.input || {},
      userId:        req.user.id,
      projectId:     workflow.project_id || null,
      workflowRunId: run.id,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Run history ──────────────────────────────────────────────────────────────

// GET /api/workflow/runs
router.get('/workflow/runs', requireAuth, async (req, res) => {
  try {
    const runs = await getWorkflowRuns(req.user.id, req.query.projectId || null);
    res.json(runs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workflow/runs/:id — get a single run
router.get('/workflow/runs/:id', requireAuth, async (req, res) => {
  try {
    const run = await getWorkflowRun(req.params.id, req.user.id);
    res.json(run);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// GET /api/workflow/runs/:runId/steps
router.get('/workflow/runs/:runId/steps', requireAuth, async (req, res) => {
  try {
    const steps = await getWorkflowRunSteps(req.params.runId);
    res.json(steps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workflow/runs/:runId/rate — rate a workflow run (1-5 stars) [legacy]
router.post('/workflow/runs/:runId/rate', requireAuth, async (req, res) => {
  try {
    const { rating } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }
    const updated = await rateWorkflowRun(req.params.runId, req.user.id, rating);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/feedback?runId=... — fetch all votes for a run
router.get('/feedback', requireAuth, async (req, res) => {
  try {
    const { runId } = req.query;
    if (!runId) return res.status(400).json({ error: 'runId is required' });
    const votes = await getRunFeedback(req.user.id, runId);
    res.json(votes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/feedback — like / dislike a workflow step (all module types)
router.post('/feedback', requireAuth, async (req, res) => {
  try {
    const { runId, stepId, section: moduleType, rating: vote } = req.body;
    if (!vote || !['like', 'dislike'].includes(vote)) {
      return res.status(400).json({ error: 'vote must be "like" or "dislike"' });
    }
    if (!moduleType) {
      return res.status(400).json({ error: 'section (moduleType) is required' });
    }
    await saveStepFeedback(req.user.id, { runId, stepId, moduleType, vote });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
