import Anthropic from '@anthropic-ai/sdk';
import { claudeCreate } from '../../../utils/claudeRetry.js';

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquant dans .env');
  return new Anthropic({ apiKey });
}

function buildEmptyModel(keyword) {
  return {
    keyword,
    avgWordCount:      1500,
    dominantSubtopics: [],
    recurringEntities: [],
    faqQuestions:      [],
    intent:            'informationnelle',
    contentFormat:     'guide',
    hasFaq:            false,
    competitorCount:   0,
    createdAt:         new Date().toISOString(),
  };
}

/**
 * Build a structured semantic model by asking Claude to analyze the SERP snippets.
 *
 * Claude receives titles + meta descriptions of top-10 results and infers:
 *   - avgWordCount, dominantSubtopics, recurringEntities, faqQuestions,
 *     dominant search intent, dominant content format.
 *
 * @param {string}       keyword
 * @param {SerpResult[]} serpResults
 * @returns {Promise<SerpModel>}
 */
export async function buildSerpModel(keyword, serpResults) {
  if (!serpResults || serpResults.length === 0) {
    return buildEmptyModel(keyword);
  }

  const client = getClient();

  const snippetsText = serpResults
    .map((r, i) => `[${i + 1}] TITRE: "${r.title}" | DESCRIPTION: "${r.description}" | URL: ${r.url}`)
    .join('\n');

  const prompt = `Tu es un expert SEO et analyste SERP.

Voici les ${serpResults.length} premiers résultats organiques Google pour le mot-clé : "${keyword}"

${snippetsText}

ANALYSE CES RÉSULTATS et retourne UNIQUEMENT un objet JSON valide (pas de texte avant ou après) avec la structure exacte suivante :

{
  "avgWordCount": <estimation du nombre moyen de mots des articles (basé sur la densité des snippets et la complexité du sujet, entre 800 et 4000)>,
  "dominantSubtopics": [<liste de 6 à 10 sous-thèmes/H2 dominants présents dans les titres et snippets>],
  "recurringEntities": [<liste de 5 à 10 entités nommées récurrentes : marques, outils, personnes, lieux, concepts clés>],
  "faqQuestions": [<liste de 4 à 8 questions fréquemment posées déduites des snippets et du sujet>],
  "intent": "<l'une des 4 intentions : informationnelle | transactionnelle | navigationnelle | commerciale>",
  "contentFormat": "<format dominant parmi : guide | liste | comparaison | définition | tutoriel | avis>",
  "hasFaq": <true si les snippets suggèrent une FAQ ou des questions/réponses, sinon false>
}

RÈGLES :
- Déduis les sous-thèmes depuis les titres et snippets réels
- Identifie les entités mentionnées ou fortement suggérées
- Estime avgWordCount selon la profondeur apparente du contenu
- intent = ce que cherche l'utilisateur en tapant ce mot-clé
- Retourne UNIQUEMENT le JSON, sans texte introductif`;

  try {
    const message = await claudeCreate(client, {
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages:   [{ role: 'user', content: prompt }],
    });

    const raw     = message.content[0].text.trim();
    const jsonStr = raw.startsWith('{') ? raw : raw.match(/\{[\s\S]*\}/)?.[0] || '{}';
    const parsed  = JSON.parse(jsonStr);

    return {
      keyword,
      avgWordCount:      parsed.avgWordCount      ?? 1500,
      dominantSubtopics: Array.isArray(parsed.dominantSubtopics) ? parsed.dominantSubtopics : [],
      recurringEntities: Array.isArray(parsed.recurringEntities) ? parsed.recurringEntities : [],
      faqQuestions:      Array.isArray(parsed.faqQuestions)      ? parsed.faqQuestions      : [],
      intent:            parsed.intent        ?? 'informationnelle',
      contentFormat:     parsed.contentFormat ?? 'guide',
      hasFaq:            parsed.hasFaq        ?? false,
      competitorCount:   serpResults.length,
      createdAt:         new Date().toISOString(),
    };
  } catch (err) {
    console.error('[SERP] Erreur buildSerpModel (Claude):', err?.message);
    return buildEmptyModel(keyword);
  }
}
