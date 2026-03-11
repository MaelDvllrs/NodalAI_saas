import Anthropic from '@anthropic-ai/sdk';
import { claudeCreate } from '../../../utils/claudeRetry.js';

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquant dans .env');
  return new Anthropic({ apiKey });
}

// ── KD → article length ───────────────────────────────────────────────────────
export function getWordCountBounds(kd) {
  if (kd === null || kd === undefined) return { min: 1500, max: 2000 };
  if (kd <= 10)  return { min: 800,  max: 1000 };
  if (kd <= 20)  return { min: 1000, max: 1300 };
  if (kd <= 35)  return { min: 1300, max: 1800 };
  if (kd <= 50)  return { min: 1800, max: 2300 };
  if (kd <= 70)  return { min: 2300, max: 2700 };
  return { min: 2700, max: 3000 };
}

function getLengthFromKd(kd) {
  if (kd === null || kd === undefined)
    return { range: '1 000 – 1 600 mots', objective: 'Article structuré et optimisé SEO', midWords: 1300 };
  if (kd <= 10)
    return { range: '800 – 1 000 mots', objective: 'Réponse claire et ciblée', midWords: 900 };
  if (kd <= 20)
    return { range: '1 000 – 1 200 mots', objective: 'Contenu structuré avec sous-parties', midWords: 1100 };
  if (kd <= 35)
    return { range: '1 200 – 1 600 mots', objective: 'Article approfondi + optimisation sémantique', midWords: 1400 };
  if (kd <= 50)
    return { range: '1 600 – 1 800 mots', objective: 'Guide complet + maillage interne', midWords: 1700 };
  if (kd <= 70)
    return { range: '1 800 – 2 000 mots', objective: 'Contenu expert structuré', midWords: 1900 };
  return { range: '2 000 – 2 300 mots', objective: 'Contenu pilier + autorité thématique', midWords: 2150 };
}

/**
 * Scale term frequency targets proportionally to the generated article length.
 *
 * @param {Array}  terms          - intentTopTerms with minCount / maxCount / target
 * @param {number} generatedWords - expected word count of the article to generate
 * @param {number} sourceAvgWords - average word count of the analysed SERP pages
 * @returns {Array} cloned terms with scaled minCount / maxCount / target
 */
export function scaleTermCounts(terms, generatedWords, sourceAvgWords) {
  const ratio = (generatedWords || 1500) / Math.max(sourceAvgWords || 1500, 1);
  return terms.map((t) => ({
    ...t,
    minCount: Math.max(1, Math.round(t.minCount * ratio)),
    maxCount: Math.max(1, Math.round(t.maxCount * ratio)),
    target:   Math.max(1, Math.round(t.target   * ratio)),
  }));
}

