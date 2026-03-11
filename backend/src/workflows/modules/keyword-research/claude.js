import Anthropic from '@anthropic-ai/sdk';
import { claudeCreate } from '../../../utils/claudeRetry.js';

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquant dans .env');
  return new Anthropic({ apiKey });
}

/**
 * Ask Claude to suggest 5 specific keyword candidates (not the theme itself)
 * that could be used as a main SEO keyword for an article about the given theme.
 * Returns an array of 5 strings.
 */
export async function suggestKeywordCandidates(theme) {
  const client = getClient();

  const message = await claudeCreate(client, {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: `Tu es un expert SEO français. Pour un article de blog sur le thème "${theme}", propose 5 expressions de recherche en français que des internautes tapent réellement sur Google. Ces expressions doivent :
- Être différentes du thème lui-même
- Être des requêtes longue-traîne (2 à 5 mots)
- Avoir une intention informationnelle ou transactionnelle claire
- Être en français

Retourne UNIQUEMENT un tableau JSON de 5 chaînes, sans texte avant ou après.
Exemple : ["expression 1", "expression 2", "expression 3", "expression 4", "expression 5"]`,
      },
    ],
  });

  try {
    const raw = message.content[0].text.trim();
    const jsonStr = raw.startsWith('[') ? raw : raw.match(/\[[\s\S]*\]/)?.[0] || '[]';
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    return [];
  }
}
