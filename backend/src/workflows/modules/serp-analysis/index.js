/**
 * Module: SERP Analysis
 *
 * Fetches the top organic Google results for the main keyword via DataForSEO.
 *
 * Inputs  (ctx): mainKeyword
 * Outputs (ctx): serpResults, serpModel
 */

import { fetchSerpResults } from './dataforseo.js';

export const SerpAnalysisModule = {
  /**
   * @param {WorkflowContext} ctx
   * @param {{ topN?: number }} config
   * @param {{ emitEvent: Function, jobId: string }} runtime
   */
  async execute(ctx, config, { emitEvent, jobId }) {
    // mainKeyword can come from ctx (chained after keyword-research) or config (standalone)
    const mainKeyword = ctx.mainKeyword ?? config?.keyword ?? null;
    if (!mainKeyword) throw new Error('[serp-analysis] Entrée manquante : "mainKeyword". Ajoutez un module keyword-research avant, ou définissez config.keyword.');

    let serpResults = [];
    emitEvent(jobId, { type: 'step', message: '🔍 Récupération SERP Google top 10...' });

    try {
      serpResults = await fetchSerpResults(mainKeyword);
      emitEvent(jobId, {
        type: 'step',
        message: serpResults.length > 0
          ? `📊 ${serpResults.length} résultats SERP récupérés`
          : '⚠️ Aucun résultat SERP récupéré',
      });
    } catch (err) {
      emitEvent(jobId, { type: 'step', message: `⚠️ SERP erreur (non bloquant): ${err.message}` });
    }

    return { serpResults, serpModel: null };
  },
};
