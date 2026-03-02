import Anthropic from '@anthropic-ai/sdk';

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquant dans .env');
  return new Anthropic({ apiKey });
}

// ── Keyword candidates for DataForSEO ────────────────────────────────────────
/**
 * Ask Claude to suggest 5 specific keyword candidates (not the theme itself)
 * that could be used as a main SEO keyword for an article about the given theme.
 * Returns an array of 5 strings.
 */
export async function suggestKeywordCandidates(theme) {
  const client = getClient();

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: `Tu es un expert SEO français. Pour un article de blog sur le thème "${theme}", propose 5 expressions de recherche en français que des internautes tapent réellement sur Google. Ces expressions doivent :
- Être différentes du thème lui-même
- Être des requêtes longue-traîne (2 à 5 mots)
- Avoir une intention informationnelle ou transactionnelle claire
- Être en français

Retourne UNIQUEMENT un tableau JSON de 5 chaînes, sans texte avant ou après.
Exemple : ["expression 1", "expression 2", "expression 3", "expression 4", "expression 5"]`,
      },
    ],
  });

  try {
    const raw = message.content[0].text.trim();
    const jsonStr = raw.startsWith('[') ? raw : raw.match(/\[[\s\S]*\]/)?.[0] || '[]';
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    return [];
  }
}

