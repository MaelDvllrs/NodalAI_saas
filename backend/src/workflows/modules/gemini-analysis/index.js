/**
 * Module: Gemini Analysis
 *
 * Sends each GEO prompt variant once to Gemini using the structured analysis
 * prompt. Parses JSON directly and aggregates results across all variants.
 *
 * Inputs  (ctx): geoPromptVariants (string[], preferred) | geoPrompt (string)
 * Outputs (ctx): geminiResponses, geoQuestions, geoSources,
 *                geoCommonPoints, geoContentGaps, geoAnalysis
 */

import { askGemini, askGeminiStructured } from './gemini.js';
import { analyseLlmResponses }            from '../_shared/analyseLlmResponses.js';
import { parseGeoResponse, aggregateGeoResults } from '../_shared/geoAnalysisPrompt.js';
import { verifySourceUrls }              from '../_shared/verifySourceUrls.js';

export const GeminiAnalysisModule = {
  async execute(ctx, config = {}, { emitEvent, jobId }) {
    const mainPrompt = ctx.geoPrompt || (config.prompt ?? '');
    if (!mainPrompt) throw new Error('GeminiAnalysis : geoPrompt requis.');

    const variants = Array.isArray(ctx.geoPromptVariants) && ctx.geoPromptVariants.length > 0
      ? ctx.geoPromptVariants
      : null;

    if (variants) {
      // ── Structured mode ────────────────────────────────────────────────────
      emitEvent(jobId, { type: 'step', message: `✨ Envoi de ${variants.length} variantes à Gemini (prompt structuré JSON)...` });

      const rawResponses = [];
      const parsed = [];

      for (let i = 0; i < variants.length; i++) {
        const variant = variants[i];
        emitEvent(jobId, { type: 'step', message: `📨 Variante ${i + 1}/${variants.length} : "${variant.slice(0, 80)}${variant.length > 80 ? '…' : ''}"` });

        const raw = await askGeminiStructured(variant);
        rawResponses.push(raw);

        const obj = parseGeoResponse(raw);
        parsed.push(obj);

        const srcs = obj?.sources ?? [];
        emitEvent(jobId, {
          type: 'step',
          message: obj
            ? `  ✅ Réponse ${i + 1} reçue — ${srcs.length} source(s) extraite(s)`
            : `  ⚠️ Réponse ${i + 1} non parsable`,
        });

        if (srcs.length) {
          srcs.forEach(src =>
            emitEvent(jobId, { type: 'step', message: `    📌 ${src.name} | url=${src.url ?? 'null'} | type=${src.type}` })
          );
        }
      }

      // ── Claude meta-analysis (textes tronqués pour Haiku) ────────────────────
      emitEvent(jobId, { type: 'step', message: `🧠 Analyse des ${rawResponses.length} réponses avec Claude Haiku...` });
      const truncated = rawResponses.map(r =>
        r.replace(/\n---\s*\n##\s*Sources[\s\S]*$/i, '').trim().slice(0, 1500)
      );
      const metaAnalysis = await analyseLlmResponses(mainPrompt, truncated, 'Gemini');
      emitEvent(jobId, { type: 'step', message: `✅ Analyse — ${metaAnalysis.questions.length} questions · ${metaAnalysis.contentGaps.length} opportunités · ${metaAnalysis.sources.length} sources Claude` });

      // ── Merge sources (texte parsé + Claude) puis vérifier les URLs ──────────
      const aggregated = aggregateGeoResults(parsed);
      const allSourcesMap = new Map();
      for (const src of [...aggregated.sources, ...metaAnalysis.sources]) {
        const key = src.url || src.name?.toLowerCase() || '';
        if (!key) continue;
        if (allSourcesMap.has(key)) allSourcesMap.get(key).frequency = (allSourcesMap.get(key).frequency ?? 1) + 1;
        else allSourcesMap.set(key, { ...src });
      }
      const mergedSources = [...allSourcesMap.values()].sort((a, b) => (b.frequency ?? 1) - (a.frequency ?? 1));
      emitEvent(jobId, { type: 'step', message: `📊 ${mergedSources.length} sources uniques avant vérification` });

      const verifiedSources = await verifySourceUrls(mergedSources, { emitEvent, jobId });

      emitEvent(jobId, { type: 'data', key: 'geminiResponses',       value: rawResponses });
      emitEvent(jobId, { type: 'data', key: 'geoQuestions',          value: metaAnalysis.questions });
      emitEvent(jobId, { type: 'data', key: 'geoSources',            value: verifiedSources });
      emitEvent(jobId, { type: 'data', key: 'geoCommonPoints',       value: metaAnalysis.commonPoints });
      emitEvent(jobId, { type: 'data', key: 'geoContentGaps',        value: metaAnalysis.contentGaps });
      emitEvent(jobId, { type: 'data', key: 'geoAnalysis',           value: metaAnalysis.summary });
      emitEvent(jobId, { type: 'data', key: 'geoResponseVariations', value: metaAnalysis.responseVariations });

      return {
        geminiResponses:       rawResponses,
        geoQuestions:          metaAnalysis.questions,
        geoSources:            verifiedSources,
        geoCommonPoints:       metaAnalysis.commonPoints,
        geoContentGaps:        metaAnalysis.contentGaps,
        geoResponseVariations: metaAnalysis.responseVariations,
        geoAnalysis:           metaAnalysis.summary,
      };

    } else {
      // ── Legacy mode ────────────────────────────────────────────────────────
      const runs = Math.min(Math.max(parseInt(config.runs ?? '3', 10), 1), 200);

      emitEvent(jobId, { type: 'step', message: `✨ Envoi du prompt à Gemini (${runs} passages, mode classique)...` });
      emitEvent(jobId, { type: 'step', message: `💬 "${mainPrompt.slice(0, 120)}${mainPrompt.length > 120 ? '…' : ''}"` });

      const responses = [];
      for (let i = 0; i < runs; i++) {
        emitEvent(jobId, { type: 'step', message: `📨 Passage ${i + 1}/${runs}...` });
        const response = await askGemini(mainPrompt);
        responses.push(response);
        emitEvent(jobId, { type: 'step', message: `✅ Réponse ${i + 1} reçue (${response.split(/\s+/).length} mots)` });
      }

      emitEvent(jobId, { type: 'step', message: `🧠 Analyse des ${runs} réponses avec Claude Haiku...` });
      const analysis = await analyseLlmResponses(mainPrompt, responses, 'Gemini');
      emitEvent(jobId, { type: 'step', message: `✅ Analyse terminée — ${analysis.questions.length} questions · ${analysis.sources.length} sources` });

      emitEvent(jobId, { type: 'data', key: 'geminiResponses',       value: responses });
      emitEvent(jobId, { type: 'data', key: 'geoQuestions',          value: analysis.questions });
      emitEvent(jobId, { type: 'data', key: 'geoSources',            value: analysis.sources });
      emitEvent(jobId, { type: 'data', key: 'geoCommonPoints',       value: analysis.commonPoints });
      emitEvent(jobId, { type: 'data', key: 'geoContentGaps',        value: analysis.contentGaps });
      emitEvent(jobId, { type: 'data', key: 'geoAnalysis',           value: analysis.summary });

      return {
        geminiResponses:       responses,
        geoQuestions:          analysis.questions,
        geoSources:            analysis.sources,
        geoCommonPoints:       analysis.commonPoints,
        geoContentGaps:        analysis.contentGaps,
        geoResponseVariations: analysis.responseVariations,
        geoAnalysis:           analysis.summary,
      };
    }
  },
};
