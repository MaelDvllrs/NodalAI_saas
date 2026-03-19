/**
 * openai.js — Sends a GEO prompt to ChatGPT and returns the raw response.
 */

import OpenAI from 'openai';

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY manquant dans .env');
  return new OpenAI({ apiKey });
}

/**
 * Send a prompt to ChatGPT once and return the raw text response.
 * @param {string} prompt
 * @returns {Promise<string>}
 */
export async function askChatGpt(prompt) {
  const client = getClient();

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
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
 * Send the same prompt to ChatGPT N times and collect all responses.
 * @param {string} prompt
 * @param {number} runs - number of times to send (default: 3)
 * @returns {Promise<string[]>}
 */
export async function askChatGptMultiple(prompt, runs = 3) {
  const results = [];
  for (let i = 0; i < runs; i++) {
    const response = await askChatGpt(prompt);
    results.push(response);
  }
  return results;
}
