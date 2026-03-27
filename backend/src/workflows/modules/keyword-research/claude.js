import Anthropic from '@anthropic-ai/sdk';
import { claudeCreateWithSearch, extractTextContent } from '../../../utils/claudeRetry.js';

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquant dans .env');
  return new Anthropic({ apiKey });
}

/**
 * Ask Claude (with web search) to find real keyword candidates for the given theme.
 *
 * Process:
 *  1. Claude searches the web for the exact theme
 *  2. Analyses titles, headings, questions and recurring phrases in results
 *  3. Extracts actual long-tail keywords used in those pages/articles
 *
 * Returns an array of up to 5 strings.
 */
export async function suggestKeywordCandidates(theme) {
  const client = getClient();

  const message = await claudeCreateWithSearch(client, {
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    system: `Tu es un expert SEO français. Tu dois extraire des mots-clés réels à partir d'une analyse de résultats web, pas inventer des expressions.
Ta réponse finale doit être UNIQUEMENT un tableau JSON valide, sans texte avant ou après.`,
    messages: [
      {
        role: 'user',
        content: `Thème à analyser : "${theme}"

Étape 1 — Recherche web :
Effectue une recherche sur "${theme}" et une seconde recherche sur "${theme} guide" ou "${theme} comment" pour récupérer des résultats actuels.

Étape 2 — Analyse des résultats :
Examine les titres des articles, les sous-titres (H2/H3), les questions "People also ask" et les expressions qui reviennent dans les résultats.

Étape 3 — Extraction des mots-clés :
À partir de cette analyse, identifie 5 expressions longue-traîne (2 à 5 mots) en français que les internautes tapent réellement, différentes du thème brut.

Retourne UNIQUEMENT ce tableau JSON :
["expression 1", "expression 2", "expression 3", "expression 4", "expression 5"]`,
      },
    ],
  });

  try {
    const raw = extractTextContent(message);
    const jsonStr = raw.startsWith('[') ? raw : raw.match(/\[[\s\S]*\]/)?.[0] || '[]';
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    return [];
  }
}
