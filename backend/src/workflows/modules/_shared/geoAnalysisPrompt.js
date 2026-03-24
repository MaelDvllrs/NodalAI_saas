/**
 * geoAnalysisPrompt.js — Shared GEO analysis prompt (natural text + source extraction).
 *
 * Exports:
 *   buildGeoMessage(question)      → full message string to send to LLM
 *   parseGeoResponse(rawText)      → { rawText, sources[] } object
 *   aggregateGeoResults(responses) → standard geoSources/questions/etc. shape
 */

// ── System prompt template ────────────────────────────────────────────────────

export const GEO_SYSTEM_PROMPT = `Tu es un assistant expert en analyse de contenu et en rédaction SEO.

Ta mission :
1. Répondre à la question comme un article de blog structuré, clair et optimisé SEO
2. Citer les sources que tu utilises directement dans le texte au fil de la rédaction
3. À la FIN de ta réponse, lister TOUTES les sources avec leurs URLs exactes

Règles :
- Réponds de façon naturelle et professionnelle, avec des titres H2/H3
- Cite les sources inline dans le texte au fil de la rédaction
- Cite des **articles et pages spécifiques**, pas uniquement des domaines racine
- Bonne source : https://reddit.com/r/entrepreneur/comments/xyz/mon-post ou https://blog.hubspot.com/marketing/article-specifique
- Mauvaise source : https://reddit.com ou https://hubspot.com (trop génériques, à éviter)
- Si tu n'as pas l'URL exacte d'un article → mets null plutôt qu'un domaine racine
- Inclure des posts Reddit, des articles de blog, des threads forum quand c'est pertinent

FORMAT DE FIN OBLIGATOIRE (respecte exactement ce format, toujours à la fin) :

---
## Sources
- **Titre de l'article ou du post** : https://url-complete-et-specifique.com/chemin/vers/la-page
- **Post Reddit** : https://reddit.com/r/subreddit/comments/id/titre-du-post
- **Source sans URL certaine** : null
---

Question :
{{PROMPT}}`;

// ── Message builder ───────────────────────────────────────────────────────────

/**
 * Builds the full user message to send (system prompt + question).
 * @param {string} question
 * @returns {string}
 */
export function buildGeoMessage(question) {
  return GEO_SYSTEM_PROMPT.replace('{{PROMPT}}', question);
}

// ── Source type inference ─────────────────────────────────────────────────────

function inferSourceType(url) {
  if (!url) return 'website';
  const u = url.toLowerCase();
  if (u.includes('reddit.com'))                               return 'forum';
  if (u.includes('g2.com') || u.includes('capterra.com') ||
      u.includes('trustpilot') || u.includes('getapp'))      return 'comparison';
  if (u.includes('medium.com') || u.includes('substack') ||
      u.includes('blog.') || u.includes('/blog/'))           return 'blog';
  return 'website';
}

// ── Response parser ───────────────────────────────────────────────────────────

/**
 * Parses a natural-text LLM response.
 * Extracts sources from the "## Sources" section at the end.
 *
 * @param {string} raw
 * @returns {{ rawText: string, sources: { name: string, url: string|null, type: string }[] }|null}
 */
export function parseGeoResponse(raw) {
  if (!raw) return null;

  const sources = [];

  // Extract the "## Sources" block at the end
  const sourcesMatch = raw.match(/##\s*Sources\s*\n([\s\S]+?)(?:\n---\s*$|\n##|\s*$)/i);
  if (sourcesMatch) {
    const lines = sourcesMatch[1].split('\n');
    for (const line of lines) {
      // Match: "- **Name** : https://url" or "- Name : https://url" or "- Name : null"
      const m = line.match(/^\s*-\s+\**([^*:\n]+?)\**\s*:\s*(.+)$/);
      if (!m) continue;
      const name = m[1].trim();
      const rawUrl = m[2].trim();
      const url = rawUrl === 'null' || !rawUrl.startsWith('http') ? null : rawUrl.split(/\s/)[0];
      if (!name) continue;
      sources.push({
        name,
        url,
        type: inferSourceType(url),
      });
    }
  }

  return { rawText: raw, sources };
}

// ── Aggregator ────────────────────────────────────────────────────────────────

/**
 * Merges multiple parsed GEO responses into the standard pipeline output shape.
 * Deduplicates sources by URL (or name when URL is null), counts frequency.
 *
 * @param {({ rawText: string, sources: object[] }|null)[]} parsedResponses
 * @returns {{
 *   sources: object[],
 *   questions: string[],
 *   commonPoints: string[],
 *   contentGaps: string[],
 *   responseVariations: string,
 *   summary: string,
 * }}
 */
export function aggregateGeoResults(parsedResponses) {
  const valid = parsedResponses.filter(Boolean);

  const sourceMap = new Map(); // key → { name, url, type, frequency }
  const summaries = [];

  for (const r of valid) {
    for (const src of (r.sources ?? [])) {
      const key = src.url || src.name?.toLowerCase() || '';
      if (!key) continue;
      if (sourceMap.has(key)) {
        sourceMap.get(key).frequency += 1;
      } else {
        sourceMap.set(key, {
          name:      src.name  ?? '',
          url:       src.url   ?? null,
          type:      src.type  ?? 'website',
          frequency: 1,
        });
      }
    }

    // First paragraph of rawText as a summary snippet
    if (r.rawText) {
      const firstPara = r.rawText.split(/\n{2,}/)[0]?.trim();
      if (firstPara && firstPara.length > 30) summaries.push(firstPara);
    }
  }

  // Sort: highest frequency first, then Reddit/forum first for ties
  const sources = [...sourceMap.values()].sort((a, b) => {
    if (b.frequency !== a.frequency) return b.frequency - a.frequency;
    const aIsReddit = (a.url ?? a.name ?? '').toLowerCase().includes('reddit');
    const bIsReddit = (b.url ?? b.name ?? '').toLowerCase().includes('reddit');
    return (bIsReddit ? 1 : 0) - (aIsReddit ? 1 : 0);
  });

  return {
    sources,
    questions:          [],
    commonPoints:       summaries.slice(0, 5),
    contentGaps:        [],
    responseVariations: `${valid.length}/${parsedResponses.length} variantes analysées — ${sources.length} sources extraites`,
    summary:            summaries.join('\n\n---\n\n'),
  };
}
