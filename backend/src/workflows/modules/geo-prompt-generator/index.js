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

import { generateGeoPrompt } from './claude.js';
import { listGeoPrompts, saveGeoPrompt } from '../prompt-input/db.js';

export const GeoPromptGeneratorModule = {
  /**
   * @param {object} ctx
   * @param {object} config
   * @param {{ emitEvent: Function, jobId: string }} runtime
   */
  async execute(ctx, config = {}, { emitEvent, jobId }) {
    const { siteProfile, sitemapUrls = [] } = ctx;

    if (!siteProfile) {
      throw new Error('GeoPromptGenerator : siteProfile requis — connectez le module "Scraping de site" en amont.');
    }

    // ── Fetch existing prompts for this site to avoid duplicates ──────────────
    const siteTheme = siteProfile.theme ?? null;
    let existingPrompts = [];
    try {
      const rows = await listGeoPrompts({ siteTheme, limit: 50 });
      existingPrompts = rows.map(r => r.prompt).filter(Boolean);
      if (existingPrompts.length > 0) {
        emitEvent(jobId, {
          type: 'step',
          message: `📚 ${existingPrompts.length} prompt(s) déjà générés pour ce site — génération d'un angle différent...`,
        });
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

    emitEvent(jobId, { type: 'data', key: 'geoPrompt',    value: result.geoPrompt });
    emitEvent(jobId, { type: 'data', key: 'geoTopic',     value: result.geoTopic });
    emitEvent(jobId, { type: 'data', key: 'geoRationale', value: result.geoRationale });

    // ── Persist the generated prompt to avoid repeats in future runs ──────────
    try {
      await saveGeoPrompt({
        prompt:    result.geoPrompt,
        topic:     result.geoTopic,
        source:    'generated',
        siteTheme: siteTheme ?? undefined,
        runId:     jobId,
      });
    } catch {
      // Non-blocking
    }

    return {
      geoPrompt:    result.geoPrompt,
      geoTopic:     result.geoTopic,
      geoRationale: result.geoRationale,
    };
  },
};
