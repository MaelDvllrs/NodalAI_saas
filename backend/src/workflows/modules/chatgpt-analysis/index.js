/**
 * Module: ChatGPT Analysis
 *
 * Sends a GEO prompt to ChatGPT 3 times, collects the responses,
 * then uses Claude Haiku to extract:
 *   - Relevant questions surfaced by the responses
 *   - Sources cited by ChatGPT
 *   - Common points across the 3 responses
 *   - Content gaps (GEO opportunities)
 *   - A comprehensive GEO-oriented summary
 *
 * Inputs  (ctx): geoPrompt (string, required)
 * Outputs (ctx): chatgptResponses, geoQuestions, geoSources,
 *                geoCommonPoints, geoContentGaps, geoAnalysis
 */

import { askChatGpt }              from './openai.js';
import { analyseChatGptResponses } from './claude.js';

export const ChatGptAnalysisModule = {
  async execute(ctx, config = {}, { emitEvent, jobId }) {
    const prompt = ctx.geoPrompt || (config.prompt ?? '');

    if (!prompt) {
      throw new Error('ChatGptAnalysis : geoPrompt requis — connectez un module "Prompt GEO" ou "Générateur de prompt GEO" en amont.');
    }

    const runs = Math.min(Math.max(parseInt(config.runs ?? '3', 10), 1), 5);

    // ── 1. Send to ChatGPT N times ────────────────────────────────────────────
    emitEvent(jobId, {
      type: 'step',
      message: `🤖 Envoi du prompt à ChatGPT (${runs} passages)...`,
    });
    emitEvent(jobId, {
      type: 'step',
      message: `💬 "${prompt.slice(0, 120)}${prompt.length > 120 ? '…' : ''}"`,
    });

    const responses = [];
    for (let i = 0; i < runs; i++) {
      emitEvent(jobId, { type: 'step', message: `📨 Passage ${i + 1}/${runs}...` });
      const response = await askChatGpt(prompt);
      responses.push(response);
      emitEvent(jobId, {
        type: 'step',
        message: `✅ Réponse ${i + 1} reçue (${response.split(/\s+/).length} mots)`,
      });
    }

    // ── 2. Analyse with Claude Haiku ──────────────────────────────────────────
    emitEvent(jobId, {
      type: 'step',
      message: `🧠 Analyse des ${runs} réponses avec Claude Haiku...`,
    });

    const analysis = await analyseChatGptResponses(prompt, responses);

    emitEvent(jobId, {
      type: 'step',
      message: `✅ Analyse terminée — ${analysis.questions.length} questions · ${analysis.sources.length} sources identifiées`,
    });

    if (analysis.contentGaps.length) {
      emitEvent(jobId, {
        type: 'step',
        message: `💡 Opportunités GEO : ${analysis.contentGaps.slice(0, 2).join(' | ')}`,
      });
    }

    // ── 3. Emit data events ───────────────────────────────────────────────────
    emitEvent(jobId, { type: 'data', key: 'chatgptResponses', value: responses });
    emitEvent(jobId, { type: 'data', key: 'geoQuestions',     value: analysis.questions });
    emitEvent(jobId, { type: 'data', key: 'geoSources',       value: analysis.sources });
    emitEvent(jobId, { type: 'data', key: 'geoCommonPoints',  value: analysis.commonPoints });
    emitEvent(jobId, { type: 'data', key: 'geoContentGaps',   value: analysis.contentGaps });
    emitEvent(jobId, { type: 'data', key: 'geoAnalysis',      value: analysis.summary });

    return {
      chatgptResponses:      responses,
      geoQuestions:          analysis.questions,
      geoSources:            analysis.sources,
      geoCommonPoints:       analysis.commonPoints,
      geoContentGaps:        analysis.contentGaps,
      geoResponseVariations: analysis.responseVariations,
      geoAnalysis:           analysis.summary,
    };
  },
};