// ── SERP-driven optimised outline ─────────────────────────────────────────────
/**
 * Generate an article outline that covers all dominantSubtopics and
 * recurringEntities from the SERP model.
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
    const message = await claudeCreate(client, {
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

// ── Trim content to word count ─────────────────────────────────────────────────
export async function trimContentToWordCount(content, targetMin, targetMax, mainKeyword) {
  const client = getClient();
  const currentWords = content.trim().split(/\s+/).length;

  const message = await claudeCreate(client, {
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    messages: [{
      role: 'user',
      content: `Tu es un rédacteur-éditeur SEO senior. L'article ci-dessous fait ~${currentWords} mots. Tu dois le **réécrire et condenser** pour qu'il fasse ENTRE ${targetMin} ET ${targetMax} mots.

⚠️ RÈGLE PRINCIPALE : il s'agit d'une RÉÉCRITURE CONDENSÉE, PAS d'une suppression de mots.
Chaque phrase du résultat doit être complète, naturelle et compréhensible. Un lecteur ne doit pas sentir qu'il manque quelque chose.

MÉTHODE DE CONDENSATION (par ordre de priorité) :
1. **Fusionner** les paragraphes qui développent la même idée en un seul paragraphe synthétique
2. **Reformuler** les phrases longues et complexes en phrases plus courtes et directes
3. **Éliminer** les répétitions, reformulations identiques et transitions inutiles
4. **Réduire** les listes de puces : garder les 3-4 items les plus pertinents, supprimer les redondants
5. **Raccourcir** les descriptions d'accroche (lignes "→ Description :") à 1 phrase maximum
6. **Supprimer** les digressions qui n'apportent pas de valeur SEO directe

CONTRAINTES ABSOLUES (ne jamais toucher à) :
- Tous les marqueurs : [[INTERNE:...]], [[EXTERNE:...]], [[QUOTE:...]], [[IMAGE:...]] — les conserver intégralement, ne jamais couper un marqueur en deux
- Tous les titres H2 (## ...) et H3 (### ...) — les conserver tous
- Le mot-clé principal "${mainKeyword}" — doit apparaître autant de fois qu'avant
- L'intention de recherche et le plan logique de l'article — la structure sémantique doit rester cohérente
- La qualité rédactionnelle — chaque phrase doit avoir un sujet, un verbe et un sens complet

RÉSULTAT ATTENDU :
- Un article fluide et agréable à lire
- Aucune phrase tronquée ou incohérente
- Entre ${targetMin} et ${targetMax} mots dans le corps (hors marqueurs [[...]])
- Retourne UNIQUEMENT le contenu révisé, sans commentaire, sans en-tête, sans explication

CONTENU À CONDENSER :
${content}`,
    }],
  });

  return message.content[0].text.trim();
}

// ── Rewrite article for SEO ───────────────────────────────────────────────────
/**
 * Rewrite the body + introduction of an article that scored < SEO_THRESHOLD.
 *
 * @param {object} params
 * @param {string} params.body
 * @param {string} params.introduction
 * @param {string} params.mainKeyword
 * @param {string} params.tone
 * @param {object} params.serpModel
 * @param {object} params.semanticAnalysis
 * @param {object} params.coverageData
 * @param {number} params.wcMin
 * @param {number} params.wcMax
 * @returns {Promise<{ body: string, introduction: string }>}
 */
