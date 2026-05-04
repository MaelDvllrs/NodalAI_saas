import Anthropic from '@anthropic-ai/sdk';
import { claudeCreate, claudeCreateWithSearch, extractTextContent } from '../../../utils/claudeRetry.js';

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquant dans .env');
  return new Anthropic({ apiKey });
}

// ── KD → article length ───────────────────────────────────────────────────────
export function getWordCountBounds(kd) {
  if (kd === null || kd === undefined) return { min: 2000, max: 2600 };
  if (kd <= 10)  return { min: 1200, max: 1600 };
  if (kd <= 20)  return { min: 1600, max: 2100 };
  if (kd <= 35)  return { min: 2100, max: 2700 };
  if (kd <= 50)  return { min: 2700, max: 3300 };
  if (kd <= 70)  return { min: 3300, max: 3900 };
  return { min: 3900, max: 4600 };
}

export function getLengthFromKd(kd) {
  if (kd === null || kd === undefined)
    return { range: '2 000 – 2 600 mots', objective: 'Article structuré et optimisé SEO', midWords: 2300 };
  if (kd <= 10)
    return { range: '1 200 – 1 600 mots', objective: 'Réponse claire et ciblée', midWords: 1400 };
  if (kd <= 20)
    return { range: '1 600 – 2 100 mots', objective: 'Contenu structuré avec sous-parties', midWords: 1850 };
  if (kd <= 35)
    return { range: '2 100 – 2 700 mots', objective: 'Article approfondi + optimisation sémantique', midWords: 2400 };
  if (kd <= 50)
    return { range: '2 700 – 3 300 mots', objective: 'Guide complet + maillage interne', midWords: 3000 };
  if (kd <= 70)
    return { range: '3 300 – 3 900 mots', objective: 'Contenu expert structuré', midWords: 3600 };
  return { range: '3 900 – 4 600 mots', objective: 'Contenu pilier + autorité thématique', midWords: 4250 };
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
  const targetWordsToUse = targetWords ?? Math.round(serpModel.avgWordCount * 1.1);

  console.log(`[Claude] generateOptimizedOutline — mainKeyword: "${mainKeyword}", theme: "${theme}", targetWords: ${targetWordsToUse}, sous-thèmes: ${subtopicsText}, `);

  const prompt = `Tu es un expert SEO.

Génère un plan d'article optimisé pour le mot-clé "${mainKeyword}" (thème : "${theme ?? mainKeyword}").

RÈGLES OBLIGATOIRES :

1. Couverture 100% des sous-thèmes SERP — chaque sous-thème doit apparaître dans un H2 ou H3 :
${subtopicsText}

2. Intègre naturellement ces entités dans les titres ou descriptions :
${entitiesText}

3. Intention de recherche dominante :
${serpModel.intent}

4. Format de contenu dominant :
${serpModel.contentFormat}

5. CONTRAINTE STRUCTURELLE (CRITIQUE) :
Tu dois respecter STRICTEMENT la longueur cible (~${targetWordsToUse} mots).

- Introduction : 180–220 mots
- Conclusion : 150–200 mots
- H2 : 200–250 mots
- H3 : 100–150 mots

👉 AVANT de générer le plan :
- Calcule le budget de mots restant après introduction + conclusion
- Déduis le nombre MAXIMUM de sections possibles
- Adapte le nombre de H2 et H3 pour NE PAS dépasser ce budget

6. OPTIMISATION :
- Priorise les H2
- Utilise des H3 uniquement si nécessaire pour couvrir les sous-thèmes
- Regroupe les sous-thèmes proches dans un même H2 quand possible
- Ne dépasse jamais le nombre de sections autorisé

7. SORTIE :
- Donne uniquement le plan (H1, H2, H3)
- Pas de contenu
- Structure optimisée SEO + lisibilité
- NE PAS inclure de section FAQ dans le plan — elle sera générée séparément

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
- Tous les marqueurs : [[INTERNE:...]], [[EXTERNE:...]], [[QUOTE:...]] — les conserver intégralement, ne jamais couper un marqueur en deux
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
  body, introduction, tone,
  serpModel, semanticAnalysis, coverageData, wcMin, wcMax,
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
    ? `\n\n### Champ lexical prioritaire (à intégrer naturellement) :\n${top30Terms.map((t, i) => `${i+1}. ${t}`).join('  ·  ')}`
    : '';

  const missingTopicBlock = missingTopics.length > 0
    ? `\n### Sous-thèmes SERP NON COUVERTS (obligatoires) :\n${missingTopics.map((t, i) => `${i+1}. ${t}`).join('\n')}`
    : '\n✅ Tous les sous-thèmes SERP sont déjà couverts — renforcer leur traitement.';

  const missingEntityBlock = missingEntities.length > 0
    ? `\n### Entités SERP manquantes (à intégrer naturellement) :\n${missingEntities.join(', ')}`
    : '\n✅ Entités déjà présentes.';

  const hasInternalLinks = (body + introduction).includes('[[INTERNE:');

  const prompt = `Tu es un expert SEO et rédacteur web senior. Tu dois RÉÉCRIRE INTÉGRALEMENT le corps et l'introduction d'un article qui a obtenu un score SEO insuffisant.

## PRIORITÉS (ORDRE STRICT)
1. Qualité rédactionnelle et valeur pour le lecteur
2. Couverture des sous-thèmes SERP manquants
3. Intégration naturelle du champ lexical
4. Contraintes techniques (liens, schémas)
⚠️ Si deux contraintes entrent en conflit, privilégie toujours la qualité du contenu.

## DIAGNOSTIC
Score SEO actuel : **${totalScore}/100** (seuil minimum : 65)
- Couverture sous-thèmes SERP : ${topicCoverage}%
- Couverture entités : ${entityCoverage}%
- Score volume : ${wordScore}%

## OBJECTIF
Longueur cible : **${wcMin}–${wcMax} mots** pour le CORPS. Intention de recherche : **${serpModel?.intent ?? 'informationnelle'}**.
${missingTopicBlock}
${missingEntityBlock}${top30Block}

## DENSITÉ SÉMANTIQUE (OPTIMISATION INTELLIGENTE)
- Intègre naturellement les termes du champ lexical ci-dessus
- Priorité : fluidité, lisibilité et valeur utilisateur
- Évite toute répétition artificielle ou sur-optimisation
- Chaque terme important doit apparaître 2 à 5 fois selon sa pertinence
- Favorise les variantes sémantiques et synonymes

### Termes TF-IDF principaux :
${primaryTerms}

### Expressions longue traîne (utiliser dans H3 et intro) :
${longTailList}

### Gaps de contenu (si pertinent) :
${contentGaps}

## STYLE RÉDACTIONNEL
- Écris comme un expert humain, pas comme une IA
- Évite les formulations génériques ("Dans cet article...")
- Apporte des insights, exemples concrets ou angles différenciants
- Paragraphes courts (3-5 lignes max), listes à puces régulières
- Phrases de transition naturelles entre les sections

## RÈGLES DE RÉÉCRITURE
- Conserver INTÉGRALEMENT tous les titres H2 (## ...) et H3 (### ...) du corps
- Conserver INTÉGRALEMENT tous les marqueurs : [[INTERNE:...]], [[EXTERNE:...]], [[QUOTE:...]]
- Introduction : accroche forte (chiffre, question ou constat), mot-clé dès le début, promesse claire au lecteur
- Ton : ${tone}
- Langue : français uniquement
- Chaque H2 traite un angle unique, sans répétition de sous-thème
${hasInternalLinks ? '- Les liens internes [[INTERNE:...]] existants doivent être conservés et enrichis si possible' : '- Aucune URL interne disponible — ne pas forcer de liens internes fictifs'}

## VALIDATION INTERNE (AVANT FIN)
Avant de terminer, vérifie que :
- Au moins 3 liens externes fiables [[EXTERNE:...]] sont présents
- Au moins 2 citations [[QUOTE:...]] sont présentes dans des sections différentes
Si un élément manque, ajoute-le avant la conclusion.

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

// ── Find real external links via web search ───────────────────────────────────
/**
 * Use Claude + web search to find 6-8 real, current, verifiable external URLs
 * relevant to the article topic. Returns an array of { url, title, anchor } objects.
 */
export async function findExternalLinks(mainKeyword, secondaryKeywords = []) {
  const client = getClient();
  const context = secondaryKeywords.slice(0, 3).join(', ');

  const message = await claudeCreateWithSearch(client, {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Tu es un expert SEO. Recherche sur le web des sources fiables et actuelles pour un article sur : "${mainKeyword}"${context ? ` (contexte : ${context})` : ''}.

Trouve 6 à 8 URLs réelles provenant de sources de référence (sites officiels, études, statistiques, guides d'autorité).
Exemples de sources acceptables : HubSpot, Statista, INSEE, Forbes, Wikipedia, MDN, Google, Semrush, Search Engine Journal, Moz, etc.

IMPORTANT : utilise uniquement des URLs que tu as trouvées dans les résultats de recherche web — aucune URL inventée.

Retourne UNIQUEMENT un tableau JSON valide, sans texte avant ou après :
[
  { "url": "https://...", "title": "Titre de la page", "anchor": "texte d'ancre naturel pour l'article" },
  ...
]`,
    }],
  });

  try {
    const raw = extractTextContent(message);
    const jsonStr = raw.startsWith('[') ? raw : raw.match(/\[[\s\S]*\]/)?.[0] || '[]';
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed.filter(l => l.url && l.url.startsWith('http')).slice(0, 8) : [];
  } catch {
    return [];
  }
}

