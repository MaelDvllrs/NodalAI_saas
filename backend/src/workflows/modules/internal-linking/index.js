/**
 * Module: Internal Linking
 *
 * Suggests internal links to inject into the generated article,
 * based on the site's crawled pages stored in the database.
 *
 * Inputs  (ctx): mainKeyword, blogContent, siteId (dbSiteId), crawledPages
 * Outputs (ctx): internalLinks
 */

import { getCrawledPages } from '../../../services/site.service.js';

export const InternalLinkingModule = {
  /**
   * @param {WorkflowContext} ctx
   * @param {{ maxLinks?: number }} config
   * @param {{ emitEvent: Function, jobId: string }} runtime
   */
  async execute(ctx, config, { emitEvent, jobId }) {
    const { mainKeyword, dbSiteId, siteUrl } = ctx;
    const maxLinks = config?.maxLinks ?? 5;

    if (!dbSiteId && !siteUrl) {
      emitEvent(jobId, { type: 'step', message: '⚠️ Pas de siteId — maillage interne ignoré' });
      return { internalLinks: [] };
    }

    let pages = [];

    if (dbSiteId) {
      emitEvent(jobId, { type: 'step', message: '🔗 Récupération des URLs internes depuis la base de données...' });
      try {
        const crawledPages = await getCrawledPages(dbSiteId, false);
        pages = crawledPages
          .map(p => ({ url: p.url, title: p.title || '' }))
          .filter(p => p.url);
      } catch (err) {
        emitEvent(jobId, { type: 'step', message: `⚠️ Erreur récupération pages crawlées: ${err.message}` });
      }
    }

    if (pages.length === 0) {
      emitEvent(jobId, { type: 'step', message: '⚠️ Aucune page crawlée disponible pour le maillage interne' });
      return { internalLinks: [] };
    }

    const kw = (mainKeyword ?? '').toLowerCase();
    const scored = pages
      .map(p => {
        const text  = `${p.title} ${p.url}`.toLowerCase();
        const score = kw.split(' ').filter(w => w.length > 2 && text.includes(w)).length;
        return { ...p, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, maxLinks);

    emitEvent(jobId, {
      type: 'step',
      message: `🔗 ${scored.length} lien(s) interne(s) identifié(s) sur ${pages.length} pages crawlées`,
    });

    return { internalLinks: scored };
  },
};
