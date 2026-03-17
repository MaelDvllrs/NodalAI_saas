/**
 * Module: Website Scraper
 *
 * Scrapes a website to extract its theme, tone, main topics, sitemap URLs,
 * existing blog content and key metadata. The resulting `siteProfile` is
 * injected into the workflow context so downstream modules (content-generation,
 * keyword-research…) can generate content that is coherent with the site.
 *
 * Inputs  (ctx): siteUrl  (string — the root URL of the site to analyse)
 * Outputs (ctx): siteProfile  (SiteProfile object), sitemapUrls (string[])
 *
 * SiteProfile shape:
 *   theme, description, language, tone, targetAudience,
 *   mainTopics[], contentGaps[], blogPattern, existingBlogTitles[],
 *   writingStyle, keywords[], recommendedToneForGeneration
 */

import { parseSitemap, scrapeKeypages } from './scraper.js';
import { analyseSiteWithClaude }        from './claude.js';

/** Common sitemap locations to probe in order */
const SITEMAP_CANDIDATES = [
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/sitemap-index.xml',
  '/sitemaps/sitemap.xml',
  '/wp-sitemap.xml',
];

export const WebsiteScraperModule = {
  /**
   * @param {WorkflowContext} ctx
   * @param {{ maxPages?: number }} config
   * @param {{ emitEvent: Function, jobId: string }} runtime
   */
  async execute(ctx, config = {}, { emitEvent, jobId }) {
    const { siteUrl } = ctx;
    if (!siteUrl) throw new Error('siteUrl requis pour WebsiteScraperModule');

    const { maxPages = 6 } = config;

    // ── 1. Normalise base URL ────────────────────────────────────────────────
    let baseUrl;
    try {
      const u = new URL(siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`);
      baseUrl = u.origin;
    } catch {
      throw new Error(`URL invalide : ${siteUrl}`);
    }

    emitEvent(jobId, { type: 'step', message: `🌐 Analyse du site ${baseUrl}...` });

    // ── 2. Discover sitemap ──────────────────────────────────────────────────
    let sitemapUrls = [];
    let sitemapFound = false;

    for (const path of SITEMAP_CANDIDATES) {
      emitEvent(jobId, { type: 'step', message: `🗺️ Recherche sitemap : ${path}` });
      const urls = await parseSitemap(baseUrl + path);
      if (urls.length > 0) {
        sitemapUrls = urls;
        sitemapFound = true;
        emitEvent(jobId, {
          type: 'step',
          message: `✅ Sitemap trouvé (${urls.length} URLs) via ${path}`,
        });
        break;
      }
    }

    if (!sitemapFound) {
      emitEvent(jobId, { type: 'step', message: '⚠️ Aucun sitemap trouvé — scraping homepage uniquement' });
    }

    // ── 3. Scrape key pages ──────────────────────────────────────────────────
    emitEvent(jobId, { type: 'step', message: `📄 Scraping des pages clés (max ${maxPages})...` });

    const pages = await scrapeKeypages(baseUrl, { sitemapUrls, maxPages });

    if (pages.length === 0) {
      throw new Error(`Impossible de scraper le site ${baseUrl} — vérifiez l'URL et l'accessibilité`);
    }

    emitEvent(jobId, { type: 'step', message: `✅ ${pages.length} page(s) scrapée(s)` });

    // ── 4. Claude analysis ───────────────────────────────────────────────────
    emitEvent(jobId, { type: 'step', message: '🤖 Analyse du site avec Claude...' });

    const siteProfile = await analyseSiteWithClaude(baseUrl, pages, sitemapUrls);

    emitEvent(jobId, {
      type: 'step',
      message: `✅ Profil extrait — Thème : "${siteProfile.theme}" · Ton : ${siteProfile.tone}`,
    });

    emitEvent(jobId, { type: 'data', key: 'siteProfile', value: siteProfile });
    emitEvent(jobId, { type: 'data', key: 'sitemapUrls', value: sitemapUrls });

    // ── Push prompt snippet ────────────────────────────────────────────────
    const snippet = buildSiteProfileSnippet(siteProfile, sitemapUrls);
    if (snippet) ctx.promptSnippets.push(snippet);

    return { siteProfile, sitemapUrls };
  },
};

// ── Prompt snippet builder ─────────────────────────────────────────────────────
function buildSiteProfileSnippet(profile, sitemapUrls = []) {
  if (!profile) return null;
  const titles = (profile.existingBlogTitles ?? []).slice(0, 10)
    .map((t) => `- ${t}`).join('\n') || '- Aucun contenu existant.';
  const mainTopics = (profile.mainTopics ?? []).join(', ') || '—';

  const internalLinksBlock = sitemapUrls.length > 0
    ? [
        ``,
        `### URLs internes disponibles (à utiliser pour les liens internes) :`,
        `Ces URLs proviennent du sitemap du site. Lorsque le contenu le permet, intègre des liens internes`,
        `vers ces pages en utilisant le format : [[INTERNE:URL|texte d'ancre descriptif]].`,
        `Minimum 2-3 liens internes si des URLs pertinentes existent.`,
        ``,
        sitemapUrls.slice(0, 50).map((u) => `- ${u}`).join('\n'),
      ].join('\n')
    : '';

  return [
    `## PROFIL DU SITE`,
    `Thème : "${profile.theme ?? 'non défini'}"`,
    `Description : ${profile.description ?? '—'}`,
    `Ton recommandé : ${profile.tone ?? '—'}`,
    `Audience cible : ${profile.targetAudience ?? '—'}`,
    `Sujets principaux : ${mainTopics}`,
    ``,
    `**Contenus existants à NE PAS dupliquer :**`,
    titles,
    internalLinksBlock,
  ].join('\n');
}
