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
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: `Tu es un expert SEO français spécialisé en recherche de mots-clés longue-traîne.
Ta réponse finale doit être UNIQUEMENT un tableau JSON valide, sans texte avant ou après.`,
    messages: [
      {
        role: 'user',
        content: `Thème principal : "${theme}"

Étape 1 — Recherche web :
Effectue une recherche sur "${theme}" pour récupérer les résultats actuels Google.

Étape 2 — Analyse :
Examine les titres, H2/H3 et questions "People also ask" des résultats.

Étape 3 — Extraction :
Identifie 5 expressions longue-traîne (2 à 5 mots) en français qui :
- Contiennent le mot "${theme}" ou un synonyme très proche (même sujet, même intention)
- Sont des variantes de recherche réelles autour de "${theme}" (pas un sujet connexe différent)
- Ont une intention informationnelle claire

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
