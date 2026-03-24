/**
 * Module: GEO Prompt Generator
 *
 * Analyses the site profile produced by the website-scraper and uses
 * Claude Haiku to suggest a GEO (Generative Engine Optimization) prompt —
 * a question that users typically ask AI assistants, on the site's theme,
 * that isn't already answered by existing content.
 *
 * Inputs  (ctx): siteProfile (SiteProfile), sitemapUrls (string[])
 * Outputs (ctx): geoPrompt (string), geoTopic (string), geoRationale (string)
 */

import { generateGeoPrompt, generateGeoPromptVariants } from './claude.js';
import { listGeoPrompts, saveGeoPrompt } from '../prompt-input/db.js';

export const GeoPromptGeneratorModule = {
  /**
   * @param {object} ctx
   * @param {object} config
   * @param {{ emitEvent: Function, jobId: string }} runtime
   */
  async execute(ctx, config = {}, { emitEvent, jobId }) {
    const { siteProfile, sitemapUrls = [], siteUrl: ctxSiteUrl } = ctx;

    if (!siteProfile) {
      throw new Error('GeoPromptGenerator : siteProfile requis — connectez le module "Scraping de site" en amont.');
    }

    // ── Fetch existing prompts for this project to avoid duplicates ───────────
    const siteTheme = siteProfile.theme ?? null;
    const siteUrl   = ctxSiteUrl ?? siteProfile.siteUrl ?? null;
    let existingPrompts = [];
    try {
      const rows = await listGeoPrompts({ siteUrl, siteTheme, limit: 100 });
      existingPrompts = rows.map(r => r.prompt).filter(Boolean);
      if (existingPrompts.length > 0) {
        emitEvent(jobId, {
          type: 'step',
          message: `📚 ${existingPrompts.length} prompt(s) déjà générés pour ce projet — génération d'un angle différent...`,
        });
        existingPrompts.forEach((p, i) => emitEvent(jobId, {
          type: 'step',
          message: `  🚫 ${i + 1}. "${p.slice(0, 100)}${p.length > 100 ? '…' : ''}"`,
        }));
      }
    } catch {
      // Non-blocking — continue without existing prompts
    }

    emitEvent(jobId, {
      type: 'step',
      message: `🔍 Analyse du profil site pour générer un prompt GEO...`,
    });

    const result = await generateGeoPrompt(siteProfile, sitemapUrls, existingPrompts);

    emitEvent(jobId, {
      type: 'step',
      message: `✅ Prompt GEO généré — Sujet : "${result.geoTopic}"`,
    });
    emitEvent(jobId, {
      type: 'step',
      message: `💬 "${result.geoPrompt}"`,
    });

    if (result.geoRationale) {
      emitEvent(jobId, {
        type: 'step',
        message: `📝 Rationale : ${result.geoRationale}`,
      });
    }

    // ── Generate 5 prompt variants ────────────────────────────────────────────
    emitEvent(jobId, { type: 'step', message: `🔀 Génération de 5 variantes du prompt...` });
    const variants = await generateGeoPromptVariants(result.geoPrompt, result.geoTopic);
    emitEvent(jobId, {
      type: 'step',
      message: `✅ ${variants.length} variantes générées`,
    });
    variants.forEach((v, i) => emitEvent(jobId, {
      type: 'step',
      message: `  ${i + 1}. "${v.slice(0, 100)}${v.length > 100 ? '…' : ''}"`,
    }));

    emitEvent(jobId, { type: 'data', key: 'geoPrompt',        value: result.geoPrompt });
    emitEvent(jobId, { type: 'data', key: 'geoTopic',         value: result.geoTopic });
    emitEvent(jobId, { type: 'data', key: 'geoRationale',     value: result.geoRationale });
    emitEvent(jobId, { type: 'data', key: 'geoPromptVariants', value: variants });

    // ── Persist the generated prompt to avoid repeats in future runs ──────────
    try {
      await saveGeoPrompt({
        prompt:    result.geoPrompt,
        topic:     result.geoTopic,
        source:    'generated',
        siteTheme: siteTheme ?? undefined,
        siteUrl:   siteUrl   ?? undefined,
        runId:     jobId,
      });
    } catch {
      // Non-blocking
    }

    return {
      geoPrompt:         result.geoPrompt,
      geoTopic:          result.geoTopic,
      geoRationale:      result.geoRationale,
      geoPromptVariants: variants,
    };
  },
};
