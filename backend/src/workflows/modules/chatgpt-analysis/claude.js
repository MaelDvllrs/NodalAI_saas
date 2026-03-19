/**
 * claude.js — Uses Claude Haiku to analyse the 3 ChatGPT responses.
 *
 * Extracts:
 *  - Relevant follow-up questions surfaced by the responses
 *  - Sources / references cited across the 3 responses
 *  - A comprehensive GEO-oriented summary
 */

import Anthropic from '@anthropic-ai/sdk';
import { claudeCreate } from '../../../utils/claudeRetry.js';

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquant dans .env');
  return new Anthropic({ apiKey });
}

/**
 * @param {string} originalPrompt - The prompt that was sent to ChatGPT
 * @param {string[]} responses    - Array of 3 ChatGPT responses
 * @returns {Promise<{
 *   questions: string[],
 *   sources: Array<{name: string, url: string|null, type: string}>,
 *   commonPoints: string[],
 *   contentGaps: string[],
 *   summary: string,
 * }>}
 */
export async function analyseChatGptResponses(originalPrompt, responses) {
  const client = getClient();

  const responsesBlock = responses
    .map((r, i) => `### Réponse ChatGPT ${i + 1}\n${r}`)
    .join('\n\n---\n\n');

  const prompt = `Tu es un expert en GEO (Generative Engine Optimization). Ton rôle est d'analyser plusieurs réponses générées par ChatGPT à la même question, afin d'identifier les opportunités de contenu pour se positionner dans les réponses IA.

## Prompt original envoyé à ChatGPT :
"${originalPrompt}"

## Réponses obtenues (${responses.length} passages) :

${responsesBlock}

---

Analyse ces réponses et retourne UNIQUEMENT un JSON valide (sans markdown, sans texte avant/après) avec cette structure :

{
  "questions": [
    "Question pertinente soulevée ou implicite dans les réponses (5-10 questions)",
    "..."
  ],
  "sources": [
    {
      "name": "Nom de la source ou du site mentionné",
      "url": "URL si mentionnée, sinon null",
      "type": "site_web | étude | livre | organisation | outil | autre",
      "frequency": 1
    }
  ],
  "commonPoints": [
    "Point commun entre les 3 réponses (ce que ChatGPT dit systématiquement)",
    "..."
  ],
  "contentGaps": [
    "Sujet effleuré mais pas approfondi — opportunité de contenu GEO",
    "..."
  ],
  "responseVariations": "Description courte de comment les 3 réponses diffèrent entre elles",
  "summary": "Résumé complet (400-600 mots) orienté GEO : ce que dit ChatGPT sur ce sujet, les sources qu'il cite, les questions qu'il soulève, et les opportunités pour créer du contenu qui se positionne dans les réponses IA. Ce résumé servira de base pour la génération de contenu GEO."
}`;

  const message = await claudeCreate(client, {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = message.content[0].text.trim();

  try {
    const jsonStr = raw.startsWith('{') ? raw : raw.match(/\{[\s\S]*\}/)?.[0] || '{}';
    const parsed = JSON.parse(jsonStr);
    return {
      questions:          parsed.questions          ?? [],
      sources:            parsed.sources            ?? [],
      commonPoints:       parsed.commonPoints       ?? [],
      contentGaps:        parsed.contentGaps        ?? [],
      responseVariations: parsed.responseVariations ?? '',
      summary:            parsed.summary            ?? '',
    };
  } catch {
    return {
      questions:          [],
      sources:            [],
      commonPoints:       [],
      contentGaps:        [],
      responseVariations: '',
      summary:            responses.join('\n\n---\n\n'),
    };
  }
}
