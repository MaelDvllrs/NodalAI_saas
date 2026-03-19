/**
 * Module: Perplexity Analysis
 *
 * Sends a GEO prompt to Perplexity (sonar) N times, collects the responses,
 * then uses Claude Haiku to extract questions, sources, common points,
 * content gaps and a GEO-oriented summary.
 *
 * Inputs  (ctx): geoPrompt (string, required)
 * Outputs (ctx): perplexityResponses, geoQuestions, geoSources,
 *                geoCommonPoints, geoContentGaps, geoAnalysis
 */

import { askPerplexity }         from './perplexity.js';
import { analyseLlmResponses }   from '../_shared/analyseLlmResponses.js';

export const PerplexityAnalysisModule = {
  async execute(ctx, config = {}, { emitEvent, jobId }) {
    const prompt = ctx.geoPrompt || (config.prompt ?? '');
    if (!prompt) throw new Error('PerplexityAnalysis : geoPrompt requis.');

    const runs = Math.min(Math.max(parseInt(config.runs ?? '3', 10), 1), 5);

    emitEvent(jobId, { type: 'step', message: `🔍 Envoi du prompt à Perplexity (${runs} passages)...` });
    emitEvent(jobId, { type: 'step', message: `💬 "${prompt.slice(0, 120)}${prompt.length > 120 ? '…' : ''}"` });

    const responses = [];
    for (let i = 0; i < runs; i++) {
      emitEvent(jobId, { type: 'step', message: `📨 Passage ${i + 1}/${runs}...` });
      const response = await askPerplexity(prompt);
      responses.push(response);
      emitEvent(jobId, { type: 'step', message: `✅ Réponse ${i + 1} reçue (${response.split(/\s+/).length} mots)` });
    }

    emitEvent(jobId, { type: 'step', message: `🧠 Analyse des ${runs} réponses avec Claude Haiku...` });
    const analysis = await analyseLlmResponses(prompt, responses, 'Perplexity');

    emitEvent(jobId, {
      type: 'step',
      message: `✅ Analyse terminée — ${analysis.questions.length} questions · ${analysis.sources.length} sources`,
    });
    if (analysis.contentGaps.length) {
      emitEvent(jobId, { type: 'step', message: `💡 Opportunités GEO : ${analysis.contentGaps.slice(0, 2).join(' | ')}` });
    }

    emitEvent(jobId, { type: 'data', key: 'perplexityResponses', value: responses });
    emitEvent(jobId, { type: 'data', key: 'geoQuestions',        value: analysis.questions });
    emitEvent(jobId, { type: 'data', key: 'geoSources',          value: analysis.sources });
    emitEvent(jobId, { type: 'data', key: 'geoCommonPoints',     value: analysis.commonPoints });
    emitEvent(jobId, { type: 'data', key: 'geoContentGaps',      value: analysis.contentGaps });
    emitEvent(jobId, { type: 'data', key: 'geoAnalysis',         value: analysis.summary });

    return {
      perplexityResponses:   responses,
      geoQuestions:          analysis.questions,
      geoSources:            analysis.sources,
      geoCommonPoints:       analysis.commonPoints,
      geoContentGaps:        analysis.contentGaps,
      geoResponseVariations: analysis.responseVariations,
      geoAnalysis:           analysis.summary,
    };
  },
};
