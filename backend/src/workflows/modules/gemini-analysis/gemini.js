/**
 * gemini.js — Sends a GEO prompt to Google Gemini and returns the raw response.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY manquant dans .env');
  return new GoogleGenerativeAI(apiKey);
}

/**
 * Send a prompt to Gemini once and return the raw text response.
 * @param {string} prompt
 * @returns {Promise<string>}
 */
export async function askGemini(prompt) {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    systemInstruction: 'Tu es un assistant expert. Réponds de façon précise, structurée et détaillée à la question posée. Cite tes sources quand tu les connais.',
  });

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}
