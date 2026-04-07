/**
 * claude.js — GEO blog generation using Claude Sonnet.
 *
 * Key differences vs SEO blog generation:
 *  - H1 is the GEO question (geoPrompt)
 *  - H2s come from geoQuestions extracted by LLM analysis modules
 *  - External links are seeded from geoSources
 *  - Content is optimised to be extracted as a direct answer by AI assistants
 *  - Fixed 1 500–2 000 word target (no KD scaling)
 */

import Anthropic from '@anthropic-ai/sdk';
import { claudeCreate }         from '../../../utils/claudeRetry.js';
import { generateFaqAndSchemas } from '../blog-generation/claude.js';

export { generateFaqAndSchemas };

const WC_MIN = 1400;
const WC_MAX = 2000;

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquant dans .env');
  return new Anthropic({ apiKey });
}

/**
 * Generate a full GEO blog article.
 *
 * @param {object} params
 * @param {string}   params.geoPrompt       - The question to answer (becomes H1)
 * @param {string[]} params.geoQuestions    - Questions from LLM analysis → H2s (optional)
 * @param {Array}    params.geoSources      - Sources from LLM analysis { name, url, type }[]
 * @param {string[]} params.geoCommonPoints - Common points across LLM responses
 * @param {string[]} params.geoContentGaps  - Content gaps / GEO opportunities
 * @param {string}   params.geoAnalysis     - Summary from LLM analysis
 * @param {string}   params.tone            - Writing tone
 * @param {Array}    params.internalUrls    - Internal links { title, url }[]
 * @param {object}   params.siteProfile     - Site profile (theme, audience…)
 * @returns {Promise<{ content: string, promptDebug: string }>}
 */