// ── Internal URL text builder (grouped by priority) ──────────────────────────

const _BLOG_PAT    = /\/(blog|article|articles|actualite|actualites|news|post|posts|guide|guides|ressource|ressources|dossier|conseil|conseils|tuto|tutoriel|tutorial)\//i;
const _SERVICE_PAT = /\/(service|services|solution|solutions|produit|produits|product|products|offre|offres|prestation|prestations|expertise|competence)\//i;
const _SKIP_PAT    = /\/(contact|about|qui-sommes-nous|a-propos|mentions-legales|cgv|cgu|politique-de-confidentialite|confidentialite|privacy|legal|sitemap|404|403|login|connexion|inscription|register|panier|cart|checkout|mon-compte|account)\b/i;

function buildInternalUrlsText(links) {
  const blog    = links.filter(u => _BLOG_PAT.test(u.url ?? ''));
  const service = links.filter(u => !_BLOG_PAT.test(u.url ?? '') && _SERVICE_PAT.test(u.url ?? ''));
  const other   = links.filter(u => !_BLOG_PAT.test(u.url ?? '') && !_SERVICE_PAT.test(u.url ?? '') && !_SKIP_PAT.test(u.url ?? ''));

  const fmt = (u) => `- ${u.title} : ${u.url}`;
  const parts = [];

  if (blog.length > 0) {
    parts.push(`⭐ Articles de blog (À PRIORISER pour le maillage interne) :\n${blog.map(fmt).join('\n')}`);
  }
  if (service.length > 0) {
    parts.push(`🛠️ Pages services / solutions (À PRIORISER) :\n${service.map(fmt).join('\n')}`);
  }
  if (other.length > 0) {
    parts.push(`📄 Autres pages :\n${other.map(fmt).join('\n')}`);
  }

  return parts.length > 0 ? parts.join('\n\n') : links.map(fmt).join('\n');
}

