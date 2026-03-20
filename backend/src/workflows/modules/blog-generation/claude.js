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

export function getLengthFromKd(kd) {
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

export function scaleTermCounts(terms, generatedWords, sourceAvgWords) {
  const ratio = (generatedWords || 1500) / Math.max(sourceAvgWords || 1500, 1);
  return terms.map((t) => ({
    ...t,
    minCount: Math.max(1, Math.round(t.minCount * ratio)),
    maxCount: Math.max(1, Math.round(t.maxCount * ratio)),
    target:   Math.max(1, Math.round(t.target   * ratio)),
  }));
}

// ── Optimized outline from SERP model ─────────────────────────────────────────
export async function generateOptimizedOutline(mainKeyword, serpModel, theme, tone, targetWords = null) {
  if (!serpModel || serpModel.dominantSubtopics.length === 0) return '';

  const client = getClient();

  const subtopicsText = serpModel.dominantSubtopics.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const entitiesText  = serpModel.recurringEntities.join(', ') || 'aucune';
  const faqNote       = serpModel.hasFaq ? 'Inclure une section FAQ.' : '';
  const targetWordsToUse = targetWords ?? Math.round(serpModel.avgWordCount * 1.1);

  const prompt = `Tu es un expert SEO.

Génère un plan d'article optimisé pour le mot-clé "${mainKeyword}" (thème : "${theme ?? mainKeyword}").

RÈGLES OBLIGATOIRES :
1. Couverture 100% des sous-thèmes SERP — chaque sous-thème doit apparaître dans un H2 ou H3 :
${subtopicsText}
2. Intègre naturellement ces entités dans les titres ou descriptions : ${entitiesText}
3. Intention de recherche dominante : ${serpModel.intent}
4. Format de contenu dominant : ${serpModel.contentFormat}
5. Longueur cible : ~${targetWordsToUse} mots
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
      max_tokens: 16000,
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
/**
 * Generate a full SEO blog article.
 *
 * @param {object} params
 * @param {string}   params.mainKeyword   - Required
 * @param {string}   params.tone          - Rédactionnel tone
 * @param {number}   params.kd            - Keyword difficulty (used for length)
 * @param {string[]} params.promptSnippets - Prompt sections contributed by upstream modules
 * @param {Array}    params.internalUrls   - Internal links available for [[INTERNE:...]]
 * @param {Array}    params.ratingExamples - Rated past articles for style reference
 */
export async function generateBlogContent({
  mainKeyword,
  tone,
  kd,
  promptSnippets = [],
  internalUrls   = [],
  ratingExamples = [],
  secondaryKeywords = [],
}) {
  const client = getClient();
  const { min: wcBlogMin, max: wcBlogMax } = getWordCountBounds(kd);

  const internalUrlsText = internalUrls.length > 0
    ? internalUrls.map((u) => `- ${u.title} : ${u.url}`).join('\n')
    : 'Aucune URL interne disponible.';

  const systemPrompt = `Tu es un expert SEO et copywriter spécialisé dans la création de contenu optimisé pour les moteurs de recherche.
Tu génères des articles de blog COMPLETS, intégralement rédigés, prêts à être publiés directement.

## 🚨 CONTRAINTE DE LONGUEUR — RÈGLE N°1, PRIORITÉ ABSOLUE, NON NÉGOCIABLE

### BUDGET SECTION 5 (Corps de l'article) : ${wcBlogMin}–${wcBlogMax} mots TOTAL.

Répartition STRICTE du budget :
- Chaque H2 (texte + listes) : **120–180 mots maximum**
- Chaque H3 (texte) : **60–90 mots maximum**
- Conclusion : **100–150 mots maximum**
- Total liens + blockquotes + mentions : ~150 mots amortis

Avant de rédiger CHAQUE section, compte tes mots depuis le début de la section 5.
- À partir de ${Math.round(wcBlogMax * 0.8)} mots : rédige uniquement la conclusion et arrête.
- À ${wcBlogMax} mots : STOP immédiat. Tu n'écriras plus rien dans la section 5.

❌ ERREUR FATALE = dépasser ${wcBlogMax} mots dans la section 5. L'article sera rejeté automatiquement.
✅ OBJECTIF : atteindre ${wcBlogMin}–${wcBlogMax} mots en étant DENSE et PRÉCIS, pas verbeux.

---

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
Tu respectes SCRUPULEUSEMENT le format de sortie ci-dessous, sans jamais déroger à la structure.

---

## FORMAT DE SORTIE OBLIGATOIRE

### 1. TITRE SEO (TITLE TAG)
[Title Tag — balise <title> HTML de la page]
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

---

### 2. DESCRIPTION SEO (META DESCRIPTION)
[Meta Description — balise <meta name="description">]
Rédige une description SEO PERSUASIVE et NATURELLE pour la balise <meta name="description"> (max 160 caractères, espaces compris).

⚠️ IMPÉRATIF — CE N'EST PAS UNE LISTE DE MOTS-CLÉS :
- Rédige 1-2 PHRASES COMPLÈTES ET FLUIDES comme un texte publicitaire
- PAS UNE LISTE de services ou mots-clés séparés par | ou virgules
- Réponds à l'intention de recherche en présentant le bénéfice clé
- Intègre le mot-clé principal naturellement
- Incite à cliquer avec un appel à l'action ou une promesse

❌ INTERDIT : "Service A | Service B | Service C" ou "tag1, tag2, tag3"
✅ BON EXEMPLE : "Découvrez les 5 stratégies SEO qui ont multiplié notre trafic par 10. Guide pratique avec exemples concrets."

---

### 3. TITRE PRINCIPAL (H1)
[H1 — Titre visible de l'article]
Rédige un titre principal H1 PERCUTANT et DIFFÉRENT du Titre SEO (max 80 caractères).

⚠️ IMPÉRATIF — CE N'EST PAS UN CHAMP DE TAGS :
- Formule une PHRASE COMPLÈTE qui capte l'attention
- PAS UNE LISTE de mots-clés
- Intègre le mot-clé principal naturellement
- Utilise un ton plus direct et engageant que le Titre SEO

❌ INTERDIT : "Mot-clé, mot-clé, mot-clé" ou liste séparée par |
✅ BON EXEMPLE : "Guide Complet pour Maîtriser le SEO en 5 Étapes"

---

### 4. INTRODUCTION
[Champ : Introduction]

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
[Champ : Corps de l'article]

🚨 BUDGET RESTANT POUR CETTE SECTION : **${wcBlogMin}–${wcBlogMax} mots TOTAL**. Compte tes mots en permanence.
Répartition : H2 = 120–180 mots max · H3 = 60–90 mots max · Conclusion = 100–150 mots max.

Rédige le CONTENU INTÉGRAL et complet de l'article en suivant la méthode MECE.

RÈGLES OBLIGATOIRES :
- Chaque H2 : description d'accroche (1-2 phrases) + contenu rédigé complet (**120 à 180 mots max**) + liste à puces si pertinent (3 à 5 items)
- Chaque H3 : description d'accroche (1 phrase) + contenu rédigé complet (**60 à 90 mots max**)

🚨 **LIENS INTERNES** (CRITIQUE — NON NÉGOCIABLE) :
- Format exact : [[INTERNE:URL|texte d'ancre riche en mots-clés]]
- **MINIMUM 3 LIENS OBLIGATOIRES** — utilise les URLs fournies dans "URLs internes disponibles"
- ⚠️ REJET AUTOMATIQUE si moins de 3 liens internes dans l'article final

🚨 **LIENS EXTERNES** (CRITIQUE — NON NÉGOCIABLE) :
- Format exact : [[EXTERNE:URL|texte d'ancre descriptif]]
- **MINIMUM 3 SOURCES FIABLES OBLIGATOIRES** (Google, HubSpot, INSEE, Forbes, Statista, Wikipedia, MDN, W3C, etc.)
- Cite des URLs RÉELLES et VÉRIFIABLES — pas d'invention
- ⚠️ REJET AUTOMATIQUE si moins de 3 liens externes dans l'article final
- 💡 ASTUCE : Place 1-2 liens externes dans l'introduction, 1-2 dans le corps, 1 dans la conclusion

🚨 **SCHÉMAS VISUELS** (CRITIQUE — NON NÉGOCIABLE) :
- Format exact : [[SCHEMA:position]] où position = "faq" OU "table" OU "timeline" OU "comparison" OU "process"
- **MINIMUM 3 SCHÉMAS OBLIGATOIRES** : 1 [[SCHEMA:faq]] (OBLIGATOIRE) + 2 autres types au choix
- ⚠️ REJET AUTOMATIQUE si [[SCHEMA:faq]] absent OU si moins de 3 schémas au total
- 💡 ASTUCE : Place [[SCHEMA:faq]] vers la fin de l'article, [[SCHEMA:table]] ou [[SCHEMA:comparison]] dans les sections principales
- ⚠️ IMPORTANT : Insère UNIQUEMENT les marqueurs [[SCHEMA:xxx]] dans le texte — NE GÉNÈRE PAS les tableaux HTML toi-même. Les schémas visuels (tableaux, timelines, etc.) seront générés automatiquement dans un second appel dédié.

- BLOCKQUOTES : MINIMUM 1 citation [[QUOTE:...]] OBLIGATOIRE (idéalement 2 à 4). Format : [[QUOTE:Texte de la citation]]
- IMAGES : ajoute 3 à 5 marqueurs [[IMAGE:Detailed English prompt for Gemini]] placés après les H2/H3 importants
- Intègre tous les marqueurs naturellement dans les paragraphes
- Intègre tous les termes sémantiques fournis dans les contextes ci-dessous

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

## RÈGLES GÉNÉRALES
- Tout le contenu est rédigé en français
- Ton : ${tone ?? 'Expert et pédagogique'}. Jamais générique, toujours à forte valeur ajoutée
- **🚨 LONGUEUR SECTION 5 : ${wcBlogMin}–${wcBlogMax} mots — LIMITE STRICTE ET ABSOLUE.** Tu dois compter tes mots activement. Si tu dépasses ${wcBlogMax} mots, l'article est automatiquement rejeté. Arrête-toi dès ${wcBlogMax} mots, même si le plan n'est pas terminé.
- **LIENS OBLIGATOIRES dans section 5 : minimum 3 [[INTERNE:URL|ancre]] + minimum 2 [[EXTERNE:URL|ancre]]**. Sans ces liens, l'article est invalide.
- La section 4 (Points clés + introduction) est un champ séparé : les Points clés et l'introduction sont TOUS les deux comptabilisés dans le décompte de la section 4.
- Intégrer naturellement tous les termes fournis dans les contextes ci-dessous
- Ne jamais inventer des données chiffrées sans les sourcer ou les formuler comme estimations
- Ne jamais utiliser le tiret cadratin (—) dans le contenu : remplace-le par une virgule, un point ou une reformulation
- **🚨 VALIDATION FINALE OBLIGATOIRE 🚨** — AVANT de terminer la section 5, compte IMPÉRATIVEMENT tes marqueurs :
  
  ✅ **CHECKLIST DE VALIDATION** (si un seul critère échoue, l'article est REJETÉ) :
  
  1️⃣ **Liens internes** : AU MOINS 3 × [[INTERNE:URL|ancre]]
     → Compte-les : ____ /3 (si < 3, ajoute-en immédiatement)
  
  2️⃣ **Liens externes** : AU MOINS 3 × [[EXTERNE:URL|ancre]]
     → Compte-les : ____ /3 (si < 3, ajoute-en immédiatement)
     → Exemple: "[[EXTERNE:https://www.google.com/search/howsearchworks|Google explique]]" ou "[[EXTERNE:https://www.hubspot.com/marketing-statistics|HubSpot révèle]]"
  
  3️⃣ **Schémas visuels** : AU MOINS 3 marqueurs [[SCHEMA:...]] dont 1 FAQ obligatoire
     → [[SCHEMA:faq]] présent ? ☐ OUI ☐ NON (si NON, ajoute-le immédiatement)
     → Autres schémas : ____ /2 minimum (table, timeline, comparison, process)
     → Total : ____ /3 minimum
     → ⚠️ NE GÉNÈRE PAS les tableaux HTML — insère seulement les marqueurs [[SCHEMA:xxx]]
  
  4️⃣ **Citation** : AU MOINS 1 × [[QUOTE:...]]
  
  ⚠️ Si tu détectes qu'il manque des liens externes ou des schémas, ARRÊTE-TOI et ajoute-les AVANT de conclure.
  ⚠️ NE JAMAIS envoyer un article incomplet — la validation automatique le rejettera de toute façon.

- La FAQ et les schémas visuels seront générés dans un second appel dédié — NE LES INCLUS PAS dans cette réponse. Ta réponse se termine après la section 5.`;

  // ── Build user prompt ─────────────────────────────────────────────────────
  const userPromptParts = [
    `🚨 CONTRAINTE ABSOLUE N°1 — LONGUEUR : la section 5 (Corps) doit faire ENTRE ${wcBlogMin} ET ${wcBlogMax} MOTS MAXIMUM.`,
    `Tu dois compter tes mots en permanence. STOP immédiat à ${wcBlogMax} mots même si le plan n'est pas fini.`,
    `Budget par H2 = 120-180 mots max · Budget par H3 = 60-90 mots max · Conclusion = 100-150 mots max.`,
    ``,
    `🚨 CONTRAINTE ABSOLUE N°2 — LIENS ET SCHÉMAS (CRITIQUE — ZÉRO TOLÉRANCE) :`,
    ``,
    `Tu DOIS ABSOLUMENT insérer dans la section 5 :`,
    ``,
    `📌 **3 LIENS INTERNES minimum** : [[INTERNE:URL|texte d'ancre]]`,
    `   → Utilise les URLs listées ci-dessous dans "URLs internes disponibles"`,
    ``,
    `📌 **3 LIENS EXTERNES minimum** : [[EXTERNE:URL_REELLE|texte d'ancre]]`,
    `   → Sources FIABLES uniquement : Google, HubSpot, INSEE, Statista, Forbes, Wikipedia, MDN, W3C, etc.`,
    `   → URLs RÉELLES vérifiables — NE JAMAIS inventer d'URL`,
    `   → Exemples valides :`,
    `      • [[EXTERNE:https://www.hubspot.com/marketing-statistics|HubSpot rapporte]]`,
    `      • [[EXTERNE:https://www.google.com/search/howsearchworks|Google explique]]`,
    `      • [[EXTERNE:https://www.statista.com/statistics/|Statista révèle]]`,
    ``,
    `📌 **3 SCHÉMAS minimum (FAQ + 2 autres)** : [[SCHEMA:position]]`,
    `   → 1 × [[SCHEMA:faq]] — OBLIGATOIRE (place-le vers la fin de l'article)`,
    `   → 2 × autres types : [[SCHEMA:table]], [[SCHEMA:timeline]], [[SCHEMA:comparison]], ou [[SCHEMA:process]]`,
    `   → Place-les aux endroits stratégiques (après H2 importants ou avant la conclusion)`,
    `   → ⚠️ N'INSÈRE QUE LES MARQUEURS [[SCHEMA:xxx]] — ne génère PAS les tableaux/schémas HTML toi-même`,
    ``,
    `⚠️ ⚠️ ⚠️ VALIDATION AUTOMATIQUE — REJET IMMÉDIAT si :`,
    `   • Moins de 3 liens internes OU`,
    `   • Moins de 3 liens externes OU`,
    `   • Moins de 3 schémas OU`,
    `   • [[SCHEMA:faq]] absent`,
    ``,
    `💡 CONSEIL : Répartis les liens externes dans tout l'article (intro, corps, conclusion) pour maximiser la crédibilité.`,
    ``,
    `Génère un article de blog complet avec les paramètres suivants :`,
    ``,
    `**Mot-clé principal :** ${mainKeyword}`,
    ``,
  ];

  // ── Secondary keywords (explicit integration) ────────────────────────────
  if (secondaryKeywords.length > 0) {
    userPromptParts.push(
      `🚨 CONTRAINTE ABSOLUE N°3 — MOTS-CLÉS SECONDAIRES OBLIGATOIRES :`,
      `Tu DOIS intégrer TOUS ces mots-clés secondaires de manière NATURELLE et PERTINENTE dans l'article :`,
      ``,
      secondaryKeywords.map((kw, i) => `${i + 1}. "${kw}"`).join('\n'),
      ``,
      `RÈGLES D'INTÉGRATION :`,
      `- Chaque mot-clé doit apparaître AU MOINS 2 fois dans l'article (titre, introduction, H2, H3, ou paragraphes)`,
      `- Intègre-les de façon FLUIDE et CONTEXTUELLE : aucun bourrage de mots-clés détectable`,
      `- Priorise l'introduction et les sous-titres H2/H3 pour placer ces termes`,
      `- Utilise des variations naturelles si nécessaire (singulier/pluriel, synonymes)`,
      `- Si un mot-clé est trop artificiel à insérer dans le contenu principal, intègre-le dans une liste à puces`,
      ``,
    );
  }

  userPromptParts.push(
    `**URLs internes disponibles pour le maillage [[INTERNE:URL|ancre]] :**`,
    internalUrlsText,
  );

  // Append all prompt snippets contributed by upstream modules
  for (const snippet of promptSnippets.filter(Boolean)) {
    userPromptParts.push('\n---\n');
    userPromptParts.push(snippet);
  }

  // Rating examples (optional)
  if (ratingExamples.length > 0) {
    const avgRating = Math.round(ratingExamples.reduce((s, b) => s + (b.rating || 5), 0) / ratingExamples.length * 10) / 10;
    userPromptParts.push('\n---\n');
    userPromptParts.push(
      `## EXEMPLES D'ARTICLES BIEN NOTÉS (référence de qualité et de style)\n` +
      `Ces articles ont été évalués ${avgRating}/5 par l'utilisateur. Inspire-toi de leur **style d'accroche**, ` +
      `de la **densité de l'introduction**, du **niveau de détail**, et de la **structure des paragraphes**. Ne copie pas le contenu — adapte l'approche.\n\n` +
      ratingExamples.map((b, i) => {
        const intro = (b.introduction || '').slice(0, 300).replace(/\n+/g, ' ');
        return `### Exemple ${i + 1} — Note ${b.rating}/5 (thème : ${b.theme || '—'}, ton : ${b.tone || '—'})\n**Titre** : ${b.title}\n**Début de l'introduction** : ${intro}${(b.introduction || '').length > 300 ? '...' : ''}`;
      }).join('\n\n')
    );
  }

  // Final reminder before generation
  userPromptParts.push(
    '\n---\n',
    '🚨 RAPPEL FINAL AVANT GÉNÉRATION 🚨',
    '',
    'Avant de commencer à rédiger, mémorise ces 3 contraintes NON NÉGOCIABLES :',
    '',
    '✅ 3 liens internes [[INTERNE:URL|ancre]] minimum',
    '✅ 3 liens externes [[EXTERNE:URL|ancre]] minimum (HubSpot, Google, Statista, Forbes, Wikipedia...)',
    '✅ 3 schémas minimum : [[SCHEMA:faq]] (OBLIGATOIRE) + 2 autres ([[SCHEMA:table]], [[SCHEMA:timeline]], [[SCHEMA:comparison]], ou [[SCHEMA:process]])',
    '',
    '⚠️ Pense à RÉPARTIR les liens externes dans tout l\'article (pas tous au même endroit).',
    '⚠️ Place les schémas stratégiquement : FAQ vers la fin, tableaux/comparaisons dans les sections principales.',
    '⚠️ IMPORTANT : Insère UNIQUEMENT les marqueurs [[SCHEMA:xxx]] — NE GÉNÈRE PAS les tableaux/schémas HTML. Ils seront créés automatiquement dans un second appel.',
    '',
    '🎯 Maintenant, génère l\'article complet en respectant TOUTES ces contraintes.',
  );

  const userPrompt = userPromptParts.join('\n');

  const message = await claudeCreate(client, {
    model: 'claude-sonnet-4-6',
    max_tokens: 16000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  return { content: message.content[0].text, promptDebug: `=== SYSTEM ===\n${systemPrompt}\n\n=== USER ===\n${userPrompt}` };
}

/**
 * Second focused call: generate FAQ HTML + 3 visual schemas.
 * Separated from the main article generation to avoid token exhaustion.
 */
export async function generateFaqAndSchemas({ mainKeyword, bodyContent, faqQuestions = [], tone }) {
  const client = getClient();

  const faqQuestionsBlock = faqQuestions.length > 0
    ? `Traite en priorité ces questions :\n${faqQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
    : `Génère 8 à 10 questions fréquentes pertinentes sur le sujet.`;

  const prompt = `Tu es un expert SEO. Génère exactement trois blocs pour un article sur "${mainKeyword}".

Ton : ${tone ?? 'expert et pédagogique'}. Langue : français.

CONTENU DE RÉFÉRENCE (extrait de l'article) :
${bodyContent.slice(0, 2000)}

---

## BLOC 1 — FAQ (CODE HTML ACCORDÉON)
${faqQuestionsBlock}

Règles :
- 8 à 10 questions/réponses riches en mots-clés, optimisées GEO
- Code HTML UNIQUEMENT avec attributs style="..." inline
- INTERDIT : class=, id=, <style>, feuilles CSS
- Format exact (accordéon) :

\`\`\`html
<div style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:24px 0">
  <h2 style="font-size:1.4rem;font-weight:700;margin-bottom:16px">Questions fréquentes</h2>
  <div style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;overflow:hidden">
    <button onclick="var p=this.nextElementSibling;p.style.display=p.style.display==='none'?'block':'none'" style="width:100%;text-align:left;padding:16px 20px;font-weight:600;font-size:0.95rem;background:#f9fafb;border:none;cursor:pointer">Question ?</button>
    <div style="padding:16px 20px;display:none;font-size:0.9rem;line-height:1.6;color:#374151">Réponse.</div>
  </div>
</div>
\`\`\`

---

## BLOC 2 — SCHEMA.ORG FAQ (JSON-LD)

Génère le balisage structuré schema.org pour la même FAQ du BLOC 1.
Format exact :

\`\`\`json-ld
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Question ?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Réponse complète."
      }
    }
  ]
}
</script>
\`\`\`

---

## BLOC 3 — SCHÉMAS VISUELS (3 blocs HTML)

Génère exactement 3 schémas adaptés au contenu :
- SCHÉMA 1 : tableau comparatif ou checklist (<table> avec <tr>/<th>/<td>)
- SCHÉMA 2 : processus ou étapes numérotées
- SCHÉMA 3 : synthèse visuelle libre

Règles absolues :
- UNIQUEMENT attributs style="..." inline
- INTERDIT : class=, id=, <style>, CSS externe
- Responsive (max-width, flexbox inline)

Format exact :
📌 SCHEMA 1 - À insérer après : [H2/H3 concerné]
\`\`\`html
<div style="font-family:sans-serif;max-width:800px;margin:24px auto">...</div>
\`\`\`
📌 SCHEMA 2 - À insérer après : [H2/H3 concerné]
\`\`\`html
...
\`\`\`
📌 SCHEMA 3 - À insérer après : [H2/H3 concerné]
\`\`\`html
...
\`\`\``;

  const message = await claudeCreate(client, {
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = message.content[0].text;

  // ── Parse FAQ HTML (BLOC 1) ────────────────────────────────────────────────
  const bloc2Start = raw.search(/##\s*BLOC\s*2|##\s*SCHEMA(?:\.ORG)?/i);
  const bloc3Start = raw.search(/##\s*BLOC\s*3|##\s*SCH[EÉ]MAS\s*VISUELS|📌\s*SCH/i);

  const faqSection = bloc2Start !== -1 ? raw.slice(0, bloc2Start) : (bloc3Start !== -1 ? raw.slice(0, bloc3Start) : raw);
  const faqFenced = faqSection.match(/```(?:html)?\s*([\s\S]*?)```/);
  const faqHtml = faqFenced
    ? faqFenced[1].trim()
    : (() => {
        const idx = faqSection.indexOf('<div');
        return idx !== -1 ? faqSection.slice(idx).trim() : '';
      })();

  // ── Parse schema.org JSON-LD (BLOC 2) ─────────────────────────────────────
  let faqJsonLd = '';
  if (bloc2Start !== -1) {
    const bloc2End = bloc3Start !== -1 ? bloc3Start : raw.length;
    const jsonLdSection = raw.slice(bloc2Start, bloc2End);
    // Match ```json-ld ... ```, ```json ... ```, ```html ... ``` or bare <script>
    const jsonFenced = jsonLdSection.match(/```(?:json-ld|json|html)?\s*([\s\S]*?)```/);
    if (jsonFenced) {
      faqJsonLd = jsonFenced[1].trim();
    } else {
      const scriptIdx = jsonLdSection.indexOf('<script');
      if (scriptIdx !== -1) faqJsonLd = jsonLdSection.slice(scriptIdx).trim();
    }
  }
  // Fallback: if BLOC 2 wasn't found but raw contains a JSON-LD script, extract it
  if (!faqJsonLd) {
    const globalScriptIdx = raw.indexOf('<script type="application/ld+json">');
    if (globalScriptIdx !== -1) {
      const scriptEnd = raw.indexOf('</script>', globalScriptIdx);
      faqJsonLd = scriptEnd !== -1 ? raw.slice(globalScriptIdx, scriptEnd + 9).trim() : raw.slice(globalScriptIdx).trim();
    }
  }

  // Combine FAQ HTML + JSON-LD into a single copyable block
  const faqEmbed = [faqHtml, faqJsonLd].filter(Boolean).join('\n\n');

  // ── Parse visual schemas (BLOC 3) ─────────────────────────────────────────
  const schemasSection = bloc3Start !== -1 ? raw.slice(bloc3Start) : '';
  const schemas = [];
  // Split on schema markers — handle both accented (SCHÉMA) and plain (SCHEMA)
  for (const part of schemasSection.split(/(?=📌\s*SCH[EÉ]MA?\s*\d+)/i)) {
    if (!part.includes('📌')) continue;
    const insertMatch = part.match(/📌\s*SCH[EÉ]MA?\s*\d+[^:]*:\s*(.+)/i);
    const position = insertMatch ? insertMatch[1].trim() : '';
    const fenced = part.match(/```(?:html)?\s*([\s\S]*?)```/);
    let code = fenced ? fenced[1].trim() : '';
    if (!code) {
      const htmlStart = part.search(/<(div|table|section)/);
      if (htmlStart !== -1) code = part.slice(htmlStart).trim();
    }
    if (code) schemas.push({ position, code });
  }

  return { faqEmbed, schemas };
}

/**
 * Third focused call: generate 2 visual HTML schemas (table/comparison/process).
 * Separated from FAQ generation to avoid token exhaustion and improve reliability.
 *
 * @param {object} params
 * @param {string} params.mainKeyword
 * @param {string} params.bodyContent  - Article body (excerpt used for context)
 * @param {string} params.tone
 * @returns {Promise<Array<{ position: string, type: string, code: string }>>}
 */
export async function generateTableSchemas({ mainKeyword, bodyContent, tone = 'expert et pédagogique' }) {
  const client = getClient();

  const excerpt = bodyContent.slice(0, 2500);

  const prompt = `Tu es un expert en design de contenu web. Génère exactement 2 schémas visuels HTML pour un article sur "${mainKeyword}".

TON : ${tone}. LANGUE : français.

EXTRAIT DE L'ARTICLE (pour adapter le contenu des schémas) :
${excerpt}

---

## RÈGLES ABSOLUES
- Styles inline style="..." UNIQUEMENT — INTERDIT : class=, id=, <style>, CSS externe
- Données RÉELLES tirées du contenu de l'article (pas de placeholders génériques)
- max-width sur chaque div racine (responsive)
- Couleurs : fond #f9fafb, texte #111827, accent #2563eb, bordures #e5e7eb

---

## FORMAT DE SORTIE

Génère exactement 2 schémas avec ce format :

📌 SCHEMA 1 - Type : [tableau comparatif | checklist | processus | synthèse chiffrée] - Position : [après quel H2]
\`\`\`html
<div style="...">...</div>
\`\`\`

📌 SCHEMA 2 - Type : [...] - Position : [après quel H2]
\`\`\`html
...
\`\`\`

---

## EXEMPLES DE STRUCTURES ACCEPTÉES

**Tableau comparatif (adapte les colonnes et données au contenu) :**
\`\`\`html
<div style="font-family:sans-serif;max-width:800px;margin:24px auto;overflow-x:auto">
  <table style="width:100%;border-collapse:collapse;font-size:0.9rem">
    <thead>
      <tr style="background:#2563eb;color:#fff">
        <th style="padding:12px 16px;text-align:left;font-weight:600">Critère</th>
        <th style="padding:12px 16px;text-align:left;font-weight:600">Option A</th>
        <th style="padding:12px 16px;text-align:left;font-weight:600">Option B</th>
      </tr>
    </thead>
    <tbody>
      <tr><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;font-weight:600;background:#f9fafb">Critère 1</td><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;background:#f9fafb">Valeur A</td><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;background:#f9fafb">Valeur B</td></tr>
    </tbody>
  </table>
</div>
\`\`\`

**Processus numéroté :**
\`\`\`html
<div style="font-family:sans-serif;max-width:700px;margin:24px auto">
  <div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:12px">
    <div style="min-width:32px;height:32px;border-radius:50%;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem;flex-shrink:0">1</div>
    <div style="padding-top:4px"><strong style="color:#111827;display:block;margin-bottom:2px">Titre de l'étape</strong><span style="color:#374151;font-size:0.875rem">Description.</span></div>
  </div>
</div>
\`\`\`

**Checklist :**
\`\`\`html
<div style="font-family:sans-serif;max-width:680px;margin:24px auto;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px 24px">
  <p style="margin:0 0 12px;font-weight:700;color:#166534">Points essentiels</p>
  <ul style="margin:0;padding:0;list-style:none">
    <li style="display:flex;gap:10px;margin-bottom:8px;font-size:0.9rem;color:#374151"><span style="color:#16a34a;font-weight:700;flex-shrink:0">✓</span>Point 1</li>
  </ul>
</div>
\`\`\`

Génère maintenant les 2 schémas avec des données concrètes tirées de l'article.`;

  const message = await claudeCreate(client, {
    model:      'claude-sonnet-4-6',
    max_tokens: 4000,
    messages:   [{ role: 'user', content: prompt }],
  });

  const raw = message.content[0].text;
  const schemas = [];

  for (const part of raw.split(/(?=📌\s*SCHEMA\s*\d+)/i)) {
    if (!/📌/i.test(part)) continue;
    const headerMatch = part.match(/📌\s*SCHEMA\s*\d+\s*-\s*Type\s*:\s*([^-\n]+)(?:\s*-\s*Position\s*:\s*([^\n]+))?/i);
    const type     = headerMatch?.[1]?.trim() ?? 'tableau';
    const position = headerMatch?.[2]?.trim() ?? '';
    const fenced   = part.match(/```(?:html)?\s*([\s\S]*?)```/);
    let code = fenced ? fenced[1].trim() : '';
    if (!code) {
      const htmlStart = part.search(/<(div|table|ul)/);
      if (htmlStart !== -1) code = part.slice(htmlStart).trim();
    }
    if (code) schemas.push({ type, position, code });
  }

  return schemas;
}
