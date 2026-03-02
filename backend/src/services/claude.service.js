import Anthropic from '@anthropic-ai/sdk';

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquant dans .env');
  return new Anthropic({ apiKey });
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

// ── Full blog generation ──────────────────────────────────────────────────────
export async function generateBlogContent({ mainKeyword, secondaryKeywords, theme, tone, existingTitles, internalUrls, kd }) {
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
Introduction de 120 à 200 mots, percutante, rédigée par un copywriter expert.
- Accroche dès la première phrase (chiffre, question provocatrice, ou affirmation forte)
- Intègre un maximum de mots-clés naturellement
- Crée de la curiosité, ne révèle pas tout
- Donne envie de lire la suite

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
- IMAGES : ajoute 3 à 5 marqueurs d'images avec le format exact [[IMAGE:Description précise pour recherche d'image]], placés stratégiquement après les H2/H3 importants
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

  const userPrompt = `Génère un article de blog complet avec les paramètres suivants :

**Mot-clé principal :** ${mainKeyword}
**Mots-clés secondaires :** ${secondaryKeywords.join(', ')}
**Thème général :** ${theme}

**Articles existants à NE PAS dupliquer :**
${competitorTitles}

**URLs internes disponibles pour le maillage [[INTERNE:URL|ancre]] :**
${internalUrlsText}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 12000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  return message.content[0].text;
}
