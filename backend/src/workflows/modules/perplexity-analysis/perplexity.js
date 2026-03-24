/**
 * perplexity.js — Sends a GEO prompt to Perplexity and returns the raw response.
 * Uses the OpenAI-compatible Perplexity API.
 */

import OpenAI from 'openai';
import { buildGeoMessage } from '../_shared/geoAnalysisPrompt.js';

function getClient() {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY manquant dans .env');
  return new OpenAI({
    apiKey,
    baseURL: 'https://api.perplexity.ai',
  });
}

/**
 * Send a prompt to Perplexity once and return the raw text response.
 * @param {string} prompt
 * @returns {Promise<string>}
 */
export async function askPerplexity(prompt) {
  const client = getClient();

  const completion = await client.chat.completions.create({
    model: 'sonar',
    messages: [
      {
        role: 'system',
        content: 'Tu es un assistant expert. Réponds de façon précise, structurée et détaillée à la question posée. Cite tes sources quand tu les connais.',
      },
      { role: 'user', content: prompt },
    ],
    max_tokens: 1500,
    temperature: 0.7,
  });

  return completion.choices[0]?.message?.content?.trim() ?? '';
}

/**
 * Send a GEO prompt using the structured analysis system prompt.
 * Returns both the text response and the real citations from Perplexity's web search.
 * @param {string} question
 * @returns {Promise<{ text: string, citations: string[] }>}
 */
export async function askPerplexityStructured(question) {
  const client = getClient();
  const completion = await client.chat.completions.create({
    model: 'sonar',
    messages: [{ role: 'user', content: buildGeoMessage(question) }],
    max_tokens: 4000,
    temperature: 0.7,
  });
  const text = completion.choices[0]?.message?.content?.trim() ?? '';
  // Perplexity returns real web search citations in the response
  const citations = (completion.citations ?? []).filter(u => typeof u === 'string' && u.startsWith('http'));
  return { text, citations };
}