// ── Full blog generation ──────────────────────────────────────────────────────
/**
 * Generate a full SEO/GEO blog article.
 *
 * @param {object} params
 * @param {string}   params.mainKeyword      - Required (or use geoPrompt)
 * @param {string}   params.tone             - Rédactionnel tone
 * @param {number}   params.kd               - Keyword difficulty (used for length)
 * @param {string[]} params.promptSnippets   - Prompt sections contributed by upstream modules
 * @param {Array}    params.internalUrls     - Internal links available for [[INTERNE:...]]
 * @param {Array}    params.ratingExamples   - Rated past articles for style reference
 * @param {string}   params.geoPrompt        - GEO question → becomes H1 if present
 * @param {Array}    params.geoSources       - Sources cited by AIs → priority external links
 */
export async function generateBlogContent({
  mainKeyword,
  tone,
  kd,
  promptSnippets = [],
  internalUrls   = [],
  ratingExamples = [],
  secondaryKeywords = [],
  geoPrompt = null,
  geoSources = [],
}) {
  const hasGeo = !!geoPrompt;
  const effectiveKeyword = mainKeyword ?? geoPrompt;

  const client = getClient();
  const { min: wcBlogMin, max: wcBlogMax } = getWordCountBounds(kd);

  const internalUrlsText = internalUrls.length > 0
    ? buildInternalUrlsText(internalUrls)
    : 'Aucune URL interne disponible.';

  // ── Fetch real external links via web search ─────────────────────────────
  let externalLinksText = '';
  try {
    const externalLinks = await findExternalLinks(effectiveKeyword, secondaryKeywords);
    if (externalLinks.length > 0) {
      externalLinksText = externalLinks
        .map(l => `- [[EXTERNE:${l.url}|${l.anchor || l.title}]] (${l.title})`)
        .join('\n');
      console.log(`[Blog] ${externalLinks.length} liens externes trouvés via web search`);
    }
  } catch (err) {
    console.warn('[Blog] findExternalLinks échoué (non bloquant):', err.message);
  }

  // ── GEO sources as priority external links ────────────────────────────────
  const geoSourcesText = geoSources.length > 0
    ? geoSources
        .filter(s => s.url)
        .map(s => `- [[EXTERNE:${s.url}|${s.name ?? s.url}]]${s.type ? ` (${s.type})` : ''}`)
        .join('\n')
    : '';

  // Combine GEO sources (priority) + web-searched links
  const combinedExternalLinksText = [geoSourcesText, externalLinksText].filter(Boolean).join('\n');

  const hasSeo = !!mainKeyword;

  // Bloc GEO — injecté dans le system prompt si contexte GEO présent
  const geoSystemBlock = hasGeo ? `

## OPTIMISATION GEO — RÈGLES ADDITIONNELLES
Cet article doit aussi être optimisé pour être extrait comme réponse directe par les IA (ChatGPT, Perplexity, Gemini).
- Chaque H2 commence par 1-2 phrases de réponse directe (principe "answer first")
- Les affirmations importantes sont sourcées avec des liens externes fiables
- Structure factuelle : affirmation → preuve → exemple → implication
- H1 de l'article = reformulation de "${geoPrompt}" (percutante, max 90 caractères)
` : '';

  // Bloc SEO de base — injecté uniquement en mode GEO pur (pas de module keyword-research en amont)
  // En mode SEO ou mix, les snippets SERP/sémantique fournis par les modules amont couvrent déjà ce besoin
  const seoBaseBlock = (!hasSeo && hasGeo) ? `

## OPTIMISATION SEO — RÈGLES DE BASE
En l'absence d'analyse SERP en amont, applique ces règles SEO fondamentales :
- **Mot-clé SEO principal :** "${effectiveKeyword}" — intègre-le dans le H1, l'introduction, au moins 2 H2 et la conclusion
- Variantes sémantiques : utilise des synonymes et reformulations naturelles pour éviter la sur-optimisation
- Intention de recherche : identifie si la requête est informationnelle, commerciale ou navigationnelle et adapte le contenu
- **Titre SEO (section 1)** : intègre le mot-clé principal naturellement (55-60 caractères)
- **Meta description (section 2)** : inclut le mot-clé et une promesse claire (max 160 caractères)
- Maillage interne : si des URLs sont disponibles, crée au moins 3 liens internes pertinents
` : '';

  const systemPrompt = `Tu es un expert SEO et copywriter spécialisé dans la création de contenu optimisé pour les moteurs de recherche.
Tu génères des articles de blog COMPLETS, intégralement rédigés, prêts à être publiés directement.

## RÈGLES NON NÉGOCIABLES (à respecter même si cela semble superflu)
Ces règles sont ABSOLUES — elles ne sont jamais optionnelles :

🔗 **LIENS INTERNES — OBLIGATION STRICTE**
Les URLs internes fournies dans le user prompt DOIVENT apparaître dans l'article sous forme de liens [[INTERNE:URL|texte d'ancre]].
- Si des URLs internes sont listées → place-en minimum 3 dans le corps de l'article
- Choisis un texte d'ancre naturel (jamais l'URL brute)
- Répartis-les dans des sections différentes (pas tous dans la conclusion)

🔗 **LIENS EXTERNES — OBLIGATION STRICTE**
Les liens externes fournis dans le user prompt DOIVENT être utilisés dans l'article sous forme [[EXTERNE:URL|texte d'ancre]].
- Si des liens externes sont listés → utilise-en minimum 3
- Ajoute-les naturellement là où ils sourcent une affirmation
- Ne jamais inventer une URL non fournie

## PRIORITÉS (ORDRE STRICT)
1. Qualité rédactionnelle et valeur pour le lecteur
2. Intégration des liens internes et externes fournis (règle non négociable ci-dessus)
3. Respect de la structure demandée
4. Couverture des sujets SEO importants
5. Intégration naturelle des mots-clés
⚠️ Si deux contraintes entrent en conflit, privilégie toujours la qualité du contenu — SAUF pour les liens qui restent obligatoires.
${geoSystemBlock}${seoBaseBlock}
---

## 📏 LONGUEUR — RÈGLE N°1

### Objectif : article complet (~${wcBlogMax} mots)

- **Minimum :** ${wcBlogMin} mots
- **Maximum recommandé :** ${Math.round(wcBlogMax * 1.06)} mots
- Si tu dépasses légèrement le maximum, privilégie la qualité plutôt que de couper brutalement

Répartition cible par section :
- Introduction : **180–220 mots**
- Chaque H2 (texte + listes) : **100–150 mots**
- Chaque H3 (texte) : **80–150 mots**
- Conclusion : **120–180 mots**

Stratégie : rédige chaque section de façon dense et substantielle.

---

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

**Points clés de l'article**
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

#### BLOC B — INTRODUCTION (180 à 220 mots)
Rédige une introduction naturelle et engageante, optimisée pour Google et les LLMs.

- Commence par une accroche forte : question, chiffre marquant ou constat percutant
- Intègre le mot-clé principal dès le début du texte, de façon fluide
- Reformule l'intention de recherche naturellement (à qui s'adresse l'article, quel problème résout-il)
- Introduis les concepts clés sans en faire une liste mécanique
- Termine par une promesse claire au lecteur

⚠️ INTERDITS :
- Introduction générique ("Dans cet article, nous allons...")
- Répétition du title tag ou du H1 mot pour mot
- Structure rigide type "Phrase 1 : ... Phrase 2 : ..."

---

### 5. CONTENU COMPLET DE L'ARTICLE
[Champ : Corps de l'article]

📏 OBJECTIF SECTION 5 : ~${wcBlogMax} mots (minimum ${wcBlogMin}, maximum recommandé ${Math.round(wcBlogMax * 1.06)}).
Répartition : H2 = 100–150 mots · H3 = 80–150 mots · Conclusion = 120–180 mots.

Rédige le CONTENU INTÉGRAL et complet de l'article en suivant la méthode MECE.

## LISIBILITÉ — RÈGLE ABSOLUE DE MISE EN PAGE
❌ INTERDIT : les blocs de texte continus de plus de 5 lignes sans rupture visuelle.
Chaque section H2 DOIT alterner obligatoirement entre ces formats :
1. Court paragraphe (2-3 phrases max, 1-2 lignes)
2. Liste à puces ou numérotée (3-5 items)
3. Citation [[QUOTE:...]] ou lien externe [[EXTERNE:...|...]]
4. Court paragraphe de transition

✅ Structure type d'un bon H2 :
→ 1 paragraphe d'intro (2 phrases max)
→ 1 liste à puces (4-5 points)
→ 1 paragraphe de développement (2-3 phrases)
→ 1 citation [[QUOTE:...]] ou lien externe sourcé
→ 1 phrase de transition vers le H2 suivant

## STYLE RÉDACTIONNEL (OBLIGATOIRE)
- Écris comme un expert humain, pas comme une IA
- Évite les formulations génériques ("Dans cet article...", "Il est important de noter...")
- Apporte des insights concrets, exemples ou angles différenciants
- **Phrases courtes et simples** : 15 mots max par phrase. Coupe les longues phrases en deux.
- **Aucun pavé de texte** : jamais 2 paragraphes consécutifs sans liste ou rupture visuelle
- Transitions naturelles entre les sections (1 phrase max)

## LISTES ET BLOCKQUOTES — MINIMUMS SUR L'ARTICLE ENTIER
- **Listes à puces ou numérotées : minimum 2 dans l'article total**, placées là où elles apportent de la clarté (énumération, étapes, comparaison) — ne pas en abuser ni en mettre dans chaque section
- **Citations [[QUOTE:...]] : minimum 2 dans l'article**, placées dans des H2 différents

## DENSITÉ SÉMANTIQUE (OPTIMISATION INTELLIGENTE)
- Intègre naturellement les termes fournis dans les contextes ci-dessous
- Priorité : fluidité, lisibilité et valeur utilisateur
- Évite toute répétition artificielle ou sur-optimisation
- Chaque terme important doit apparaître 2 à 5 fois selon sa pertinence
- Favorise les variantes sémantiques et synonymes

**LIENS INTERNES :**
- Format : [[INTERNE:URL|texte d'ancre]]
- ❗ Les URLs listées dans le user prompt ("URLs internes disponibles") DOIVENT toutes être utilisées — minimum 3
- Texte d'ancre = mot ou groupe de mots naturel dans la phrase, jamais l'URL brute
- Si aucune URL n'est fournie → ne pas forcer de liens fictifs

**LIENS EXTERNES :**
- Format : [[EXTERNE:URL|texte d'ancre]]
- ❗ Les liens listés dans le user prompt ("Liens externes vérifiés") DOIVENT être utilisés — minimum 3
- Insère-les là où ils sourcent une affirmation concrète dans le texte
- Ne jamais inventer une URL absente de la liste fournie


**CITATIONS :**
- Format : [[QUOTE:Texte de la citation]]
- Minimum 2 citations obligatoires, placées dans des H2 différents — jamais deux dans la même section

FORMAT POUR CHAQUE SECTION :

## [Titre H2]

[1-2 phrases d'intro directe]

- [Item de liste]
- [Item de liste]
- [Item de liste]

[1-2 phrases de développement ou exemple concret]

[[SCHEMA:type]] ou [[QUOTE:...]] (1 par section, réparti sur l'article)

### [Titre H3]

[1-2 phrases max — dense et direct]

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
- Ton : ${tone ?? 'Expert et pédagogique'}
- La section 4 (Points clés + introduction) est un champ séparé du corps (section 5)
- Ne jamais inventer des données chiffrées sans les sourcer ou les formuler comme estimations
- Ne jamais utiliser le tiret cadratin (—) : remplace par une virgule, un point ou une reformulation

## VALIDATION INTERNE (OBLIGATOIRE AVANT FIN)
Avant de terminer l'article, compte et vérifie :
- ✅ Au moins 3 liens [[INTERNE:URL|ancre]] présents (depuis la liste fournie) — si manquants, ajoute-les maintenant
- ✅ Au moins 3 liens [[EXTERNE:URL|ancre]] présents (depuis la liste fournie) — si manquants, ajoute-les maintenant
- ✅ Au moins 2 citations [[QUOTE:...]] dans des sections différentes — si manquantes, ajoute-les maintenant

- La FAQ et les schémas visuels seront générés dans un second appel dédié — NE LES INCLUS PAS dans cette réponse. Ta réponse se termine après la section 5.`;

  // ── Build user prompt ─────────────────────────────────────────────────────
  const userPromptParts = [
    `Génère un article de blog complet sur le sujet suivant :`,
    ``,
    `**Mot-clé principal :** ${effectiveKeyword}`,
    ``,
    ...(hasGeo ? [
      `**Question GEO (H1 de l'article) :** ${geoPrompt}`,
      ``,
    ] : []),
    `**Longueur cible :** ~${wcBlogMax} mots pour le corps (min ${wcBlogMin}, max recommandé ${Math.round(wcBlogMax * 1.06)})`,
    ``,
    `**URLs internes disponibles :**`,
    internalUrlsText,
    ``,
    ...(combinedExternalLinksText ? [
      `**Liens externes vérifiés :**`,
      combinedExternalLinksText,
      ``,
    ] : []),
  ];

  // ── Secondary keywords ────────────────────────────────────────────────────
  if (secondaryKeywords.length > 0) {
    userPromptParts.push(
      `**Mots-clés secondaires à intégrer naturellement :**`,
      secondaryKeywords.map((kw, i) => `${i + 1}. "${kw}"`).join('\n'),
      ``,
    );
  }

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
      `## EXEMPLES DE STYLE (note moyenne : ${avgRating}/5)\n` +
      `Inspire-toi du style d'accroche, du niveau de détail et de la structure. Ne copie pas le contenu.\n\n` +
      ratingExamples.map((b, i) => {
        const intro = (b.introduction || '').slice(0, 300).replace(/\n+/g, ' ');
        return `### Exemple ${i + 1} — Note ${b.rating}/5 (thème : ${b.theme || '—'}, ton : ${b.tone || '—'})\n**Titre** : ${b.title}\n**Début de l'introduction** : ${intro}${(b.introduction || '').length > 300 ? '...' : ''}`;
      }).join('\n\n')
    );
  }

  userPromptParts.push('\n---\n', 'Génère maintenant l\'article complet.');

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
export async function generateFaqAndSchemas({ mainKeyword, bodyContent, faqQuestions = [], tone, styleGuide = {} }) {
  const client = getClient();

  const primary      = styleGuide.primaryColor   ?? '#2563eb';
  const secondary    = styleGuide.secondaryColor ?? '#f9fafb';
  const textPrimary  = styleGuide.textPrimary    ?? '#111827';
  const textSecond   = styleGuide.textSecondary  ?? '#374151';
  const textAlt      = styleGuide.textAlternate  ?? '#6b7280';
  const radiusPx     = styleGuide.borderRadiusPx ?? styleGuide.borderRadius?.replace('px','') ?? '8';
  const radius       = `${radiusPx}px`;
  const shadow    = (styleGuide.shadow && styleGuide.shadow !== 'none')
    ? `;box-shadow:${styleGuide.shadow}`
    : '';

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
- INTERDIT : emojis dans le contenu
- Style sobre et professionnel, pas de dégradés ni d'effets visuels excessifs
- Couleur d'accent : ${primary} | Fond : ${secondary} | Border-radius : ${radius}
- Texte : primaire ${textPrimary} | secondaire ${textSecond} | alternatif ${textAlt}
- Format exact (accordéon) :

\`\`\`html
<div style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:24px 0">
  <h2 style="font-size:1.4rem;font-weight:700;margin-bottom:16px;color:${textPrimary}">Questions fréquentes</h2>
  <div style="border:1px solid #e5e7eb;border-radius:${radius};margin-bottom:8px;overflow:hidden${shadow}">
    <button onclick="var p=this.nextElementSibling;p.style.display=p.style.display==='none'?'block':'none'" style="width:100%;text-align:left;padding:16px 20px;font-weight:600;font-size:0.95rem;color:${textPrimary};background:${secondary};border:none;cursor:pointer">Question ?</button>
    <div style="padding:16px 20px;display:none;font-size:0.9rem;line-height:1.6;color:${textSecond}">Réponse.</div>
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
- INTERDIT : emojis (ni dans les icônes, ni dans le texte)
- INTERDIT : dégradés (gradient), animations, effets visuels "IA"
- Style sobre, éditorial, professionnel — données réelles tirées de l'article
- Couleur d'accent : ${primary} | Fond : ${secondary} | Border-radius : ${radius}${shadow ? ` | Shadow : ${styleGuide.shadow}` : ''}
- Texte : primaire ${textPrimary} | secondaire ${textSecond} | alternatif ${textAlt}
- Responsive (max-width sur chaque div racine)

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
export async function generateTableSchemas({ mainKeyword, bodyContent, tone = 'expert et pédagogique', styleGuide = {} }) {
  const client = getClient();

  const primary      = styleGuide.primaryColor   ?? '#2563eb';
  const secondary    = styleGuide.secondaryColor ?? '#f9fafb';
  const textPrimary  = styleGuide.textPrimary    ?? '#111827';
  const textSecond   = styleGuide.textSecondary  ?? '#374151';
  const textAlt      = styleGuide.textAlternate  ?? '#6b7280';
  const radiusPx     = styleGuide.borderRadiusPx ?? styleGuide.borderRadius?.replace('px','') ?? '8';
  const radius       = `${radiusPx}px`;
  const shadowCss = (styleGuide.shadow && styleGuide.shadow !== 'none')
    ? `;box-shadow:${styleGuide.shadow}`
    : '';

  const excerpt = bodyContent.slice(0, 2500);

  const prompt = `Tu es un expert en design de contenu web. Génère exactement 2 schémas visuels HTML pour un article sur "${mainKeyword}".

TON : ${tone}. LANGUE : français.

EXTRAIT DE L'ARTICLE (pour adapter le contenu des schémas) :
${excerpt}

---

## RÈGLES ABSOLUES
- Styles inline style="..." UNIQUEMENT — INTERDIT : class=, id=, <style>, CSS externe
- INTERDIT : emojis (ni comme icônes, ni dans le texte)
- INTERDIT : dégradés (background: linear-gradient ou similar), animations, effets "IA"
- Style sobre, éditorial, professionnel — aucun effet visuel excessif
- Données RÉELLES tirées du contenu de l'article (pas de placeholders génériques)
- max-width sur chaque div racine (responsive)
- Palette : accent ${primary} | fond ${secondary} | bordures #e5e7eb
- Texte : primaire ${textPrimary} | secondaire ${textSecond} | alternatif ${textAlt}
- Border-radius : ${radius}${shadowCss ? ` | box-shadow : ${styleGuide.shadow}` : ''}

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
      <tr style="background:${primary};color:#fff">
        <th style="padding:12px 16px;text-align:left;font-weight:600">Critère</th>
        <th style="padding:12px 16px;text-align:left;font-weight:600">Option A</th>
        <th style="padding:12px 16px;text-align:left;font-weight:600">Option B</th>
      </tr>
    </thead>
    <tbody>
      <tr><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;font-weight:600;color:${textPrimary};background:${secondary}">Critère 1</td><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:${textSecond};background:${secondary}">Valeur A</td><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:${textSecond};background:${secondary}">Valeur B</td></tr>
    </tbody>
  </table>
</div>
\`\`\`

**Processus numéroté :**
\`\`\`html
<div style="font-family:sans-serif;max-width:700px;margin:24px auto">
  <div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:12px">
    <div style="min-width:32px;height:32px;border-radius:${radius};background:${primary};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem;flex-shrink:0">1</div>
    <div style="padding-top:4px"><strong style="color:${textPrimary};display:block;margin-bottom:2px">Titre de l'étape</strong><span style="color:${textSecond};font-size:0.875rem">Description.</span></div>
  </div>
</div>
\`\`\`

**Checklist (utilise des tirets, pas d'emojis) :**
\`\`\`html
<div style="font-family:sans-serif;max-width:680px;margin:24px auto;background:${secondary};border:1px solid #e5e7eb;border-radius:${radius};padding:20px 24px${shadowCss}">
  <p style="margin:0 0 12px;font-weight:700;color:${textPrimary}">Points essentiels</p>
  <ul style="margin:0;padding:0;list-style:none">
    <li style="display:flex;gap:10px;margin-bottom:8px;font-size:0.9rem;color:${textSecond}"><span style="color:${textAlt};font-weight:700;flex-shrink:0;font-size:1rem">—</span>Point 1</li>
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
