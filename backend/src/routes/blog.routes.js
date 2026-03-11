import express from 'express';
import { optionalAuth } from '../middleware/auth.middleware.js';
import { initJob, getJob, addClient, removeClient } from '../services/events.service.js';
import { generationQueue } from '../queues/generation.queue.js';

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
router.get('/stream/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job introuvable.' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Replay buffered events for late-joining clients
  for (const event of job.events) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  if (job.done) return res.end();

  addClient(req.params.jobId, res);

  req.on('close', () => {
    removeClient(req.params.jobId, res);
  });
});

//  GET /api/jobs/:jobId 
router.get('/jobs/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job introuvable.' });
  res.json({ status: job.status, done: job.done, eventCount: job.events.length });
});

export default router;
