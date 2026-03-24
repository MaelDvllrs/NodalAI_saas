/**
 * claude.js — Claude Haiku call for the GEO Prompt Generator module.
 *
 * Receives the site profile and proposes a GEO prompt on a theme
 * the site covers but hasn't answered yet.
 */

import Anthropic from '@anthropic-ai/sdk';
import { claudeCreate } from '../../../utils/claudeRetry.js';

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquant dans .env');
  return new Anthropic({ apiKey });
}

/**
 * Build a compact summary of the site profile to inject into the prompt.
 * @param {object} siteProfile
 * @param {string[]} sitemapUrls
 * @returns {string}
 */
function buildSiteContext(siteProfile, sitemapUrls = []) {
  const lines = [];

  if (siteProfile.theme)           lines.push(`Thème du site : ${siteProfile.theme}`);
  if (siteProfile.description)     lines.push(`Description : ${siteProfile.description}`);
  if (siteProfile.targetAudience)  lines.push(`Audience cible : ${siteProfile.targetAudience}`);
  if (siteProfile.language)        lines.push(`Langue : ${siteProfile.language}`);

  if (siteProfile.mainTopics?.length) {
    lines.push(`\nSujets principaux abordés :\n${siteProfile.mainTopics.map(t => `- ${t}`).join('\n')}`);
  }

  const titles = [
    ...(siteProfile.existingBlogTitles ?? []),
    ...(sitemapUrls.slice(0, 40).map(u => {
      try { return decodeURIComponent(new URL(u).pathname.replace(/[-/]/g, ' ').trim()); }
      catch { return null; }
    }).filter(Boolean)),
  ].filter(Boolean).slice(0, 40);

  if (titles.length) {
    lines.push(`\nContenus / pages déjà existants (à NE PAS reproduire) :\n${titles.map(t => `- ${t}`).join('\n')}`);
  }

  if (siteProfile.contentGaps?.length) {
    lines.push(`\nOpportunités de contenu identifiées par l'analyse :\n${siteProfile.contentGaps.map(g => `- ${g}`).join('\n')}`);
  }

  return lines.join('\n');
}

/**
 * Generate 5 linguistic variants of a GEO prompt.
 * @param {string} geoPrompt  — the original prompt
 * @param {string} geoTopic   — the topic (used for context)
 * @returns {Promise<string[]>} — array of 5 variant strings
 */
export async function generateGeoPromptVariants(geoPrompt, geoTopic) {
  const client = getClient();

  const message = await claudeCreate(client, {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: `Tu es un expert en rédaction de requêtes pour IA.
Génère des reformulations d'une question GEO en gardant la même intention mais avec des formulations différentes.
Réponds UNIQUEMENT en JSON valide, sans markdown.`,
    messages: [{
      role: 'user',
      content: `Question originale : "${geoPrompt}"
Sujet : "${geoTopic}"

Génère 5 variantes de cette question avec des formulations différentes (mots différents, tournures différentes, mais même sens).
Chaque variante doit sembler naturellement posée à une IA par un utilisateur différent.

Retourne UNIQUEMENT ce JSON :
{ "variants": ["variante 1", "variante 2", "variante 3", "variante 4", "variante 5"] }`,
    }],
  });

  const raw = message.content[0].text.trim();
  try {
    const jsonStr = raw.startsWith('{') ? raw : raw.match(/\{[\s\S]*\}/)?.[0] || '{}';
    const parsed = JSON.parse(jsonStr);
    const variants = parsed.variants ?? [];
    // Always include original as first variant
    return [geoPrompt, ...variants.slice(0, 5)].slice(0, 6);
  } catch {
    return [geoPrompt];
  }
}

/**
 * Ask Claude Haiku to propose a GEO prompt not yet covered by the site.
 *
 * @param {object}   siteProfile     - SiteProfile from website-scraper
 * @param {string[]} sitemapUrls
 * @param {string[]} existingPrompts - Already-generated prompts to avoid duplicating
 * @returns {Promise<{ geoPrompt: string; geoTopic: string; geoRationale: string }>}
 */
export async function generateGeoPrompt(siteProfile, sitemapUrls = [], existingPrompts = []) {
  const client = getClient();
  const siteContext = buildSiteContext(siteProfile, sitemapUrls);

  const existingBlock = existingPrompts.length > 0
    ? `\n\n⚠️ PROMPTS DÉJÀ GÉNÉRÉS POUR CE SITE (à ne PAS reproduire, ni paraphraser) :\n${existingPrompts.map((p, i) => `${i + 1}. "${p}"`).join('\n')}\n\nLe nouveau prompt doit explorer un angle DIFFÉRENT — nouveau sujet, nouvelle intention, nouveau public cible.`
    : '';

  const systemPrompt = `Tu es un expert en GEO (Generative Engine Optimization) et en stratégie de contenu.
Ton rôle est d'identifier des questions précises que les internautes posent à des IA (ChatGPT, Claude, Perplexity, Gemini...)
sur le thème du site analysé, questions auxquelles le site ne répond pas encore.

Une bonne question GEO :
- Est formulée comme une vraie question posée à une IA ("Comment...", "Quelle est...", "Quels sont...", "Pourquoi...", "Est-ce que...")
- A une réponse factuelle et précise
- N'est pas déjà couverte par le contenu existant du site
- Est directement en lien avec le thème du site
- A du volume de recherche potentiel

Tu dois répondre UNIQUEMENT en JSON valide, sans markdown, sans texte avant ou après.`;

  const userPrompt = `Voici le profil du site à analyser :

${siteContext}${existingBlock}

En te basant sur ce profil, propose UNE seule question GEO pertinente que ce site devrait traiter.

Retourne UNIQUEMENT ce JSON :
{
  "geoPrompt": "La question complète, formulée comme un internaute la poserait à une IA (1 phrase interrogative)",
  "geoTopic": "Le sujet en 3-6 mots (ex: 'Durée de vie des batteries lithium')",
  "geoRationale": "Explication courte (1-2 phrases) : pourquoi cette question est pertinente pour ce site et n'est pas encore couverte"
}`;

  const message = await claudeCreate(client, {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const raw = message.content[0].text.trim();

  try {
    const jsonStr = raw.startsWith('{') ? raw : raw.match(/\{[\s\S]*\}/)?.[0] || '{}';
    const parsed = JSON.parse(jsonStr);
    return {
      geoPrompt:     parsed.geoPrompt     || 'Prompt GEO non généré',
      geoTopic:      parsed.geoTopic      || siteProfile.theme || 'Sujet inconnu',
      geoRationale:  parsed.geoRationale  || '',
    };
  } catch {
    return {
      geoPrompt:    `Que faut-il savoir sur ${siteProfile.theme || 'ce sujet'} ?`,
      geoTopic:     siteProfile.theme || 'Sujet inconnu',
      geoRationale: '',
    };
  }
}
