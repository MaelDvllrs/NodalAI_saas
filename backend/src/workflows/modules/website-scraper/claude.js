/**
 * claude.js — Claude analysis for the website-scraper module.
 *
 * Takes raw scraped page data and returns a structured SiteProfile.
 */

import Anthropic from '@anthropic-ai/sdk';
import { claudeCreate } from '../../../utils/claudeRetry.js';

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquant dans .env');
  return new Anthropic({ apiKey });
}

/**
 * Build a concise textual summary of scraped pages to feed to Claude.
 * @param {import('./scraper.js').PageData[]} pages
 * @returns {string}
 */
function buildPagesSummary(pages) {
  return pages
    .map((p, i) => [
      `### Page ${i + 1}: ${p.url}`,
      `Titre: ${p.title}`,
      p.metaDescription ? `Meta description: ${p.metaDescription}` : '',
      p.h1 ? `H1: ${p.h1}` : '',
      p.h2s?.length ? `H2s: ${p.h2s.join(' | ')}` : '',
      p.bodyText ? `Extrait: ${p.bodyText.slice(0, 600)}` : '',
    ].filter(Boolean).join('\n'))
    .join('\n\n');
}

/**
 * Analyse scraped pages with Claude and return a structured SiteProfile.
 *
 * @param {string} siteUrl
 * @param {import('./scraper.js').PageData[]} pages
 * @param {string[]} sitemapUrls
 * @returns {Promise<SiteProfile>}
 */
export async function analyseSiteWithClaude(siteUrl, pages, sitemapUrls) {
  const client = getClient();
  const summary = buildPagesSummary(pages);

  const prompt = `Tu es un expert en stratégie de contenu et SEO. Analyse les pages web suivantes provenant du site ${siteUrl} et retourne une analyse structurée en JSON.

Pages scrapées :
${summary}

${sitemapUrls.length > 0 ? `URLs du sitemap (${sitemapUrls.length} pages détectées) :
${sitemapUrls.slice(0, 30).join('\n')}
${sitemapUrls.length > 30 ? `... et ${sitemapUrls.length - 30} autres` : ''}` : ''}

Retourne UNIQUEMENT un objet JSON valide avec cette structure exacte (sans markdown, sans texte avant/après) :
{
  "theme": "thème général du site en 5-10 mots",
  "description": "description du site en 1-2 phrases",
  "language": "fr" ou "en" etc.,
  "tone": "professionnel / décontracté / technique / pédagogique / commercial",
  "targetAudience": "description de l'audience cible en 1 phrase",
  "mainTopics": ["sujet 1", "sujet 2", "sujet 3", "..."],
  "contentGaps": ["opportunité de contenu 1", "opportunité 2", "..."],
  "blogPattern": "/blog/" ou "/articles/" etc. ou null si non détecté,
  "existingBlogTitles": ["titre article 1", "titre article 2", "..."],
  "writingStyle": "description courte du style rédactionnel observé",
  "keywords": ["mot-clé 1", "mot-clé 2", "mot-clé 3", "..."],
  "recommendedToneForGeneration": "ton recommandé pour la génération de contenu cohérent avec le site"
}`;

  const message = await claudeCreate(client, {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = message.content[0].text.trim();

  try {
    const jsonStr = raw.startsWith('{') ? raw : raw.match(/\{[\s\S]*\}/)?.[0] || '{}';
    return JSON.parse(jsonStr);
  } catch {
    // Fallback: return minimal profile from page titles
    return {
      theme: pages[0]?.title || siteUrl,
      description: pages[0]?.metaDescription || '',
      language: pages[0]?.lang || 'fr',
      tone: 'professionnel',
      targetAudience: 'À déterminer',
      mainTopics: [],
      contentGaps: [],
      blogPattern: null,
      existingBlogTitles: [],
      writingStyle: '',
      keywords: [],
      recommendedToneForGeneration: 'Expert et pédagogique',
    };
  }
}
