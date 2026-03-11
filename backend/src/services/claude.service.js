/**
 * claude.service.js — Legacy shared Claude utilities.
 *
 * Module-specific prompts now live next to their module:
 *   keyword-research   → workflows/modules/keyword-research/claude.js
 *   semantic-extraction → workflows/modules/semantic-extraction/claude.js
 *   content-generation  → workflows/modules/content-generation/claude.js
 */
import Anthropic from '@anthropic-ai/sdk';
import { claudeCreate } from '../utils/claudeRetry.js';

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquant dans .env');
  return new Anthropic({ apiKey });
}

// ── Secondary keywords ────────────────────────────────────────────────────────
// Used by the legacy pipeline.service.js (no dedicated module yet).
export async function getSecondaryKeywords(mainKeyword, theme) {
  const client = getClient();

  const message = await claudeCreate(client, {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Tu es un expert SEO. Pour un article de blog en français sur le thème "${theme}" avec le mot-clé principal "${mainKeyword}", génère une liste de 30 mots-clés secondaires sémantiquement liés.

Retourne UNIQUEMENT un tableau JSON de chaînes de caractères, sans aucun texte avant ou après.
Exemple : ["mot-clé 1", "mot-clé 2", ...]`,
      },
    ],
  });

  try {
    const raw = message.content[0].text.trim();
    const jsonStr = raw.startsWith('[') ? raw : raw.match(/\[[\s\S]*\]/)?.[0] || '[]';
    return JSON.parse(jsonStr);
  } catch {
    return [];
  }
}
