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

    emitEvent(jobId, {
      type: 'step',
      message: `🔍 Analyse du profil site pour générer un prompt GEO...`,
    });

    const result = await generateGeoPrompt(siteProfile, sitemapUrls);

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

    return {
      geoPrompt:    result.geoPrompt,
      geoTopic:     result.geoTopic,
      geoRationale: result.geoRationale,
    };
  },
};
