/**
 * Module: Prompt Input
 *
 * Injects a user-supplied GEO prompt directly into the pipeline context.
 * The prompt is also persisted to the geo_prompts table so it feeds the
 * growing prompt database used to train / inspire future AI-generated prompts.
 *
 * Inputs  (config): prompt (string), topic (string, optional)
 * Outputs (ctx):    geoPrompt, geoTopic
 *
 * Treated as an INPUT_TYPE by the engine — pre-executed before the main loop.
 */

import { saveGeoPrompt } from './db.js';

export const PromptInputModule = {
  async execute(ctx, config = {}, { emitEvent, jobId }) {
    const prompt = (config.prompt || '').trim();
    const topic  = (config.topic  || '').trim();

    if (!prompt) {
      emitEvent(jobId, { type: 'step', message: '⚠️ Prompt Input : aucun prompt configuré, étape ignorée.' });
      return {};
    }

    emitEvent(jobId, {
      type: 'step',
      message: `💬 Prompt GEO injecté : "${prompt.slice(0, 100)}${prompt.length > 100 ? '…' : ''}"`,
    });

    // Save to DB (best-effort, non-blocking)
    saveGeoPrompt({
      prompt,
      topic:     topic     || null,
      source:    'manual',
      siteTheme: ctx.siteProfile?.theme || null,
      userId:    ctx.userId  || null,
      runId:     jobId       || null,
    }).catch(() => {});

    emitEvent(jobId, { type: 'data', key: 'geoPrompt', value: prompt });
    if (topic) emitEvent(jobId, { type: 'data', key: 'geoTopic', value: topic });

    return {
      geoPrompt: prompt,
      ...(topic ? { geoTopic: topic } : {}),
    };
  },
};
