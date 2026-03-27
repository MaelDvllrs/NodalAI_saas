import express from 'express';
import { optionalAuth } from '../middleware/auth.middleware.js';
import { initJob, getJob, addClient, removeClient } from '../services/events.service.js';
import { generationQueue } from '../queues/generation.queue.js';
import { getWorkflowRunForStream, getWorkflowRunSteps } from '../services/workflow.service.js';

// Human-readable labels for synthetic SSE events reconstructed from run steps
const MODULE_LABELS = {
  'trigger-manual':      'Déclencheur',
  'keyword-research':    'Recherche mots-clés',
  'serp-analysis':       'Analyse SERP',
  'webflow-structure':   'Structure Webflow',
  'blog-generation':     'Génération de blog',
  'blog-translation':    'Traduction article',
  'webflow-publish':     'Publication Webflow',
  'semantic-extraction': 'Extraction sémantique',
  'reddit-analyzer':     'Analyse Reddit',
  'geo-analysis':        'Analyse GEO',
  'geo-content':         'Contenu GEO',
};

const router = express.Router();

//  POST /api/generate 
router.post('/generate', optionalAuth, async (req, res) => {
  const { siteId, apiKey, collectionName, theme, tone, status, siteUrl, dbSiteId, directKeyword, projectName } = req.body;

  if (!siteId || !apiKey || !collectionName || !theme || !tone) {
    return res.status(400).json({ error: 'Champs obligatoires manquants.' });
  }

  const jobId = crypto.randomUUID();
  initJob(jobId);

  res.json({ jobId });

  await generationQueue.add('generate', {
    type: 'pipeline',
    jobId,
    params: {
      siteId,
      apiKey,
      collectionName,
      theme,
      tone,
      status,
      siteUrl,
      dbSiteId: dbSiteId || null,
      userId: req.user?.id || null,
      directKeyword: directKeyword || null,
      projectName: projectName || null,
    },
  });
});

//  POST /api/seo-preview 
router.post('/seo-preview', optionalAuth, async (req, res) => {
  const { theme, directKeyword, projectName } = req.body;
  if (!theme && !directKeyword) {
    return res.status(400).json({ error: 'theme ou directKeyword requis.' });
  }

  const jobId = crypto.randomUUID();
  initJob(jobId);

  res.json({ jobId });

  await generationQueue.add('seo-preview', {
    type: 'seo-preview',
    jobId,
    params: { theme, directKeyword: directKeyword || null, userId: req.user?.id || null, projectName: projectName || 'SEO Test' },
  });
});

//  GET /api/stream/:jobId
router.get('/stream/:jobId', async (req, res) => {
  const { jobId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const job = getJob(jobId);

  if (job) {
    // ── Normal path: job is live in memory ──
    for (const event of job.events) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    if (job.done) return res.end();
    addClient(jobId, res);
    req.on('close', () => removeClient(jobId, res));
    return;
  }

  // ── Fallback: job lost after server restart — replay from Supabase ──
  try {
    const [run, steps] = await Promise.all([
      getWorkflowRunForStream(jobId),
      getWorkflowRunSteps(jobId),
    ]);

    if (!run) return res.end();

    // Reconstruct one SSE step event per completed run step
    for (const step of steps) {
      const label = MODULE_LABELS[step.module_type] ?? step.module_type;
      const msg = step.status === 'error'
        ? `❌ ${label} — ${step.error_message ?? 'Erreur'}`
        : `✅ ${label} — terminé`;
      res.write(`data: ${JSON.stringify({ type: 'step', message: msg })}\n\n`);
    }

    // Send terminal event if the run has reached a final state
    if (run.status === 'done') {
      res.write(`data: ${JSON.stringify({ type: 'done', message: 'Workflow terminé avec succès.' })}\n\n`);
    } else if (run.status === 'error') {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Le workflow a échoué.' })}\n\n`);
    }
    // run.status === 'running' → BullMQ is still retrying; no terminal event,
    // the frontend polling (every 5 s) will detect completion.
  } catch (err) {
    console.error(`[SSE fallback] ${jobId}:`, err.message);
  }

  res.end();
});

//  GET /api/jobs/:jobId 
router.get('/jobs/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job introuvable.' });
  res.json({ status: job.status, done: job.done, eventCount: job.events.length });
});

export default router;