export async function rewriteArticleForSeo({
  body, introduction, mainKeyword, tone,
  serpModel, semanticAnalysis, coverageData, wcMin, wcMax,
  forceTermDensity = false, termRangeDetails = [],
}) {
  const client = getClient();

  const missingTopics = serpModel?.dominantSubtopics
    ?.filter((t) => !`${body} ${introduction}`.toLowerCase().includes(t.toLowerCase()))
    ?? [];

  const missingEntities = serpModel?.recurringEntities
    ?.filter((e) => !`${body} ${introduction}`.toLowerCase().includes(e.toLowerCase()))
    ?? [];

  const topicCoverage   = coverageData?.topicCoverage   ?? 'inconnue';
  const entityCoverage  = coverageData?.entityCoverage  ?? 'inconnue';
  const wordScore       = coverageData?.wordScore       ?? 'inconnu';
  const totalScore      = coverageData?.totalScore      ?? 'inconnu';

  const primaryTerms    = (semanticAnalysis?.primaryTerms    ?? []).join(', ') || 'aucun';
  const longTailList    = (semanticAnalysis?.longTailVariants ?? []).join(' | ') || 'aucun';
  const contentGaps     = (semanticAnalysis?.contentGaps      ?? []).map((g, i) => `${i+1}. ${g}`).join('\n') || 'aucun';

  const top30Terms = (semanticAnalysis?.intentTopTerms || []).slice(0, 30).map((t) => t.display || t.term);
  const top30Block = top30Terms.length > 0
    ? `\n\n### ⭐ TOP ${top30Terms.length} MOTS-CLÉS PRIORITAIRES (classés par importance SEO) :\nRÈGLE : utilise AU MOINS 20 de ces termes dans la réécriture. Chaque H2 doit en contenir ≥ 3.\n${top30Terms.map((t, i) => `${i+1}. **${t}**`).join('  |  ')}`
    : '';

  const rewriteTargetWords = Math.round((wcMin + wcMax) / 2);
  const rewriteSourceWords = serpModel?.avgWordCount || rewriteTargetWords;
  const scaledTerms = scaleTermCounts(
    (semanticAnalysis?.intentTopTerms || []).filter((t) => t.maxCount > 0).slice(0, 60),
    rewriteTargetWords,
    rewriteSourceWords,
  );
  const freqGuideLines = scaledTerms
    .map((t) => `| ${(t.display || t.term).padEnd(22)} | ${String(t.minCount).padStart(3)} | ${String(t.maxCount).padStart(3)} | ~${t.target} |`)
    .join('\n');
  const freqGuideBlock = freqGuideLines
    ? `\n\n### Guide de fréquence des termes (occurrences absolues pour ~${rewriteTargetWords} mots) :\nObjectif : utiliser chaque terme autour de la valeur Cible dans l'article complet. Un terme absent = opportunité SEO manquée.\n| Terme                   | Min | Max | Cible |\n|-------------------------|-----|-----|-------|\n${freqGuideLines}`
    : '';

  const missingTopicBlock = missingTopics.length > 0
    ? `\n### Sous-thèmes SERP NON COUVERTS (obligatoires) :\n${missingTopics.map((t, i) => `${i+1}. ${t}`).join('\n')}`
    : '\n✅ Tous les sous-thèmes SERP sont déjà couverts — renforcer leur traitement.';

  const missingEntityBlock = missingEntities.length > 0
    ? `\n### Entités SERP manquantes (à intégrer naturellement) :\n${missingEntities.join(', ')}`
    : '\n✅ Entités déjà présentes.';

  const prompt = `Tu es un expert SEO et rédacteur web senior. Tu dois RÉÉCRIRE INTÉGRALEMENT le corps et l'introduction d'un article qui a obtenu un score SEO insuffisant.

## DIAGNOSTIC DU PROBLÈME
Score SEO actuel : **${totalScore}/100** (seuil minimum : 65)
- Couverture des sous-thèmes SERP : ${topicCoverage}%
- Couverture des entités : ${entityCoverage}%
- Score volume de contenu : ${wordScore}%

## OBJECTIF DE LA RÉÉCRITURE
Produire une version améliorée qui atteint au minimum 70/100 en :
1. Couvrant TOUS les sous-thèmes SERP manquants
2. Intégrant TOUTES les entités manquantes
3. Utilisant abondamment les termes sémantiques principaux
4. Respectant l'intention de recherche : **${serpModel?.intent ?? 'informationnelle'}**
5. Longueur cible : **${wcMin}–${wcMax} mots** pour le CORPS UNIQUEMENT
${missingTopicBlock}
${missingEntityBlock}${top30Block}

### Termes sémantiques principaux TF-IDF (à intégrer densément) :
${primaryTerms}

### Expressions longue traîne (utiliser dans les H3 et l'intro) :
${longTailList}

### Gaps de contenu identifiés chez les concurrents (si pertinent, traiter) :
${contentGaps}${freqGuideBlock}${forceTermDensity && termRangeDetails.length > 0 ? `

## ⚠️ ALERTE DENSITÉ TERMES-CLÉS — PRIORITÉ MAXIMALE
Une analyse automatique a détecté que les termes suivants sont ABSENTS ou sous-utilisés dans l'article.
Tu DOIS les intégrer dans la réécriture — sans exception. Chaque terme manquant nuit directement au référencement.
Utilise-les naturellement dans les paragraphes, les H3, les listes à puces et l'introduction.
La comparaison est insensible aux accents : "référencement" et "referencement" sont considérés identiques.

### Termes à intégrer d'urgence (hors plage de fréquence cible) :
${termRangeDetails.map((d) => `- **${d.term}** : présent ${d.density} fois/1000 mots (plage cible : ${d.minCount}–${d.maxCount})`).join('\n')}` : ''}

## RÈGLES ABSOLUES DE RÉÉCRITURE
- Conserver INTÉGRALEMENT tous les titres H2 (## ...) et H3 (### ...) du corps
- Conserver INTÉGRALEMENT tous les marqueurs : [[INTERNE:...]], [[EXTERNE:...]], [[QUOTE:...]], [[IMAGE:...]]
- L'introduction DOIT commencer par une accroche forte (chiffre, question, affirmation) avec le mot-clé "${mainKeyword}" dans les 15 premiers mots
- Ne JAMAIS commencer l'introduction par un résumé descriptif ou une définition générale
- Ton : ${tone}
- Langue : français uniquement
- Ne PAS répéter le même sous-thème dans plusieurs sections — chaque H2 doit traiter un angle unique
- Inclure MINIMUM 1 marqueur [[QUOTE:...]] si absent

## FORMAT DE SORTIE OBLIGATOIRE
Retourne EXACTEMENT ce format JSON (aucun texte avant ou après) :
{
  "introduction": "<introduction réécrite, 180-220 mots>",
  "body": "<corps de l'article réécrit avec tous les H2/H3 et marqueurs conservés>"
}

## CONTENU ACTUEL À RÉÉCRIRE

### INTRODUCTION ACTUELLE :
${introduction || '(vide)'}

### CORPS ACTUEL :
${body}`;

  try {
    const message = await claudeCreate(client, {
      model:      'claude-sonnet-4-6',
      max_tokens: 12000,
      messages:   [{ role: 'user', content: prompt }],
    });

    const raw     = message.content[0].text.trim();
    const jsonStr = raw.startsWith('{') ? raw : raw.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonStr) throw new Error('JSON non trouvé dans la réponse de réécriture');
    const result  = JSON.parse(jsonStr);

    if (!result.body || result.body.length < 200) {
      throw new Error('Corps réécrit trop court ou absent');
    }

    return {
      body:         result.body.trim(),
      introduction: result.introduction?.trim() || introduction,
    };
  } catch (err) {
    console.error('[Claude] rewriteArticleForSeo erreur:', err.message);
    return { body, introduction };
  }
}

