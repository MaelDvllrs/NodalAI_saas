/**
 * _shared/analyseLlmResponses.js
 *
 * Generic Claude Haiku analysis for any LLM response set (ChatGPT, Gemini, Perplexity…).
 * Extracts questions, sources, common points, content gaps and a GEO summary.
 */

import Anthropic from '@anthropic-ai/sdk';
import { claudeCreate } from '../../../utils/claudeRetry.js';

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquant dans .env');
  return new Anthropic({ apiKey });
}

/**
 * @param {string} originalPrompt
 * @param {string[]} responses
 * @param {string} llmName  - e.g. "ChatGPT", "Gemini", "Perplexity"
 * @returns {Promise<{
 *   questions: string[],
 *   sources: Array<{name:string, url:string|null, type:string, frequency:number}>,
 *   commonPoints: string[],
 *   contentGaps: string[],
 *   responseVariations: string,
 *   summary: string,
 * }>}
 */
export async function analyseLlmResponses(originalPrompt, responses, llmName = 'LLM') {
  const client = getClient();

  const responsesBlock = responses
    .map((r, i) => `### Réponse ${llmName} ${i + 1}\n${r}`)
    .join('\n\n---\n\n');

  const prompt = `Tu es un expert en GEO (Generative Engine Optimization). Analyse les réponses générées par ${llmName} à la même question, afin d'identifier les opportunités de contenu pour se positionner dans les réponses IA.

## Prompt original envoyé à ${llmName} :
"${originalPrompt}"

## Réponses obtenues (${responses.length} passages) :

${responsesBlock}

---

Analyse ces réponses et retourne UNIQUEMENT un JSON valide (sans markdown, sans texte avant/après) :

{
  "questions": ["Question pertinente soulevée ou implicite dans les réponses (5-10 questions)"],
  "sources": [
    { "name": "Nom de la source", "url": "URL ou null", "type": "site_web | étude | livre | organisation | outil | autre", "frequency": 1 }
  ],
  "commonPoints": ["Point systématiquement présent dans toutes les réponses"],
  "contentGaps": ["Sujet effleuré mais non approfondi — opportunité GEO"],
  "responseVariations": "Description courte des différences entre les ${responses.length} réponses",
  "summary": "Résumé GEO complet (400-600 mots) : ce que dit ${llmName} sur ce sujet, les sources citées, les questions soulevées, les opportunités de contenu pour se positionner dans les réponses IA."
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
      questions: [], sources: [], commonPoints: [], contentGaps: [],
      responseVariations: '', summary: responses.join('\n\n---\n\n'),
    };
  }
}