// ── Secondary keywords ────────────────────────────────────────────────────────
export async function getSecondaryKeywords(mainKeyword, theme) {
  const client = getClient();

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Tu es un expert SEO. Pour un article de blog en français sur le thème "${theme}" avec le mot-clé principal "${mainKeyword}", génère une liste de 30 mots-clés secondaires sémantiquement liés.

Retourne UNIQUEMENT un tableau JSON de chaînes de caractères, sans aucun texte avant ou après.
Exemple : ["mot-clé 1", "mot-clé 2", ...]`,
      },
    ],
  });

  try {
    const raw = message.content[0].text.trim();
    const jsonStr = raw.startsWith('[') ? raw : raw.match(/\[[\s\S]*\]/)?.[0] || '[]';
    return JSON.parse(jsonStr);
  } catch {
    return [];
  }
}

// ── KD → article length ───────────────────────────────────────────────────────
function getLengthFromKd(kd) {
  if (kd === null || kd === undefined) return { range: '1 800 – 2 500 mots', objective: 'Guide complet + maillage interne' };
  if (kd <= 10)  return { range: '700 – 900 mots',            objective: 'Réponse claire et ciblée' };
  if (kd <= 20)  return { range: '800 – 1 200 mots',          objective: 'Contenu structuré avec sous-parties' };
  if (kd <= 35)  return { range: '1 200 – 1 800 mots',        objective: 'Article approfondi + optimisation sémantique' };
  if (kd <= 50)  return { range: '1 800 – 2 500 mots',        objective: 'Guide complet + maillage interne' };
  if (kd <= 70)  return { range: '2 500 – 4 000 mots',        objective: 'Pilier / contenu expert' };
  return               { range: '4 000 mots minimum',         objective: 'Autorité + contenu exhaustif' };
}

// ── SERP-driven optimised outline (Step 3) ──────────────────────────────────
/**
 * Generate an article outline that is guaranteed to cover all dominantSubtopics
 * and recurringEntities from the SERP model. Returns a plain-text structured
 * outline (H2 / H3 titles only) that is injected into generateBlogContent.
 *
 * @param {string}   mainKeyword
 * @param {object}   serpModel   - Output of serp.service.buildSerpModel()
 * @param {string}   theme
 * @param {string}   tone
 * @returns {Promise<string>}    Plain-text outline
 */
export async function generateOptimizedOutline(mainKeyword, serpModel, theme, tone) {
  if (!serpModel || serpModel.dominantSubtopics.length === 0) return '';

  const client = getClient();

  const subtopicsText = serpModel.dominantSubtopics.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const entitiesText  = serpModel.recurringEntities.join(', ') || 'aucune';
  const faqNote       = serpModel.hasFaq ? 'Inclure une section FAQ.' : '';
  const targetWords   = Math.round(serpModel.avgWordCount * 1.1);

  const prompt = `Tu es un expert SEO.

Génère un plan d'article optimisé pour le mot-clé "${mainKeyword}" (thème : "${theme}").

RÈGLES OBLIGATOIRES :
1. Couverture 100% des sous-thèmes SERP — chaque sous-thème doit apparaître dans un H2 ou H3 :
${subtopicsText}
2. Intègre naturellement ces entités dans les titres ou descriptions : ${entitiesText}
3. Intention de recherche dominante : ${serpModel.intent}
4. Format de contenu dominant : ${serpModel.contentFormat}
5. Longueur cible : ~${targetWords} mots (10% au-dessus de la moyenne concurrents)
${faqNote}

Retourne UNIQUEMENT le plan en format texte, avec des H2 (## Titre) et H3 (### Titre) :
- H2 avec une phrase d'accroche en italique
- Ordre logique et naturel
- Pas de contenu rédigé, seulement les titres et sous-titres`;

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    return message.content[0].text.trim();
  } catch (err) {
    console.error('[Claude] generateOptimizedOutline erreur:', err?.message);
    return '';
  }
}

// ── Full blog generation ──────────────────────────────────────────────────────
export async function generateBlogContent({ mainKeyword, secondaryKeywords, theme, tone, existingTitles, internalUrls, kd, serpModel, optimizedOutline }) {
  const client = getClient();
  const { range: lengthRange, objective: lengthObjective } = getLengthFromKd(kd);

  const internalUrlsText =
    internalUrls.length > 0
      ? internalUrls.map((u) => `- ${u.title} : ${u.url}`).join('\n')
      : 'Aucune URL interne disponible.';

  const competitorTitles =
    existingTitles.length > 0
      ? existingTitles.slice(0, 10).map((t) => `- ${t}`).join('\n')
      : '- Aucun article existant.';

  const systemPrompt = `Tu es un expert SEO et copywriter spécialisé dans la création de contenu optimisé pour Webflow.
Tu génères des articles de blog COMPLETS, intégralement rédigés, prêts à être publiés directement.

AVANT le début des sections numérotées, tu dois impérativement générer un marqueur d'image principale avec le format suivant (une seule ligne) :
[[FEATURED_IMAGE:Prompt très détaillé en anglais pour Gemini AI image generation]]

Ce prompt doit :
- Être rédigé en ANGLAIS (Gemini performe mieux en anglais)
- Faire 2 à 4 phrases très descriptives
- Préciser le sujet exact (lien direct avec le thème et mot-clé de l'article)
- Préciser le style visuel : photographie professionnelle OU illustration OU infographie
- Préciser la lumière, les couleurs dominantes, l'ambiance
- Préciser la composition : plan large / cadrage / perspective
- Interdire tout texte, watermark, logo sur l'image
- Exemple : [[FEATURED_IMAGE:A professional overhead photograph of a laptop with a health insurance dashboard on screen, surrounded by medical documents, a stethoscope and a pen on a clean white desk. Soft natural lighting from the left, warm and trustworthy atmosphere, shallow depth of field, 16:9 format. No text, no watermark.]]
Tu respectes SCRUPULEUSEMENT le format de sortie ci-dessous, sans jamais déroger à la structure.

---

## FORMAT DE SORTIE OBLIGATOIRE

### 1. TITRE SEO (TITLE TAG)
[Champ Webflow : Title Tag SEO — Titre de la page]
Rédige un titre SEO NATUREL et ATTRACTIF pour la balise <title> HTML (55-60 caractères max, espaces compris).

⚠️ IMPÉRATIF — CE N'EST PAS UN CHAMP DE TAGS/MOTS-CLÉS :
- Rédige une PHRASE COMPLÈTE ET FLUIDE (comme un vrai titre de livre)
- PAS UNE LISTE de mots séparés par | ou des virgules
- Intègre le mot-clé principal de façon naturelle dans la phrase
- Réponds précisément à l'intention de recherche de la requête cible
- Utilise des mots qui donnent envie de cliquer (bénéfice, curiosité, solution)
- C'est le TITRE de la page web, pas une suite de tags

❌ INTERDIT : "Mot-clé | Mot-clé | Mot-clé" ou "tag1, tag2, tag3"
✅ BON EXEMPLE : "Comment Améliorer Votre SEO en 2026 : Guide Complet"
✅ BON EXEMPLE : "Les 5 Meilleures Stratégies de Marketing Digital"

---

### 2. DESCRIPTION SEO (META DESCRIPTION)
[Champ Webflow : Meta Description — Description pour les moteurs de recherche]
Rédige une description SEO PERSUASIVE et NATURELLE pour la balise <meta name="description"> (max 160 caractères, espaces compris).

⚠️ IMPÉRATIF — CE N'EST PAS UNE LISTE DE MOTS-CLÉS :
- Rédige 1-2 PHRASES COMPLÈTES ET FLUIDES comme un texte publicitaire
- PAS UNE LISTE de services ou mots-clés séparés par | ou virgules
- Réponds à l'intention de recherche en présentant le bénéfice clé
- Intègre le mot-clé principal naturellement
- Incite à cliquer avec un appel à l'action ou une promesse
- C'est la DESCRIPTION de la page, pas des tags

❌ INTERDIT : "Service A | Service B | Service C" ou "tag1, tag2, tag3"
✅ BON EXEMPLE : "Découvrez les 5 stratégies SEO qui ont multiplié notre trafic par 10. Guide pratique avec exemples concrets."

---

### 3. TITRE PRINCIPAL (H1)
[Champ Webflow : Name — Titre visible de l'article sur la page]
Rédige un titre principal H1 PERCUTANT et DIFFÉRENT du Titre SEO (max 80 caractères).

⚠️ IMPÉRATIF — CE N'EST PAS UN CHAMP DE TAGS :
- Formule une PHRASE COMPLÈTE qui capte l'attention
- PAS UNE LISTE de mots-clés
- Intègre le mot-clé principal naturellement
- Utilise un ton plus direct et engageant que le Titre SEO
- Donne immédiatement envie de lire l'article
- C'est le GRAND TITRE visible sur la page, comme un titre de journal

❌ INTERDIT : "Mot-clé, mot-clé, mot-clé" ou liste séparée par |
✅ BON EXEMPLE : "Guide Complet pour Maîtriser le SEO en 5 Étapes"

❌ À ÉVITER : Répéter le Title Tag ou lister des mots-clés
✅ EXEMPLE : "Guide Complet : [Solution] en 5 Étapes Simples" ou "[Mot-clé] : Tout Ce Que Vous Devez Savoir"

---

### 4. INTRODUCTION
[Champ Webflow : Introduction]

Rédige une introduction de 180 à 200 mots EXACTEMENT, conçue pour optimiser simultanément le référencement Google ET la lecture par les LLMs (ChatGPT, Perplexity, Gemini).

Rules OBLIGATOIRES — dans cet ordre précis :

**Phrase 1 — Accroche + mot-clé principal dans les 12 premiers mots**
- Commence par un chiffre fort, une question directe ou une affirmation provocatrice
- Le mot-clé principal DOIT apparaître dans la première phrase
- Exemple : "74% des acheteurs [mot-clé] ne savent pas..."

**Phrases 2-3 — Contexte + reformulation de l'intention**
- Reformule l'intention de recherche en 1-2 phrases naturelles
- Intègre le contexte problème (à qui s'adresse l'article, quel problème résout-il)

**Phrases 4-6 — Intégration des termes obligatoires**
- Intègre naturellement les mots-clés secondaires principaux (au moins 4 différents)
- Intègre les entités et groupes de mots clés définis dans les contraintes SERP
- Aucun terme doit apparaître comme du bourrage — fluidité totale exigée

**Dernière phrase — Promesse + invite à lire**
- Annonce brièvement ce que l'article apporte (sans tout dévoiler)
- Crée de la curiosité ou du FOMO

⚠️ INTERDITS :
- Introduction générique ou bateau ("Dans cet article, nous allons...")
- Répétition du title tag ou du H1 mot pour mot
- Moins de 150 mots ou plus de 220 mots

---

### 5. CONTENU COMPLET DE L'ARTICLE
[Champ Webflow : Corps de l'article]

Rédige le CONTENU INTÉGRAL et complet de l'article en suivant la méthode MECE.

RÈGLES OBLIGATOIRES :
- Chaque H2 : description d'accroche (1-2 phrases) + contenu rédigé complet (150 à 300 mots) + liste à puces si pertinent (3 à 7 items)
- Chaque H3 : description d'accroche (1-2 phrases) + contenu rédigé complet (80 à 150 mots)
- Liens INTERNES : utilise le format exact [[INTERNE:URL|texte d'ancre riche en mots-clés]], minimum 3 liens
- Liens EXTERNES : utilise le format exact [[EXTERNE:URL|texte d'ancre descriptif]], minimum 3 sources fiables (HubSpot, Google, McKinsey, Forbes, INSEE, études officielles)
- BLOCKQUOTES : ajoute 2 à 4 citations pertinentes pour illustrer et décorer l'article avec le format exact [[QUOTE:Texte de la citation pertinente et inspirante]]
- IMAGES : ajoute 3 à 5 marqueurs d'images en anglais pour Gemini AI avec le format exact [[IMAGE:Detailed English prompt for Gemini]], placés stratégiquement après les H2/H3 importants. Chaque prompt doit être très descriptif (sujet précis lié à la section, style photographique ou illustratif, couleurs, cadrage, ambiance, sans texte, sans watermark). Exemple : [[IMAGE:A close-up photograph of hands filling out a health insurance form at a wooden desk, natural warm light, sharp focus on the document, blurred background with plants, professional and reassuring atmosphere. No text overlay, no watermark.]]
- Intègre les liens, blockquotes et images naturellement dans les paragraphes
- Utilise les mots-clés secondaires fournis tout au long du contenu

FORMAT OBLIGATOIRE POUR CHAQUE SECTION :

## H2 : [Titre de la section]
→ Description : [Phrase d'accroche ou teaser en 1-2 phrases]

[Contenu rédigé complet (2 à 4 paragraphes substantiels)]

- [Item de liste si pertinent]
- [Item de liste]
- [Item de liste]

### H3 : [Titre de la sous-section]
→ Description : [Description courte en 1-2 phrases]

[Contenu rédigé complet (1 à 2 paragraphes)]

---

### 6. FAQ (CODE HTML EMBED)
[Embed Webflow — À insérer en fin d'article]

Génère une FAQ de 8 à 10 questions/réponses :
- Questions et réponses riches en mots-clés
- Optimisées GEO (réponses directes, factuelles, citables par une IA)
- Code HTML/CSS/JS autonome, design sobre et professionnel

\`\`\`html
<div class="faq-container">...</div>
<style>/* styles */</style>
<script>/* JS accordéon */</script>
\`\`\`

---

### 7. SCHÉMAS VISUELS (CODE HTML EMBED)
[Embed Webflow — 2 schémas à placer aux endroits stratégiques]

Génère exactement 2 schémas visuels en HTML/CSS pur (sans JS externe) :
- Illustrent des concepts clés de l'article
- Design propre, moderne, responsive, couleurs harmonieuses
- Boîtes, flèches, étapes ou tableaux comparatifs selon le contexte
- Titre explicite au-dessus de chaque schéma

📌 SCHÉMA 1 - À insérer après : [H2 ou H3 concerné]
\`\`\`html
<div>...</div><style>...</style>
\`\`\`

📌 SCHÉMA 2 - À insérer après : [H2 ou H3 concerné]
\`\`\`html
<div>...</div><style>...</style>
\`\`\`

---

## RÈGLES GÉNÉRALES
- Tout le contenu est rédigé en français
- Ton : ${tone}. Jamais générique, toujours à forte valeur ajoutée
- Longueur totale de l'article : ${lengthRange} (hors FAQ et schémas). Objectif : ${lengthObjective}
- Intégrer naturellement tous les mots-clés secondaires fournis
- Ne jamais inventer des données chiffrées sans les sourcer ou les formuler comme estimations
- Ne jamais utiliser le tiret cadratin (—) dans le contenu : remplace-le par une virgule, un point ou une reformulation`;

  // ── SERP enforcement block (injected only when a model is available) ─────────
  const serpEnforcement = serpModel && serpModel.dominantSubtopics.length > 0
    ? `
---

## CONTRAINTES SERP OBLIGATOIRES (données réelles Google)
Ces données proviennent d'une analyse des 10 premiers résultats Google — elles sont PRIORITAIRES.

### Sous-thèmes à couvrir à 100% (chaque point DOIT apparaître dans un H2 ou H3) :
${serpModel.dominantSubtopics.map((t, i) => `${i + 1}. ${t}`).join('\n')}

### Entités à intégrer naturellement dans le contenu :
${serpModel.recurringEntities.join(', ') || 'aucune'}

### Intention de recherche : ${serpModel.intent}
### Format dominant des concurrents : ${serpModel.contentFormat}
### Longueur cible : ~${Math.round(serpModel.avgWordCount * 1.1)} mots (champ Contenu uniquement)
${serpModel.hasFaq ? '### FAQ : les concurrents incluent une FAQ — tu DOIS inclure une section FAQ.' : ''}
${serpModel.faqQuestions.length > 0 ? `
### Questions FAQ à traiter prioritairement :
${serpModel.faqQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}` : ''}

### INTRODUCTION — Termes obligatoires dans les 200 premiers mots :
L'introduction DOIT contenir TOUS ces éléments naturellement intégrés :
- Terme principal : "${serpModel.keyword}"
- Groupes de mots clés SERP (intègre-en au moins 3 sur 5) : ${serpModel.dominantSubtopics.slice(0, 5).map(t => `"${t}"`).join(', ')}
- Entités nommées (intègre-en au moins 2) : ${serpModel.recurringEntities.slice(0, 5).join(', ')}
- Intention détectée : ${serpModel.intent} — l'intro doit répondre directement à cette intention
- Objectif GEO : l'intro doit être extractible comme réponse directe par un LLM (structure : constat + contexte + solution + promesse)
`
    : '';

  const outlineBlock = optimizedOutline
    ? `\n\n## PLAN OPTIMISÉ À SUIVRE\nRespect ce plan structurel (tu peux enrichir mais ne supprime pas de section) :\n\n${optimizedOutline}`
    : '';

  const userPrompt = `Génère un article de blog complet avec les paramètres suivants :

**Mot-clé principal :** ${mainKeyword}
**Mots-clés secondaires :** ${secondaryKeywords.join(', ')}
**Thème général :** ${theme}

**Articles existants à NE PAS dupliquer :**
${competitorTitles}

**URLs internes disponibles pour le maillage [[INTERNE:URL|ancre]] :**
${internalUrlsText}${serpEnforcement}${outlineBlock}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 12000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  return message.content[0].text;
}
