/**
 * claude.js — Generates visual HTML schemas (tables, comparisons, process flows)
 * from blog content using Claude Sonnet.
 */

import Anthropic from '@anthropic-ai/sdk';
import { claudeCreate } from '../../../utils/claudeRetry.js';

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquant dans .env');
  return new Anthropic({ apiKey });
}

/**
 * Generate 2–4 visual HTML schemas adapted to the blog content.
 *
 * @param {object} params
 * @param {string} params.blogContent  - Raw blog text (used to determine relevant schema types)
 * @param {string} params.mainKeyword  - Main topic / keyword for context
 * @param {string} params.tone         - Writing tone
 * @returns {Promise<Array<{ position: string, type: string, code: string }>>}
 */
export async function generateVisualSchemas({ blogContent, mainKeyword, tone = 'expert et pédagogique' }) {
  const client = getClient();

  // Pass a trimmed excerpt to stay within token budget
  const excerpt = blogContent.slice(0, 3000);

  const prompt = `Tu es un expert en design de contenu web et en SEO. À partir de l'article ci-dessous, génère 3 schémas visuels HTML pertinents.

## THÈME : "${mainKeyword}"
## TON : ${tone}

## EXTRAIT DE L'ARTICLE :
${excerpt}

---

## RÈGLES ABSOLUES
- Attributs style="..." inline UNIQUEMENT — INTERDIT : class=, id=, <style>, CSS externe
- Responsive : max-width sur chaque div racine
- Couleurs sobres : fond #f9fafb ou #f3f4f6, texte #111827 ou #374151, accent #2563eb
- Le contenu doit être directement lié au thème de l'article
- Données réelles extraites du contenu (pas de placeholders)

---

## FORMAT DE SORTIE STRICT

Génère exactement 3 schémas. Pour chacun, utilise ce format :

📌 SCHEMA 1 - Type : [tableau comparatif | checklist | processus | timeline | synthèse] - À insérer après : [H2 ou section concernée]
\`\`\`html
<div style="...">...</div>
\`\`\`

📌 SCHEMA 2 - Type : [...] - À insérer après : [...]
\`\`\`html
...
\`\`\`

📌 SCHEMA 3 - Type : [...] - À insérer après : [...]
\`\`\`html
...
\`\`\`

## TYPES DE SCHÉMAS RECOMMANDÉS (choisis les plus adaptés au contenu) :

**Tableau comparatif** — compare 2-4 options/solutions/outils sur plusieurs critères :
\`\`\`html
<div style="font-family:sans-serif;max-width:800px;margin:24px auto;overflow-x:auto">
  <table style="width:100%;border-collapse:collapse;font-size:0.9rem">
    <thead>
      <tr style="background:#2563eb;color:#fff">
        <th style="padding:12px 16px;text-align:left">Critère</th>
        <th style="padding:12px 16px;text-align:left">Option A</th>
        <th style="padding:12px 16px;text-align:left">Option B</th>
      </tr>
    </thead>
    <tbody>
      <tr style="background:#f9fafb">
        <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;font-weight:600">Critère 1</td>
        <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb">Valeur A</td>
        <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb">Valeur B</td>
      </tr>
    </tbody>
  </table>
</div>
\`\`\`

**Processus / étapes** — liste numérotée avec icônes et descriptions :
\`\`\`html
<div style="font-family:sans-serif;max-width:700px;margin:24px auto">
  <div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:16px">
    <div style="min-width:36px;height:36px;border-radius:50%;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.9rem">1</div>
    <div><strong style="display:block;margin-bottom:4px;color:#111827">Titre de l'étape</strong><span style="color:#374151;font-size:0.9rem">Description courte.</span></div>
  </div>
</div>
\`\`\`

**Checklist / avantages** — liste avec coches visuelles :
\`\`\`html
<div style="font-family:sans-serif;max-width:700px;margin:24px auto;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px 24px">
  <h3 style="margin:0 0 12px;color:#166534;font-size:1rem">Points clés</h3>
  <ul style="margin:0;padding:0;list-style:none">
    <li style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px;color:#374151;font-size:0.9rem"><span style="color:#16a34a;font-weight:700;margin-top:1px">✓</span>Point clé 1</li>
  </ul>
</div>
\`\`\`

Génère maintenant les 3 schémas avec des données RÉELLES tirées de l'article.`;

  const message = await claudeCreate(client, {
    model:      'claude-sonnet-4-6',
    max_tokens: 6000,
    messages:   [{ role: 'user', content: prompt }],
  });

  const raw = message.content[0].text;

  // ── Parse schemas ──────────────────────────────────────────────────────────
  const schemas = [];
  for (const part of raw.split(/(?=📌\s*SCHEMA\s*\d+)/i)) {
    if (!/📌/i.test(part)) continue;

    const headerMatch = part.match(/📌\s*SCHEMA\s*\d+\s*-\s*Type\s*:\s*([^-\n]+)(?:\s*-\s*À insérer après\s*:\s*([^\n]+))?/i);
    const type     = headerMatch?.[1]?.trim() ?? 'tableau';
    const position = headerMatch?.[2]?.trim() ?? '';

    const fenced = part.match(/```(?:html)?\s*([\s\S]*?)```/);
    let code = fenced ? fenced[1].trim() : '';
    if (!code) {
      const htmlStart = part.search(/<(div|table|ul|section)/);
      if (htmlStart !== -1) code = part.slice(htmlStart).trim();
    }

    if (code) schemas.push({ type, position, code });
  }

  return schemas;
}
