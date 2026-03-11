/**
 * Module: Keyword Research
 *
 * Inputs  (ctx): theme | siteProfile.theme | directKeyword | config.theme
 * Outputs (ctx): mainKeyword, kd, kwSearchVolume
 *
 * Theme resolution order (first non-empty wins):
 *   1. ctx.directKeyword           → skip research, use as-is
 *   2. config.directKeyword        → skip research, use as-is
 *   3. ctx.theme                   → Claude candidates + DataForSEO scoring
 *   4. ctx.siteProfile?.theme      → idem, theme comes from website-scraper
 *   5. config.theme                → idem, theme hardcoded in step config
 */

import { getBestKeywordFromCandidates } from './dataforseo.js';
import { suggestKeywordCandidates }     from './claude.js';

export const KeywordResearchModule = {
  /**
   * @param {WorkflowContext} ctx
   * @param {{ theme?: string, directKeyword?: string }} config
   * @param {{ emitEvent: Function, jobId: string }} runtime
   */
  async execute(ctx, config = {}, { emitEvent, jobId }) {
    // ── 1. Resolve direct keyword (no DataForSEO needed) ──────────────────
    const directKeyword = ctx.directKeyword || config.directKeyword;
    if (directKeyword) {
      emitEvent(jobId, { type: 'step', message: `🔑 Mot-clé direct : "${directKeyword}"` });
      emitEvent(jobId, { type: 'data', key: 'mainKeyword', value: directKeyword });
      return { mainKeyword: directKeyword, kd: null, kwSearchVolume: null };
    }

    // ── 2. Resolve theme (ctx → siteProfile → config) ─────────────────────
    const theme =
      ctx.theme                      ||
      ctx.siteProfile?.theme         ||
      config.theme                   ||
      null;

    if (!theme) {
      throw new Error(
        'keyword-research : aucun thème disponible. ' +
        'Fournissez ctx.theme, connectez un module "Scraping de site" en amont, ' +
        'ou renseignez config.theme dans la config du step.'
      );
    }

    if (theme !== ctx.theme) {
      // Log where theme came from
      const src = ctx.siteProfile?.theme ? 'profil du site' : 'config du step';
      emitEvent(jobId, { type: 'step', message: `📌 Thème résolu depuis ${src} : "${theme}"` });
    }

    // ── 3. Claude → candidates ─────────────────────────────────────────────
    emitEvent(jobId, { type: 'step', message: '🤖 Génération de candidats mots-clés avec Claude...' });
    const candidates = await suggestKeywordCandidates(theme);
    if (candidates.length > 0) {
      emitEvent(jobId, {
        type: 'step',
        message: `💡 Candidats : ${candidates.map(c => `"${c}"`).join(', ')}`,
      });
    }

    // ── 4. DataForSEO → best keyword ───────────────────────────────────────
    emitEvent(jobId, { type: 'step', message: '🔍 Analyse métriques SEO via DataForSEO...' });
    const best = await getBestKeywordFromCandidates(theme, candidates);

    emitEvent(jobId, {
      type: 'step',
      message: `✅ Mot-clé retenu : "${best.keyword}" (volume: ${best.search_volume ?? '?'}, KD: ${best.kd ?? '?'}/100)`,
    });
    emitEvent(jobId, { type: 'data', key: 'mainKeyword', value: best.keyword });

    return {
      mainKeyword:    best.keyword,
      kd:             best.kd            ?? null,
      kwSearchVolume: best.search_volume ?? null,
    };
  },
};

