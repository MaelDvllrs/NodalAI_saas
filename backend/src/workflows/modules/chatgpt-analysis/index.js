/**
 * Module: Analyse Open AI (chatgpt-analysis)
 *
 * Pilote Chromium vers chatgpt.com pour envoyer les variantes GEO et obtenir
 * de vraies réponses avec web search activé — les sources citées sont des URLs
 * réelles et vérifiables.
 *
 * Inputs  (ctx): geoPromptVariants (string[], préféré) | geoPrompt (string)
 * Outputs (ctx): chatgptResponses, chatgptHtml, geoQuestions, geoSources,
 *                geoCommonPoints, geoContentGaps, geoAnalysis, geoResponseVariations
 */

import { askChatGptBrowser }   from './browser.js';
import { verifySourceUrls }    from '../_shared/verifySourceUrls.js';
import { analyseLlmResponses } from '../_shared/analyseLlmResponses.js';

export const ChatGptAnalysisModule = {
  async execute(ctx, config = {}, { emitEvent, jobId }) {
    const mainPrompt = ctx.geoPrompt || (config.prompt ?? '');
    if (!mainPrompt) {
      throw new Error(
        'Analyse Open AI : geoPrompt requis — connectez un module "Prompt GEO" ou "Générateur de prompt GEO" en amont.'
      );
    }

    // Utiliser les variantes si disponibles, sinon le prompt principal seul
    const variants = Array.isArray(ctx.geoPromptVariants) && ctx.geoPromptVariants.length > 0
      ? ctx.geoPromptVariants
      : [mainPrompt];

    emitEvent(jobId, {
      type: 'step',
      message: `🤖 Analyse Open AI via Chromium — ${variants.length} variante(s) à envoyer à chatgpt.com`,
    });

    // ── Envoi via navigateur ────────────────────────────────────────────────
    const browserResults = await askChatGptBrowser(variants, { emitEvent, jobId });
    const rawResponses   = browserResults.map(r => r.text);
    const rawHtml        = browserResults.map(r => r.html);
    const rawSourcesHtml = browserResults.map(r => r.sourcesHtml).filter(Boolean);
    const domSources     = browserResults.flatMap(r => r.sources);

    emitEvent(jobId, {
      type: 'step',
      message: `📊 ${domSources.length} source(s) extraite(s) du DOM (inline + panels) — meta-analyse Claude Haiku...`,
    });

    // ── Meta-analyse Claude Haiku ────────────────────────────────────────────
    // On passe le texte brut pour l'analyse sémantique (HTML trop bruité)
    const truncated    = rawResponses.map(r => r.slice(0, 1500));
    const metaAnalysis = await analyseLlmResponses(mainPrompt, truncated, 'ChatGPT');

    emitEvent(jobId, {
      type: 'step',
      message: `✅ Analyse — ${metaAnalysis.questions.length} questions · ${metaAnalysis.contentGaps.length} opportunités`,
    });

    // ── Fusion des sources (DOM + Claude) et vérification ───────────────────
    const allSourcesMap = new Map();
    for (const src of [...domSources, ...metaAnalysis.sources]) {
      const key = src.url || src.name?.toLowerCase() || '';
      if (!key) continue;
      if (allSourcesMap.has(key)) {
        allSourcesMap.get(key).frequency = (allSourcesMap.get(key).frequency ?? 1) + 1;
      } else {
        allSourcesMap.set(key, { ...src });
      }
    }
    const mergedSources = [...allSourcesMap.values()]
      .sort((a, b) => (b.frequency ?? 1) - (a.frequency ?? 1));

    emitEvent(jobId, { type: 'step', message: `🔍 ${mergedSources.length} sources uniques — vérification des URLs...` });
    const verifiedSources = await verifySourceUrls(mergedSources, { emitEvent, jobId });
    emitEvent(jobId, { type: 'step', message: `✅ ${verifiedSources.length} source(s) vérifiée(s)` });

    // ── Émission des données ──────────────────────────────────────────────────
    emitEvent(jobId, { type: 'data', key: 'chatgptResponses',      value: rawResponses });
    emitEvent(jobId, { type: 'data', key: 'chatgptHtml',           value: rawHtml });
    emitEvent(jobId, { type: 'data', key: 'chatgptSourcesHtml',    value: rawSourcesHtml });
    emitEvent(jobId, { type: 'data', key: 'geoQuestions',          value: metaAnalysis.questions });
    emitEvent(jobId, { type: 'data', key: 'geoSources',            value: verifiedSources });
    emitEvent(jobId, { type: 'data', key: 'geoCommonPoints',       value: metaAnalysis.commonPoints });
    emitEvent(jobId, { type: 'data', key: 'geoContentGaps',        value: metaAnalysis.contentGaps });
    emitEvent(jobId, { type: 'data', key: 'geoAnalysis',           value: metaAnalysis.summary });
    emitEvent(jobId, { type: 'data', key: 'geoResponseVariations', value: metaAnalysis.responseVariations });

    return {
      chatgptResponses:      rawResponses,
      chatgptHtml:           rawHtml,
      chatgptSourcesHtml:    rawSourcesHtml,
      geoQuestions:          metaAnalysis.questions,
      geoSources:            verifiedSources,
      geoCommonPoints:       metaAnalysis.commonPoints,
      geoContentGaps:        metaAnalysis.contentGaps,
      geoResponseVariations: metaAnalysis.responseVariations,
      geoAnalysis:           metaAnalysis.summary,
    };
  },
};