// ── Full blog generation ──────────────────────────────────────────────────────
export async function generateBlogContent({ mainKeyword, secondaryKeywords, theme, tone, existingTitles, internalUrls, kd, serpModel, optimizedOutline, semanticAnalysis, ratingExamples = [] }) {
  const client = getClient();
  const { range: lengthRange, objective: lengthObjective, midWords } = getLengthFromKd(kd);
  const generatedWordsMid = serpModel?.avgWordCount
    ? Math.round(serpModel.avgWordCount * 1.1)
    : midWords;

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

Ce champ contient DEUX blocs séparés, dans cet ordre :

---

#### BLOC A — POINTS CLÉS DE L'ARTICLE
Génère un encadré synthétique en tête de section avec ce format EXACT :

📌 **Points clés de l'article**
- [Point clé 1 : bénéfice ou information essentielle, 10-15 mots max]
- [Point clé 2]
- [Point clé 3]
- [Point clé 4]
- [Point clé 5]

Règles :
- Entre 5 et 7 points maximum
- Chaque point résume un H2 ou apprentissage majeur de l'article
- Phrases courtes, orientées bénéfice lecteur
- Inclut le mot-clé principal dans au moins 1 point
- Ce bloc est COMPRIS dans le comptage total des mots

---

#### BLOC B — INTRODUCTION (180 à 200 mots)
Rédige une introduction de 180 à 200 mots, conçue pour optimiser simultanément le référencement Google ET la lecture par les LLMs (ChatGPT, Perplexity, Gemini).

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
- Moins de 150 mots ou plus de 220 mots pour le Bloc B

---

### 5. CONTENU COMPLET DE L'ARTICLE
[Champ Webflow : Corps de l'article]

Rédige le CONTENU INTÉGRAL et complet de l'article en suivant la méthode MECE.

RÈGLES OBLIGATOIRES :
- Chaque H2 : description d'accroche (1-2 phrases) + contenu rédigé complet (150 à 300 mots) + liste à puces si pertinent (3 à 7 items)
- Chaque H3 : description d'accroche (1-2 phrases) + contenu rédigé complet (80 à 150 mots)
- Liens INTERNES : utilise le format exact [[INTERNE:URL|texte d'ancre riche en mots-clés]], minimum 3 liens
- Liens EXTERNES : utilise le format exact [[EXTERNE:URL|texte d'ancre descriptif]], minimum 3 sources fiables (HubSpot, Google, McKinsey, Forbes, INSEE, études officielles)
- BLOCKQUOTES : MINIMUM 1 citation [[QUOTE:...]] OBLIGATOIRE dans chaque article (idéalement 2 à 4). Format exact : [[QUOTE:Texte de la citation pertinente et inspirante]]. Si aucune citation n'a encore été ajoutée avant la conclusion, en insérer une immédiatement. Un article sans aucun [[QUOTE:...]] est invalide.
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

#### CONCLUSION OBLIGATOIRE (à placer en dernière section du corps)
Termine la section 5 par une conclusion avec ce format EXACT :

## Conclusion : [Titre synthétique accrocheur]
→ Description : [1 phrase de transition qui annonce la synthèse]

[Paragraphe 1 — Synthèse des points clés : rappelle les 3-4 apprentissages principaux de l'article, sans les répéter mot pour mot. 80-120 mots.]

[Paragraphe 2 — Appel à l'action ou perspective : encourage le lecteur à passer à l'action, à approfondir ou à revenir sur le site. Intègre 1 lien interne [[INTERNE:URL|ancre]] et le mot-clé principal. 60-80 mots.]

Règles de la conclusion :
- COMPRISE dans le comptage de mots de la section 5
- Ne pas introduire de nouvelles informations
- Ton conclusif et positif
- Maximum 200 mots au total

---

### 6. FAQ (CODE HTML EMBED)
[Embed Webflow — À insérer en fin d'article]

Génère une FAQ de 8 à 10 questions/réponses :
- Questions et réponses riches en mots-clés
- Optimisées GEO (réponses directes, factuelles, citables par une IA)
- ⚠️ Code HTML UNIQUEMENT avec des attributs style="..." inline sur chaque balise
- ⚠️ INTERDIT : class=, id=, <style>, feuilles CSS, classes Tailwind ou Bootstrap

\`\`\`html
<div style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:24px 0">
  <h2 style="font-size:1.4rem;font-weight:700;margin-bottom:16px">Questions fréquentes</h2>
  <div style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;overflow:hidden">
    <button onclick="var p=this.nextElementSibling;p.style.display=p.style.display==='none'?'block':'none'" style="width:100%;text-align:left;padding:16px 20px;font-weight:600;font-size:0.95rem;background:#f9fafb;border:none;cursor:pointer">Question 1 ?</button>
    <div style="padding:16px 20px;display:none;font-size:0.9rem;line-height:1.6;color:#374151">Réponse 1.</div>
  </div>
</div>
\`\`\`

---

### 7. SCHÉMAS VISUELS (CODE HTML EMBED)
[Embed Webflow — 3 schémas à placer aux endroits stratégiques]

⚠️ RÈGLES ABSOLUES pour TOUS les schémas :
- UNIQUEMENT des attributs style="..." inline sur chaque balise HTML
- INTERDIT : class=, id=, <style>, feuilles CSS, classes utilitaires
- Design propre, moderne, responsive (utilise max-width, flexbox via style="display:flex")
- Polices sans-serif, couleurs harmonieuses via style="..."

Génère exactement 3 schémas adaptés au contenu de l'article :
- **SCHÉMA 1 (obligatoire)** : tableau de données — comparatif, avantages/inconvénients, checklist ou grille explicative avec lignes et colonnes HTML (<table>, <tr>, <td>/<th>)
- **SCHÉMA 2** : processus, étapes ou flux (boîtes numérotées, flèches, timeline)
- **SCHÉMA 3** : synthèse visuelle libre (infographie, points clés encadrés, diagramme adapté au sujet)

Titre explicite au-dessus de chaque schéma.

📌 SCHÉMA 1 - À insérer après : [H2 ou H3 concerné]
\`\`\`html
<div style="font-family:sans-serif;max-width:800px;margin:24px auto">...</div>
\`\`\`

📌 SCHÉMA 2 - À insérer après : [H2 ou H3 concerné]
\`\`\`html
<div style="font-family:sans-serif;max-width:800px;margin:24px auto">...</div>
\`\`\`

📌 SCHÉMA 3 - À insérer après : [H2 ou H3 concerné]
\`\`\`html
<div style="font-family:sans-serif;max-width:800px;margin:24px auto">...</div>
\`\`\`

---

## RÈGLES GÉNÉRALES
- Tout le contenu est rédigé en français
- Ton : ${tone}. Jamais générique, toujours à forte valeur ajoutée
- Longueur de la section 5 (Corps de l'article UNIQUEMENT, hors titre/intro/FAQ/schémas) : ${lengthRange}. Objectif : ${lengthObjective}. ⚠️ PLAFOND STRICT — arrête-toi dès que tu atteins la borne supérieure. Il est INTERDIT de dépasser ce plafond. Préfère un contenu dense et concis plutôt que répétitif et long. La conclusion de la section 5 EST comprise dans ce décompte.
- La section 4 (Points clés + introduction) est un champ séparé : les Points clés et l'introduction sont TOUS les deux comptabilisés dans le décompte de la section 4.
- Intégrer naturellement tous les mots-clés secondaires fournis
- Ne jamais inventer des données chiffrées sans les sourcer ou les formuler comme estimations
- Ne jamais utiliser le tiret cadratin (—) dans le contenu : remplace-le par une virgule, un point ou une reformulation
- RAPPEL FINAL OBLIGATOIRE : avant de terminer la section 5, vérifie que tu as inséré AU MOINS 1 marqueur [[QUOTE:...]] dans le corps de l'article. Si ce n'est pas le cas, insère-en un avant la conclusion.`;

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
### Longueur cible : ~${Math.round(serpModel.avgWordCount * 1.1)} mots MAXIMUM pour la section Corps uniquement (plafond strict — ne pas dépasser)
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

  const semanticBlock = semanticAnalysis && (
    semanticAnalysis.intentTopTerms?.length > 0 ||
    semanticAnalysis.primaryTerms?.length > 0 ||
    semanticAnalysis.longTailVariants?.length > 0 ||
    semanticAnalysis.contentGaps?.length > 0
  ) ? `

---

## ANALYSE SÉMANTIQUE APPROFONDIE (TF-IDF + DataForSEO)
Ces termes ont été extraits par analyse NLP des pages top SERP et enrichis via DataForSEO.
Ce bloc est **OBLIGATOIRE** — il détermine la couverture sémantique de l'article.${(() => {
    const top30 = (semanticAnalysis.intentTopTerms || [])
      .slice(0, 30)
      .map((t) => t.display || t.term);
    if (top30.length === 0) return '';
    return `

### ⭐ TOP ${top30.length} MOTS-CLÉS À INTÉGRER EN PRIORITÉ ABSOLUE
Ces termes sont classés par importance SEO (les premiers sont les plus critiques).
RÈGLE : tu DOIS utiliser **au moins 20 de ces ${top30.length} termes** dans l'article.
RÈGLE : chaque section H2 du corps doit contenir **au minimum 3 termes** de cette liste.
RÈGLE : l'introduction doit contenir **au minimum 5 termes** de cette liste.
Intègre-les naturellement — jamais en liste brute, toujours dans des phrases fluides.

${top30.map((t, i) => `${i + 1}. **${t}**`).join('  |  ')}`;
  })()}${(() => {
    const densityTerms = scaleTermCounts(
      (semanticAnalysis.intentTopTerms || []).filter((t) => t.maxCount > 0).slice(0, 50),
      generatedWordsMid,
      serpModel?.avgWordCount || generatedWordsMid,
    );
    if (densityTerms.length === 0) return '';
    const rows = densityTerms.map((t) => `| ${(t.display || t.term).padEnd(26)} | ${String(t.minCount).padStart(3)} | ${String(t.maxCount).padStart(3)} | **~${t.target}** |`).join('\n');
    return `\n\n### 🎯 CONTRAINTE DENSITÉ OBLIGATOIRE — Occurrences cibles dans l'article (~${generatedWordsMid} mots au total)
Ce tableau est CONTRAIGNANT. Chaque terme doit apparaître dans l'article autour de la valeur **Cible** (nombre d'occurrences absolues, pas pour 1000 mots).
Les plages sont proportionnelles à la taille de l'article cible et à la densité observée chez les concurrents.
❌ Terme absent = pénalité SEO. ❌ Terme sur-utilisé (> Max) = pénalité sur-optimisation.\n\n| Terme                             | Min | Max | Cible |\n|-----------------------------------|-----|-----|-------|\n${rows}`;
  })()}

### Termes sémantiques principaux (à intégrer dans les sections centrales) :
${(semanticAnalysis.primaryTerms || []).join(', ')}

### Termes secondaires complémentaires :
${(semanticAnalysis.secondaryTerms || []).join(', ')}

### Expressions longue traîne (à utiliser dans les H3, questions FAQ, intro) :
${(semanticAnalysis.longTailVariants || []).join(' | ')}

### Entités sémantiques (marques, outils, concepts — à citer en contexte) :
${(semanticAnalysis.entities || []).join(', ')}

### Co-occurrences fréquentes chez les concurrents :
${(semanticAnalysis.coOccurrences || []).join(' / ')}

### Gaps de contenu identifiés (sous-thèmes souvent manquants — à traiter si pertinent) :
${(semanticAnalysis.contentGaps || []).map((g, i) => `${i + 1}. ${g}`).join('\n')}${(() => {
    const guide = scaleTermCounts(
      (semanticAnalysis.intentTopTerms || []).filter((t) => t.target > 0 && t.minCount !== undefined).slice(0, 60),
      generatedWordsMid,
      serpModel?.avgWordCount || generatedWordsMid,
    );
    if (guide.length === 0) return '';
    const rows = guide.map((t) => `| ${(t.display || t.term).padEnd(22)} | ${String(t.minCount).padStart(3)} | ${String(t.maxCount).padStart(3)} | ~${t.target} |`).join('\n');
    return `

### Guide de fréquence des termes (basé sur l'analyse des pages concurrentes)
Ce tableau indique combien de fois chaque terme apparaît chez les concurrents (normalisé pour 1000 mots).
Les termes en haut du tableau sont les plus importants — priorise-les absolument.
Objectif : utiliser chaque terme autour de la valeur **Cible**. Un terme absent = opportunité SEO manquée.

| Terme                   | Min | Max | Cible |
|-------------------------|-----|-----|-------|
${rows}`;
  })()}`
  : '';

  const ratingBlock = ratingExamples.length > 0
    ? `

---

## EXEMPLES D'ARTICLES BIEN NOTÉS (référence de qualité et de style)
Ces articles ont été évalués ${Math.round(ratingExamples.reduce((s, b) => s + (b.rating || 5), 0) / ratingExamples.length * 10) / 10}/5 par l'utilisateur. Inspire-toi de leur **style d'accroche**, de la **densité de l'introduction**, du **niveau de détail**, et de la **structure des paragraphes**. Ne copie pas le contenu — adapte l'approche.

${ratingExamples.map((b, i) => {
  const intro = (b.introduction || '').slice(0, 300).replace(/\n+/g, ' ');
  return `### Exemple ${i + 1} — Note ${b.rating}/5 (thème : ${b.theme || '—'}, ton : ${b.tone || '—'})
**Titre** : ${b.title}\n**Début de l\'introduction** : ${intro}${(b.introduction || '').length > 300 ? '...' : ''}`;
}).join('\n\n')}`
    : '';

  const userPrompt = `Génère un article de blog complet avec les paramètres suivants :

**Mot-clé principal :** ${mainKeyword}
**Mots-clés secondaires :** ${secondaryKeywords.join(', ')}
**Thème général :** ${theme}

**Articles existants à NE PAS dupliquer :**
${competitorTitles}

**URLs internes disponibles pour le maillage [[INTERNE:URL|ancre]] :**
${internalUrlsText}${serpEnforcement}${semanticBlock}${outlineBlock}${ratingBlock}`;

  const message = await claudeCreate(client, {
    model: 'claude-sonnet-4-6',
    max_tokens: 12000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  return message.content[0].text;
}
