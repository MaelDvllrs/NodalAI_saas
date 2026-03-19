/**
 * perplexity.js — Sends a GEO prompt to Perplexity and returns the raw response.
 * Uses the OpenAI-compatible Perplexity API.
 */

import OpenAI from 'openai';

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
