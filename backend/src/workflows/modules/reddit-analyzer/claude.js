/**
 * claude.js — Claude Sonnet analysis for the Reddit Analyzer module.
 *
 * Two sequential calls:
 *   1. analyzeRedditPatterns  — identifies content types, subreddits, engagement patterns
 *   2. generateRedditStrategy — produces actionable post/comment ideas + AMA strategy
 */

import Anthropic from '@anthropic-ai/sdk';
import { claudeCreate } from '../../../utils/claudeRetry.js';

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquant dans .env');
  return new Anthropic({ apiKey });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds a compact text representation of scraped Reddit posts for the prompt.
 * Limits tokens: max 10 posts × (post body 300 chars + top 5 comments 200 chars each).
 */
function buildPostsContext(posts) {
  return posts.slice(0, 20).map((post, i) => {
    const body = post.selftext?.slice(0, 300) || '(pas de corps de texte)';
    const topComments = post.comments.slice(0, 5).map(c =>
      `    [${c.score > 0 ? '+' + c.score : c.score}] ${c.body.slice(0, 200)}`
    ).join('\n');

    return [
      `--- POST ${i + 1} ---`,
      `Subreddit : ${post.subredditPrefixed}`,
      `Titre : ${post.title}`,
      `Score : ${post.score} pts | ${post.numComments} commentaires | Type : ${post.postType}`,
      post.flair ? `Flair : ${post.flair}` : null,
      `Corps : ${body}`,
      `Top commentaires :`,
      topComments || '    (aucun commentaire récupéré)',
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}

// ── Call 1 : Pattern analysis ─────────────────────────────────────────────────

/**
 * Analyzes content patterns across all scraped Reddit posts.
 *
 * @param {object[]} posts       — scraped posts from scraper.js
 * @param {string}   siteTheme   — theme of the site (from site profile)
 * @param {string[]} prompts     — GEO prompts that were tested
 * @returns {Promise<object>}    — contentPatterns object
 */
export async function analyzeRedditPatterns(posts, siteTheme, prompts = []) {
  if (!posts.length) return null;

  const client = getClient();
  const postsContext = buildPostsContext(posts);

  const promptsList = prompts.length
    ? `\nPrompts GEO testés sur ChatGPT qui ont cité ces posts :\n${prompts.map((p, i) => `${i + 1}. "${p}"`).join('\n')}`
    : '';

  const systemPrompt = `Tu es un expert en stratégie Reddit et GEO (Generative Engine Optimization).
Tu analyses des posts Reddit cités par des IA (ChatGPT, etc.) en réponse à des questions sur un sujet donné.
Ton objectif : identifier précisément POURQUOI ces contenus sont cités par les IA et ce qui les rend autoritaires.
Tu réponds UNIQUEMENT en JSON valide, sans markdown ni texte autour.`;

  const userPrompt = `Sujet du site : "${siteTheme}"
${promptsList}

Voici les ${posts.length} posts Reddit qui ont été cités par des IA lors de tests de prompts GEO :

${postsContext}

Analyse en profondeur ces posts et retourne ce JSON :
{
  "topSubreddits": [
    { "name": "r/nom", "postCount": 2, "avgScore": 450, "why": "Explication courte pourquoi ce subreddit est valorisé" }
  ],
  "contentTypes": [
    { "type": "Guide étape par étape", "count": 3, "avgScore": 620, "characteristics": ["Listes numérotées", "Exemples concrets"] }
  ],
  "engagementPatterns": {
    "avgScore": 0,
    "avgComments": 0,
    "bestPostingTime": "observations sur les dates/moments",
    "titlePatterns": ["Patterns de titres qui fonctionnent"],
    "contentLength": "court/moyen/long — observations",
    "tone": "description du ton dominant"
  },
  "whatAiValues": [
    "Raison 1 pour laquelle les IA citent ces contenus",
    "Raison 2",
    "Raison 3"
  ],
  "topKeyThemes": [
    "Thème 1 récurrent dans les posts cités",
    "Thème 2",
    "Thème 3"
  ],
  "gapsIdentified": [
    "Sujet non couvert sur Reddit qui serait cité si traité",
    "Sujet 2"
  ]
}`;

  const message = await claudeCreate(client, {
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const raw = message.content[0].text.trim();
  try {
    const jsonStr = raw.startsWith('{') ? raw : raw.match(/\{[\s\S]*\}/)?.[0] || '{}';
    return JSON.parse(jsonStr);
  } catch {
    console.warn('[reddit-analyzer] pattern analysis JSON parse failed');
    return null;
  }
}

// ── Call 2 : Strategy generation ──────────────────────────────────────────────

/**
 * Generates an actionable Reddit strategy based on pattern analysis.
 *
 * @param {object[]} posts       — scraped posts
 * @param {object}   patterns    — result from analyzeRedditPatterns
 * @param {string}   siteTheme   — theme of the site
 * @param {string}   siteUrl     — site URL (optional, for self-promotion guidance)
 * @returns {Promise<object>}    — strategy object
 */
export async function generateRedditStrategy(posts, patterns, siteTheme, siteUrl = '') {
  const client = getClient();
  const postsContext = buildPostsContext(posts.slice(0, 10)); // fewer posts, focus on strategy

  const patternsContext = patterns
    ? JSON.stringify(patterns, null, 2)
    : '(analyse de patterns non disponible)';

  const systemPrompt = `Tu es un expert en stratégie Reddit et en growth hacking éthique.
Tu génères des plans d'action concrets pour qu'un site web gagne en autorité sur Reddit,
ce qui améliore son référencement dans les IA génératives (GEO).
Les stratégies doivent être authentiques, apporter de la valeur, et respecter les règles Reddit (pas de spam).
Tu réponds UNIQUEMENT en JSON valide, sans markdown ni texte autour.`;

  const userPrompt = `Sujet du site : "${siteTheme}"${siteUrl ? `\nURL du site : ${siteUrl}` : ''}

Analyse des patterns identifiés :
${patternsContext}

Exemples de posts Reddit cités par les IA :
${postsContext}

Génère un plan d'action Reddit complet et retourne ce JSON :
{
  "postIdeas": [
    {
      "title": "Titre exact du post Reddit à publier",
      "subreddit": "r/nom",
      "type": "Guide | FAQ | Discussion | AMA | Comparatif | Retour d'expérience",
      "hook": "Première phrase d'accroche du post (1-2 phrases percutantes)",
      "outline": ["Point clé 1", "Point clé 2", "Point clé 3"],
      "geoValue": "Pourquoi ce post sera cité par les IA",
      "priority": "haute | moyenne"
    }
  ],
  "commentTemplates": [
    {
      "context": "Dans quel type de discussion utiliser ce commentaire",
      "targetSubreddits": ["r/nom1", "r/nom2"],
      "template": "Texte complet du commentaire template (avec [VARIABLE] pour les parties à personnaliser)",
      "tone": "Expert | Témoignage | Question ouverte | Conseil pratique"
    }
  ],
  "amaStrategy": {
    "recommended": true,
    "subreddit": "r/nom",
    "angle": "L'angle unique qui rend cet AMA pertinent",
    "sampleQuestions": ["Question à anticiper 1", "Question à anticiper 2", "Question à anticiper 3"],
    "timing": "Quand organiser cet AMA (événement, actualité, moment clé)"
  },
  "karmaBuilding": [
    {
      "action": "Action concrète pour construire son karma",
      "subreddit": "r/nom",
      "frequency": "Quotidien | Hebdomadaire | Ponctuel",
      "effort": "5 min | 15 min | 1h"
    }
  ],
  "crossPostingPlan": [
    {
      "contentType": "Type de contenu à crossposter",
      "subreddits": ["r/nom1", "r/nom2"],
      "adaptation": "Comment adapter le contenu pour chaque subreddit"
    }
  ],
  "priorityActions": [
    "Action prioritaire 1 à faire cette semaine",
    "Action prioritaire 2",
    "Action prioritaire 3"
  ]
}`;

  const message = await claudeCreate(client, {
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const raw = message.content[0].text.trim();
  try {
    const jsonStr = raw.startsWith('{') ? raw : raw.match(/\{[\s\S]*\}/)?.[0] || '{}';
    return JSON.parse(jsonStr);
  } catch {
    console.warn('[reddit-analyzer] strategy generation JSON parse failed');
    return null;
  }
}