export async function generateGeoBlogContent({
  geoPrompt,
  geoQuestions  = [],
  geoSources    = [],
  geoCommonPoints  = [],
  geoContentGaps   = [],
  geoAnalysis   = '',
  tone          = 'Expert, clair et pédagogique',
  internalUrls  = [],
  siteProfile   = null,
}) {
  const client = getClient();

  const internalUrlsText = internalUrls.length > 0
    ? internalUrls.map((u) => `- ${u.title} : ${u.url}`).join('\n')
    : 'Aucune URL interne disponible.';

  // ── Build GEO questions → H2 plan block ───────────────────────────────────
  const h2PlanBlock = geoQuestions.length > 0
    ? [
        `## STRUCTURE OBLIGATOIRE — H2s issus de l'analyse IA`,
        `Ces questions ont été posées aux LLMs (ChatGPT / Gemini / Perplexity) et constituent les axes les plus pertinents.`,
        `RÈGLE : chaque H2 doit répondre directement à la question correspondante, de façon factuelle et extractible.`,
        ``,
        ...geoQuestions.slice(0, 8).map((q, i) => `${i + 1}. ${q}`),
      ].join('\n')
    : '';

  // ── Build GEO sources block ────────────────────────────────────────────────
  const sourcesBlock = geoSources.length > 0
    ? [
        `## SOURCES IDENTIFIÉES PAR LES LLMs`,
        `Ces sources ont été citées spontanément par les IA lors de l'analyse — utilise-les en priorité pour les liens externes.`,
        ``,
        ...geoSources.map((s) => {
          const url = s.url ?? null;
          const name = s.name ?? (typeof s === 'string' ? s : '?');
          const type = s.type ? ` (${s.type})` : '';
          return url ? `- ${name}${type} : ${url}` : `- ${name}${type}`;
        }),
      ].join('\n')
    : '';

  // ── Build LLM analysis context block ──────────────────────────────────────
  const analysisContextParts = [];
  if (geoAnalysis) {
    analysisContextParts.push(`## SYNTHÈSE DE L'ANALYSE IA\n${geoAnalysis}`);
  }
  if (geoCommonPoints.length > 0) {
    analysisContextParts.push(
      `## POINTS COMMUNS DES RÉPONSES IA (à reprendre et enrichir)\n` +
      geoCommonPoints.map((p, i) => `${i + 1}. ${p}`).join('\n'),
    );
  }
  if (geoContentGaps.length > 0) {
    analysisContextParts.push(
      `## OPPORTUNITÉS GEO (angles non couverts par les IA — à traiter)\n` +
      geoContentGaps.map((g, i) => `${i + 1}. ${g}`).join('\n'),
    );
  }
  const analysisContext = analysisContextParts.join('\n\n');

  // ── Site context ──────────────────────────────────────────────────────────
  const siteContext = siteProfile
    ? `## CONTEXTE DU SITE\nThème : ${siteProfile.theme ?? '—'} | Audience : ${siteProfile.targetAudience ?? '—'} | Ton recommandé : ${siteProfile.recommendedToneForGeneration ?? tone}`
    : '';

  const systemPrompt = `Tu es un expert en Generative Engine Optimization (GEO) et copywriter spécialisé dans la création de contenu conçu pour être cité et extrait par les IA génératives (ChatGPT, Perplexity, Gemini).

## OBJECTIF PRINCIPAL
Rédige un article de blog GEO-optimisé qui répond de façon exhaustive, structurée et citables à la question : "${geoPrompt}"

L'article doit être conçu pour qu'une IA puisse l'extraire comme réponse directe et autoritaire à cette question.

## PRINCIPES GEO OBLIGATOIRES
- Chaque section commence par une réponse directe à son H2 (principe "answer first")
- Les faits, chiffres et affirmations importantes sont sourcés (liens externes fiables)
- La structure est logique et progressive : définition → contexte → comment → pourquoi → FAQ
- Le contenu est dense en informations, sans remplissage ni généralités
- Utiliser des listes à puces et tableaux pour faciliter l'extraction par les IA

## CONTRAINTE DE LONGUEUR
Corps de l'article (section 5) : ${WC_MIN}–${WC_MAX} mots. Dense et précis, pas verbeux.

## FORMAT DE SORTIE OBLIGATOIRE (identique au blog SEO — respecte ces sections numérotées)

### 1. TITRE SEO (TITLE TAG)
Reformulation SEO de la question (55-60 caractères max). Phrase fluide, pas une liste de mots-clés.

### 2. DESCRIPTION SEO (META DESCRIPTION)
Résumé persuasif (max 160 caractères). Répond directement à l'intention.

### 3. TITRE PRINCIPAL (H1)
Reprend la question posée, légèrement reformulée si nécessaire pour être percutante (max 90 caractères).

### 4. INTRODUCTION
BLOC A — POINTS CLÉS DE L'ARTICLE (5 à 7 points, format liste)
📌 **Points clés de l'article**
- [Point clé 1]
- …

BLOC B — INTRODUCTION (150 à 180 mots)
Commence par une réponse synthétique directe à la question (principe GEO "answer first").
Puis développe le contexte, l'enjeu et annonce le plan.
La première phrase DOIT répondre partiellement à la question.

### 5. CONTENU COMPLET DE L'ARTICLE
Budget : ${WC_MIN}–${WC_MAX} mots. Chaque H2 = 100–150 mots max.

RÈGLES GEO CRITIQUES :
- Chaque H2 commence par 1-2 phrases de réponse directe avant le développement
- Intègre des données chiffrées et des sources fiables (liens [[EXTERNE:URL|ancre]])
- Structure factuelle : affirmation → preuve → exemple → implication

🚨 LIENS INTERNES (minimum 3) : [[INTERNE:URL|texte d'ancre]]
🚨 LIENS EXTERNES (minimum 3) : [[EXTERNE:URL_RÉELLE|texte d'ancre]] — sources fiables uniquement
🚨 SCHÉMAS (minimum 3 dont 1 FAQ) : [[SCHEMA:faq]] [[SCHEMA:table]] [[SCHEMA:comparison]] [[SCHEMA:process]]
   → N'insère QUE les marqueurs — ne génère pas le HTML des schémas
🚨 CITATION (minimum 1) : [[QUOTE:texte de la citation]]

FORMAT CHAQUE SECTION :
## H2 : [Question ou affirmation directe]
→ Réponse directe : [1-2 phrases répondant immédiatement au H2]

[Développement factuel avec sources]

- [Item de liste]

---

#### CONCLUSION OBLIGATOIRE
## Conclusion : [Titre récapitulatif]
→ Réponse directe : [Synthèse en 1-2 phrases]

[Paragraphe de synthèse 80-100 mots + 1 [[INTERNE:URL|ancre]] + appel à l'action]

## RÈGLES GÉNÉRALES
- Ton : ${tone}. Français uniquement.
- Ne jamais inventer de données sans source ou formulation hypothétique
- Ne jamais utiliser le tiret cadratin (—)
- La FAQ et les schémas visuels seront générés dans un second appel — ne les inclus pas ici`;

  // ── User prompt ─────────────────────────────────────────────────────────────
  const userPromptParts = [
    `🚨 CONTRAINTE N°1 — LONGUEUR : section 5 = ${WC_MIN}–${WC_MAX} mots. Stop immédiat à ${WC_MAX} mots.`,
    ``,
    `🚨 CONTRAINTE N°2 — LIENS ET SCHÉMAS :`,
    `  • 3 [[INTERNE:URL|ancre]] minimum (URLs internes ci-dessous)`,
    `  • 3 [[EXTERNE:URL_RÉELLE|ancre]] minimum (sources fiables et vérifiables)`,
    `  • 3 [[SCHEMA:xxx]] minimum dont [[SCHEMA:faq]] obligatoire`,
    `  • 1 [[QUOTE:...]] minimum`,
    ``,
    `🎯 QUESTION À TRAITER (H1) : "${geoPrompt}"`,
    ``,
  ];

  if (h2PlanBlock)      userPromptParts.push(h2PlanBlock,      ``);
  if (sourcesBlock)     userPromptParts.push(sourcesBlock,     ``);
  if (analysisContext)  userPromptParts.push(analysisContext,  ``);
  if (siteContext)      userPromptParts.push(siteContext,      ``);

  userPromptParts.push(
    `**URLs internes disponibles pour le maillage [[INTERNE:URL|ancre]] :**`,
    internalUrlsText,
    ``,
    `---`,
    ``,
    `🚨 RAPPEL FINAL :`,
    `✅ 3 liens internes · ✅ 3 liens externes réels · ✅ [[SCHEMA:faq]] + 2 autres schémas · ✅ 1 [[QUOTE:...]]`,
    `⚠️ N'insère QUE les marqueurs [[SCHEMA:xxx]] — ne génère pas le HTML.`,
    ``,
    `Génère maintenant l'article GEO complet.`,
  );

  const userPrompt = userPromptParts.join('\n');

  const message = await claudeCreate(client, {
    model:      'claude-sonnet-4-6',
    max_tokens: 12000,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: userPrompt }],
  });

  return {
    content:     message.content[0].text,
    promptDebug: `=== SYSTEM ===\n${systemPrompt}\n\n=== USER ===\n${userPrompt}`,
  };
}
