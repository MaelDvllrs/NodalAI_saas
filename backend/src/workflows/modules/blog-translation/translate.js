/**
 * Translation helpers for the blog-translation module.
 *
 * - findExternalLinkAlternatives : ask Claude Haiku to suggest equivalent
 *   sources in the target language for each external link.
 * - translateHtml                : translate full HTML with Claude Sonnet,
 *   preserving all tags/attributes.
 * - translateFieldData           : translate plain-text fields (title, meta…)
 *   while skipping slugs, IDs, HTML blobs and non-string values.
 */

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Normalize user-supplied language to English name used in prompts
const LANGUAGE_MAP = {
  français: 'French', french: 'French',
  anglais: 'English', english: 'English',
  espagnol: 'Spanish', spanish: 'Spanish',
  allemand: 'German', german: 'German',
  italien: 'Italian', italian: 'Italian',
  portugais: 'Portuguese', portuguese: 'Portuguese',
  néerlandais: 'Dutch', dutch: 'Dutch',
  polonais: 'Polish', polish: 'Polish',
  japonais: 'Japanese', japanese: 'Japanese',
  chinois: 'Chinese', chinese: 'Chinese',
};

export function normalizeLanguage(lang) {
  return LANGUAGE_MAP[lang?.toLowerCase()] ?? lang ?? 'English';
}

// ── Extract all unique external href values from an HTML string ────────────

export function extractExternalLinks(html, excludeDomain = '') {
  const seen = new Set();
  const regex = /href="(https?:\/\/[^"]+)"/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const url = m[1];
    if (excludeDomain && url.startsWith(excludeDomain)) continue;
    seen.add(url);
  }
  return [...seen];
}

// ── Ask Claude Haiku to suggest equivalent external sources ───────────────

export async function findExternalLinkAlternatives(externalLinks, targetLanguage, targetCountry) {
  if (!externalLinks.length) return {};

  const lang  = normalizeLanguage(targetLanguage);
  const uniq  = [...new Set(externalLinks)].slice(0, 25);

  const prompt = `You are an SEO expert specialising in international content.
For each URL below, suggest the best equivalent source in ${lang} for the ${targetCountry} market.

Rules:
- Prefer authoritative, well-known sources (official sites, Wikipedia, major media, industry leaders)
- If the URL is already suitable for ${targetCountry} / ${lang}, keep it unchanged
- If no good equivalent exists, return null
- Never invent URLs — only suggest URLs you are confident exist
- Return ONLY a JSON object: { "original_url": "replacement_url_or_null" }

URLs:
${uniq.map((u, i) => `${i + 1}. ${u}`).join('\n')}`;

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw  = msg.content[0].text.trim().replace(/```json?\n?/g, '').replace(/```\n?/g, '');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// ── Translate full HTML with Claude Sonnet ────────────────────────────────

export async function translateHtml(html, targetLanguage, targetCountry, linkReplacements = {}) {
  const lang = normalizeLanguage(targetLanguage);

  // Apply link replacements first (before sending to Claude)
  let processed = html;
  for (const [original, replacement] of Object.entries(linkReplacements)) {
    if (replacement && replacement !== 'null') {
      processed = processed.replaceAll(original, replacement);
    }
  }

  const system = `You are a professional HTML content translator and international SEO adapter.
Translate the provided HTML from its original language to ${lang} for the ${targetCountry} market.

Strict rules:
1. Translate ALL visible text (headings, paragraphs, list items, alt attributes, button labels, aria-labels)
2. PRESERVE every HTML tag, attribute, class, id, href, src and data-* attribute exactly as-is
3. PRESERVE every HTML comment (<!-- ... -->) completely unchanged — do NOT translate or modify them
4. Adapt idioms, units and cultural references naturally for ${targetCountry}
5. Maintain keyword density and SEO intent in the translated language
6. Keep the same tone, structure and length
7. Return ONLY the translated HTML — no markdown fences, no explanations, no extra text`;

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system,
    messages: [{ role: 'user', content: `Translate this HTML to ${lang} (${targetCountry}):\n\n${processed}` }],
  });

  return msg.content[0].text.trim();
}

// ── Translate plain-text fieldData fields ─────────────────────────────────
// Skips: slugs, IDs, URLs, HTML blobs, non-string values.

const SKIP_KEY = /^(slug|_id|id$|url|href|webflow|collection|publish|status|date|created|updated|image|photo|thumb|video|file)/i;
const HTML_KEY = /^(body|post-body|content|html|rich.?text)/i;

export async function translateFieldData(fieldData, targetLanguage, targetCountry) {
  if (!fieldData || typeof fieldData !== 'object') return fieldData;

  const lang = normalizeLanguage(targetLanguage);

  const textFields = {};  // plain strings to batch-translate
  const rest = {};        // everything else, kept as-is

  for (const [key, value] of Object.entries(fieldData)) {
    if (typeof value !== 'string' || SKIP_KEY.test(key)) {
      rest[key] = value;
    } else if (HTML_KEY.test(key) || value.includes('<')) {
      // HTML fields: will be patched after main HTML translation
      rest[key] = value;
    } else {
      textFields[key] = value;
    }
  }

  if (!Object.keys(textFields).length) return { ...rest };

  const prompt = `Translate the following JSON fields to ${lang} for the ${targetCountry} market.
Preserve all JSON keys exactly. Return ONLY the JSON object, no markdown, no explanation.

${JSON.stringify(textFields, null, 2)}`;

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw  = msg.content[0].text.trim().replace(/```json?\n?/g, '').replace(/```\n?/g, '');
    const translated = JSON.parse(raw);
    return { ...rest, ...translated };
  } catch {
    // Fallback: keep originals
    return { ...rest, ...textFields };
  }
}
