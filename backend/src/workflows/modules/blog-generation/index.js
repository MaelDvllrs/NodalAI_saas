/**
 * Module: Blog Generation
 *
 * Generates a full SEO-optimised blog article using Claude Sonnet.
 *
 * Only `mainKeyword` is required. All other context (serpModel, semanticAnalysis,
 * siteProfile, tone…) is optional — each upstream module contributes its own
 * prompt section via `ctx.promptSnippets[]` before this module runs.
 *
 * This module adds two additional snippets before calling the LLM:
 *   1. Density table (scaled term frequencies — requires kd to compute)
 *   2. Optimized outline (generated from serpModel via a fast Haiku call)
 *
 * Inputs  (ctx): mainKeyword (required), promptSnippets[], kd, serpModel,
 *                semanticAnalysis, tone, siteProfile, internalLinks,
 *                ratingExamples, detectedFields, resolvedRefs
 * Outputs (ctx): blogContent, parsedBlog, htmlBody, fieldData, outline
 */

import {
  generateBlogContent,
  generateFaqAndSchemas,
  generateTableSchemas,
  generateOptimizedOutline,
  getWordCountBounds,
  getLengthFromKd,
  scaleTermCounts,
  trimContentToWordCount,
} from './claude.js';
import { parseBlogContent }             from '../../../utils/blogParser.js';
import { buildBodyHtml, buildFieldData, buildFullHtml } from '../../../utils/htmlBuilder.js';

const MAX_ATTEMPTS = 3;

export const BlogGenerationModule = {
  /**
   * @param {WorkflowContext} ctx
   * @param {object} config
   * @param {{ emitEvent: Function, jobId: string }} runtime
   */
  async execute(ctx, config, { emitEvent, jobId }) {
    // ── GEO context ───────────────────────────────────────────────────────────
    const geoPrompt       = ctx.geoPrompt      ?? null;
    const geoQuestions    = Array.isArray(ctx.geoQuestions)    ? ctx.geoQuestions    : [];
    const geoSources      = Array.isArray(ctx.geoSources)      ? ctx.geoSources      : [];
    const geoCommonPoints = Array.isArray(ctx.geoCommonPoints)  ? ctx.geoCommonPoints : [];
    const geoContentGaps  = Array.isArray(ctx.geoContentGaps)   ? ctx.geoContentGaps  : [];
    const geoAnalysis     = ctx.geoAnalysis    ?? '';

    const {
      serpModel,
      semanticAnalysis,
      ratingExamples   = [],
      detectedFields   = null,
      resolvedRefs     = {},
    } = ctx;

    // mainKeyword fallback sur geoPrompt si absent
    const mainKeyword = ctx.mainKeyword ?? geoPrompt;

    // internalLinks : depuis ctx direct, avec fallback sitemapUrls si vide
    let internalLinks = Array.isArray(ctx.internalLinks) ? ctx.internalLinks : [];
    const sitemapUrls = Array.isArray(ctx.sitemapUrls) ? ctx.sitemapUrls : [];
    if (internalLinks.length === 0 && sitemapUrls.length > 0) {
      internalLinks = sitemapUrls.map(url => {
        try {
          const slug = new URL(url).pathname.replace(/\/$/, '').split('/').pop() ?? url;
          const title = slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || url;
          return { title, url };
        } catch { return { title: url, url }; }
      });
    }
    // Prioritize blog/service URLs for internal linking
    internalLinks = prioritizeInternalLinks(internalLinks).slice(0, 40);
    if (!mainKeyword) throw new Error('mainKeyword ou geoPrompt requis pour BlogGenerationModule');

    // Émettre des messages contextuels si GEO détecté
    if (geoPrompt) {
      emitEvent(jobId, { type: 'step', message: `✍️ Mode SEO+GEO — Question : "${geoPrompt.slice(0, 80)}${geoPrompt.length > 80 ? '…' : ''}"` });
    }
    if (geoQuestions.length > 0) {
      emitEvent(jobId, { type: 'step', message: `📋 ${geoQuestions.length} question(s) IA → structure H2` });
    }
    if (geoSources.filter(s => s.url).length > 0) {
      emitEvent(jobId, { type: 'step', message: `🔗 ${geoSources.filter(s => s.url).length} source(s) IA → liens externes prioritaires` });
    }

    // Tone resolution: ctx.tone → siteProfile recommendation → config value → default
    const tone = ctx.tone ?? ctx.siteProfile?.recommendedToneForGeneration ?? config?.tone ?? 'Expert et pédagogique';

    // Collect snippets already pushed by upstream modules
    const promptSnippets = [...(ctx.promptSnippets ?? [])];

    // ── 0. GEO snippets (injected BEFORE SERP snippets) ──────────────────────
    const geoQuestionsSnippet = buildGeoQuestionsSnippet(geoQuestions);
    if (geoQuestionsSnippet) promptSnippets.unshift(geoQuestionsSnippet);

    const geoSourcesSnippet = buildGeoSourcesSnippet(geoSources);
    if (geoSourcesSnippet) promptSnippets.unshift(geoSourcesSnippet);

    const geoAnalysisSnippet = buildGeoAnalysisSnippet(geoCommonPoints, geoContentGaps, geoAnalysis);
    if (geoAnalysisSnippet) promptSnippets.unshift(geoAnalysisSnippet);

    // ── 1. Density table snippet (needs kd for scaling) ──────────────────────
    const kd = ctx.kd ?? null;
    const { midWords: generatedWordsMid } = getLengthFromKd(kd);
    // Préférer le compte réel des pages crawlées (mesuré) au lieu de l'estimation IA
    const serpAvgWords = semanticAnalysis?.serpCrawledAvgWordCount
      || serpModel?.avgWordCount
      || generatedWordsMid;

    // ── Word count bounds (needed by buildSerpSnippet and generation loop) ────
    const { min: wcMin, max: wcMax } = getWordCountBounds(serpModel?.kd ?? kd);

    // ── 1. SERP constraints snippet ───────────────────────────────────────────
    if (serpModel) {
      const serpSnippet = buildSerpSnippet(serpModel, mainKeyword, wcMin, wcMax);
      if (serpSnippet) promptSnippets.push(serpSnippet);
    }

    // ── 1b. Density table snippet (needs kd for scaling) ─────────────────────
    if (semanticAnalysis?.intentTopTerms?.length > 0) {
      const densitySnippet = buildDensityTableSnippet(semanticAnalysis, generatedWordsMid, serpAvgWords);
      if (densitySnippet) promptSnippets.push(densitySnippet);
    }
    // ── 1c. Semantic analysis snippet ───────────────────────────────
    if (semanticAnalysis) {
      const semSnippet = buildSemanticSnippet(semanticAnalysis);
      if (semSnippet) promptSnippets.push(semSnippet);
    }
    // ── 1b. Introduction constraints snippet (from serpModel) ─────────────────
    if (serpModel) {
      const introSnippet = buildIntroSnippet(serpModel, mainKeyword);
      if (introSnippet) promptSnippets.push(introSnippet);
    }

    // ── 2. Optimized outline (from serpModel — fast Haiku call) ───────────────
    let optimizedOutline = ctx.outline ?? '';
    if (!optimizedOutline && serpModel?.dominantSubtopics?.length > 0) {
      emitEvent(jobId, { type: 'step', message: '📌 Génération du plan optimisé SERP avec Claude...' });
      try {
        optimizedOutline = await generateOptimizedOutline(
          mainKeyword,
          serpModel,
          ctx.theme ?? ctx.siteProfile?.theme ?? null,
          tone,
          wcMax,  // cible calibrée KD (non basée sur la moyenne SERP)
        );
        if (optimizedOutline) {
          emitEvent(jobId, { type: 'step', message: `✅ Plan généré (${optimizedOutline.split('\n').length} lignes)` });
          promptSnippets.push(buildOutlineSnippet(optimizedOutline));
        }
      } catch {
        // Non-blocking — continue without outline
      }
    } else if (optimizedOutline) {
      promptSnippets.push(buildOutlineSnippet(optimizedOutline));
    }

    // ── 4. Generate blog ──────────────────────────────────────────────────────
    let rawBlog = '';
    let parsed  = null;

    // Asymptotic time-based progress ticker — blog generation is a long blocking
    // Claude call (~30-90 s). Emit progress events every 3 s so the frontend bar
    // keeps moving while waiting. Approaches 90 % asymptotically; the engine emits
    // module-done (100 %) when the call returns.
    let _pct = 0;
    const _progressTick = setInterval(() => {
      _pct = Math.min(90, _pct + (90 - _pct) * 0.07);
      emitEvent(jobId, { type: 'progress', moduleType: 'blog-generation', pct: Math.round(_pct) });
    }, 3000);

    try {

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const attemptLabel = attempt === 1 ? '' : ` (tentative ${attempt}/${MAX_ATTEMPTS})`;
      emitEvent(jobId, { type: 'step', message: `✍️ Génération du blog avec Claude${attemptLabel}...` });

      const result = await generateBlogContent({
        mainKeyword,
        tone,
        kd,
        promptSnippets,
        internalUrls: internalLinks,
        ratingExamples,
        secondaryKeywords: ctx.secondaryKeywords ?? [],
        geoPrompt,
        geoSources,
      });

      rawBlog = result.content;

      // Emit the full generation prompt on the first attempt only
      if (attempt === 1 && result.promptDebug) {
        emitEvent(jobId, { type: 'data', key: 'generationPrompt', value: result.promptDebug });
      }

      parsed = parseBlogContent(rawBlog);

      const wordCount = rawBlog.split(/\s+/).filter(Boolean).length;
      emitEvent(jobId, { type: 'step', message: `📝 Article généré : ${wordCount} mots` });

      // Trim if overlong — only compress the body (planMece) to preserve section structure.
      // trimContentToWordCount returns plain text without numbered section markers, so
      // re-parsing the full rawBlog would lose all section boundaries. Instead we update
      // parsed.planMece directly and keep rawBlog intact for UI display.
      if (wordCount > wcMax * 1.05) {
        emitEvent(jobId, { type: 'step', message: `✂️ Article trop long (${wordCount} mots > max ${wcMax}) — compression...` });
        const trimmedBody = await trimContentToWordCount(
          parsed?.planMece || rawBlog, wcMin, wcMax, mainKeyword
        );
        if (parsed) {
          parsed.planMece = trimmedBody;
        } else {
          rawBlog = trimmedBody;
          parsed  = parseBlogContent(rawBlog);
        }
      }

      const finalWords = rawBlog.split(/\s+/).filter(Boolean).length;
      if (finalWords >= wcMin) break;

      if (attempt < MAX_ATTEMPTS) {
        emitEvent(jobId, { type: 'step', message: `⚠️ Article trop court (${finalWords} mots < min ${wcMin}) — nouvelle tentative...` });
      }
    }

    // ── 5b. Generate FAQ + schemas in a dedicated focused call ────────────────
    // (separated from main generation to avoid token exhaustion)
    if (parsed) {
      emitEvent(jobId, { type: 'step', message: '❓ Génération FAQ + schémas visuels...' });
      const styleGuide = config?.styleGuide ?? {};
      try {
        const { faqEmbed, schemas } = await generateFaqAndSchemas({
          mainKeyword,
          bodyContent: parsed.planMece || rawBlog,
          faqQuestions: ctx.faqQuestions ?? [],
          tone: ctx.tone,
          styleGuide,
        });
        if (faqEmbed) parsed.faqEmbed = faqEmbed;
        if (schemas?.length) parsed.schemas = schemas;
        emitEvent(jobId, { type: 'step', message: `✅ FAQ (${faqEmbed ? 'OK' : 'vide'}) + ${schemas?.length ?? 0} schéma(s) générés` });
      } catch (faqErr) {
        emitEvent(jobId, { type: 'step', message: `⚠️ FAQ/schémas ignorés : ${faqErr.message}` });
      }

      // ── 5c. Generate 2 visual table schemas (focused dedicated call) ──────────
      emitEvent(jobId, { type: 'step', message: '📊 Génération des tableaux visuels...' });
      try {
        const tableSchemas = await generateTableSchemas({
          mainKeyword,
          bodyContent: parsed.planMece || rawBlog,
          tone,
          styleGuide,
        });
        if (tableSchemas.length) {
          parsed.schemas = [...(parsed.schemas ?? []), ...tableSchemas];
          emitEvent(jobId, { type: 'step', message: `✅ ${tableSchemas.length} tableau(x) généré(s)` });
        }
      } catch (tableErr) {
        emitEvent(jobId, { type: 'step', message: `⚠️ Tableaux ignorés : ${tableErr.message}` });
      }
    }

    // ── 5. Build HTML + Webflow field data ────────────────────────────────────
    // webflowFields = raw Webflow fields array (from webflow-structure module)
    // detectedFields is used only for buildBodyHtml; buildFieldData needs the raw array.
    let htmlBody  = null;
    let fieldData = null;
    const webflowFields = ctx.webflowFields ?? null;

    if (parsed) {
      htmlBody = buildBodyHtml(parsed, detectedFields ?? {});
    }
    const htmlBodyFull = parsed ? buildFullHtml(parsed) : null;

    if (parsed && webflowFields?.length > 0) {
      fieldData = buildFieldData(
        webflowFields,
        parsed,
        htmlBody,
        ctx.publishStatus === 'draft',
        ctx.secondaryKeywords ?? [],
        ctx.images?.featured ?? null,
        ctx.images?.content  ?? [],
        resolvedRefs,
      );
    }

    if (parsed?.preview) {
      emitEvent(jobId, { type: 'preview', data: parsed.preview });
    }

    return {
      outline:      optimizedOutline,
      blogContent:  rawBlog,
      parsedBlog:   parsed,
      htmlBody,
      htmlBodyFull,
      fieldData,
    };
  } finally {
    clearInterval(_progressTick);
  }
  },
};

// ── Snippet builders (used locally by this module) ────────────────────────────

function buildOutlineSnippet(outline) {
  return `## PLAN OPTIMISÉ À SUIVRE
Respecte ce plan structurel (tu peux enrichir mais ne supprime pas de section) :

${outline}`;
}

function buildSemanticSnippet(semanticAnalysis) {
  if (!semanticAnalysis) return null;
  const {
    intentTopTerms   = [],
    primaryTerms     = [],
    secondaryTerms   = [],
    longTailVariants = [],
    entities         = [],
    coOccurrences    = [],
    contentGaps      = [],
  } = semanticAnalysis;

  if (!intentTopTerms.length && !primaryTerms.length && !longTailVariants.length && !contentGaps.length) return null;

  const top30 = intentTopTerms.slice(0, 30).map((t) => t.display || t.term);
  const top30Block = top30.length > 0
    ? [
        ``,
        `### ⭐ TOP ${top30.length} MOTS-CLÉS À INTÉGRER EN PRIORITÉ ABSOLUE`,
        `Ces termes sont classés par importance SEO (les premiers sont les plus critiques).`,
        `RÈGLE : utilise **tous ces ${top30.length} termes** dans l'article.`,
        `RÈGLE : chaque H2 du corps doit contenir **au minimum 3 termes** de cette liste.`,
        `RÈGLE : l'introduction doit contenir **au minimum 5 termes** de cette liste.`,
        `Intègre-les naturellement — jamais en liste brute, toujours dans des phrases fluides.`,
        ``,
        top30.map((t, i) => `${i + 1}. **${t}**`).join('  |  '),
      ].join('\n')
    : '';

  return [
    `## ANALYSE SÉMANTIQUE APPROFONDIE (TF-IDF + DataForSEO)`,
    `Ces termes ont été extraits par analyse NLP des pages top SERP et enrichis via DataForSEO.`,
    `Ce bloc est **OBLIGATOIRE** — il détermine la couverture sémantique de l'article.`,
    top30Block,
    ``,
    `### Termes sémantiques principaux (à intégrer dans les sections centrales) :`,
    primaryTerms.join(', ') || '—',
    ``,
    `### Termes secondaires complémentaires :`,
    secondaryTerms.join(', ') || '—',
    ``,
    `### Expressions longue traîne (à utiliser dans les H3, questions FAQ, intro) :`,
    longTailVariants.join(' | ') || '—',
    ``,
    `### Entités sémantiques (marques, outils, concepts — à citer en contexte) :`,
    entities.join(', ') || '—',
    ``,
    `### Co-occurrences fréquentes chez les concurrents :`,
    coOccurrences.join(' / ') || '—',
    ``,
    `### Gaps de contenu identifiés (sous-thèmes souvent manquants — à traiter si pertinent) :`,
    contentGaps.map((g, i) => `${i + 1}. ${g}`).join('\n') || '—',
  ].join('\n');
}

function buildSerpSnippet(serpModel, mainKeyword, wcMin, wcMax) {
  if (!serpModel || serpModel.dominantSubtopics.length === 0) return null;

  const subtopicsText = serpModel.dominantSubtopics.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const serpTarget = Math.round(serpModel.avgWordCount * 1.1);
  const targetMin = wcMin ?? serpTarget;
  const targetMax = wcMax ?? Math.max(serpTarget, targetMin);

  return [
    `## CONTRAINTES SERP OBLIGATOIRES (données réelles Google)`,
    `Ces données proviennent d'une analyse des 10 premiers résultats Google — elles sont PRIORITAIRES.`,
    ``,
    `### Sous-thèmes à couvrir à 100% (chaque point DOIT apparaître dans un H2 ou H3) :`,
    subtopicsText,
    ``,
    `### Entités à intégrer naturellement dans le contenu :`,
    serpModel.recurringEntities.join(', ') || 'aucune',
    ``,
    `### Intention de recherche : ${serpModel.intent}`,
    `### Format dominant des concurrents : ${serpModel.contentFormat}`,
    `### Longueur cible : ${targetMin}–${targetMax} mots pour la section Corps uniquement (MINIMUM ${targetMin} obligatoire — ne pas dépasser ${targetMax})`,
  ].filter((l) => l !== null).join('\n');
}


function buildIntroSnippet(serpModel, mainKeyword) {
  if (!serpModel || !mainKeyword) return null;
  const subtopics = serpModel.dominantSubtopics ?? [];
  const entities  = serpModel.recurringEntities ?? [];
  if (subtopics.length === 0 && entities.length === 0) return null;

  const lines = [
    `## INTRODUCTION — Contraintes obligatoires (200 premiers mots)`,
    `L'introduction DOIT contenir TOUS ces éléments naturellement intégrés :`,
    `- Terme principal : "${mainKeyword}"`,
  ];
  if (subtopics.length > 0) {
    lines.push(`- Groupes SERP (intègre-en au moins 3 sur 5) : ${subtopics.slice(0, 5).map((t) => `"${t}"`).join(', ')}`);
  }
  if (entities.length > 0) {
    lines.push(`- Entités nommées (intègre-en au moins 2) : ${entities.slice(0, 5).join(', ')}`);
  }
  if (serpModel.intent) {
    lines.push(`- Intention détectée : ${serpModel.intent} — l'intro doit répondre directement à cette intention`);
  }
  lines.push(`- Objectif GEO : extractible comme réponse directe par un LLM (structure : constat + contexte + solution + promesse)`);

  return lines.join('\n');
}

function buildDensityTableSnippet(semanticAnalysis, generatedWordsMid, serpAvgWords) {
  const scaledTerms = scaleTermCounts(
    (semanticAnalysis.intentTopTerms || []).filter((t) => t.maxCount > 0).slice(0, 50),
    generatedWordsMid,
    serpAvgWords,
  );
  if (scaledTerms.length === 0) return null;

  const rows = scaledTerms
    .map((t) => `| ${(t.display || t.term).padEnd(26)} | ${String(t.minCount).padStart(3)} | ${String(t.maxCount).padStart(3)} | **~${t.target}** |`)
    .join('\n');

  return `## 🎯 CONTRAINTE DENSITÉ OBLIGATOIRE — Occurrences cibles dans l'article (~${generatedWordsMid} mots au total)
Ce tableau est CONTRAIGNANT. Chaque terme doit apparaître dans l'article autour de la valeur **Cible** (nombre d'occurrences absolues, pas pour 1000 mots).
Les plages sont proportionnelles à la taille de l'article cible et à la densité observée chez les concurrents.
❌ Terme absent = pénalité SEO. ❌ Terme sur-utilisé (> Max) = pénalité sur-optimisation.

| Terme                             | Min | Max | Cible |
|-----------------------------------|-----|-----|-------|
${rows}`;
}

// ── GEO Snippet builders ──────────────────────────────────────────────────────

function buildGeoQuestionsSnippet(geoQuestions) {
  if (!geoQuestions.length) return null;
  return [
    `## STRUCTURE GEO — H2s issus de l'analyse IA`,
    `Ces questions ont été posées aux LLMs (ChatGPT / Gemini / Perplexity) et constituent les axes les plus pertinents pour une réponse extractible.`,
    `RÈGLE : chaque H2 correspondant doit répondre directement à la question de façon factuelle.`,
    `RÈGLE GEO : commence chaque H2 par 1-2 phrases de réponse directe (principe "answer first").`,
    ``,
    ...geoQuestions.slice(0, 8).map((q, i) => `${i + 1}. ${q}`),
  ].join('\n');
}

function buildGeoSourcesSnippet(geoSources) {
  if (!geoSources.length) return null;
  return [
    `## SOURCES IDENTIFIÉES PAR LES LLMs`,
    `Ces sources ont été citées spontanément par les IA lors de l'analyse — utilise-les en priorité pour les liens externes [[EXTERNE:...]].`,
    ``,
    ...geoSources.map(s => {
      const url = s.url ?? null;
      const name = s.name ?? (typeof s === 'string' ? s : '?');
      const type = s.type ? ` (${s.type})` : '';
      return url ? `- ${name}${type} : ${url}` : `- ${name}${type}`;
    }),
  ].join('\n');
}

function buildGeoAnalysisSnippet(geoCommonPoints, geoContentGaps, geoAnalysis) {
  const parts = [];
  if (geoAnalysis) parts.push(`## SYNTHÈSE DE L'ANALYSE IA\n${geoAnalysis}`);
  if (geoCommonPoints.length > 0) {
    parts.push(`## POINTS COMMUNS DES RÉPONSES IA (à reprendre et enrichir)\n` +
      geoCommonPoints.map((p, i) => `${i + 1}. ${p}`).join('\n'));
  }
  if (geoContentGaps.length > 0) {
    parts.push(`## OPPORTUNITÉS GEO (angles non couverts — à traiter si pertinent)\n` +
      geoContentGaps.map((g, i) => `${i + 1}. ${g}`).join('\n'));
  }
  return parts.length > 0 ? parts.join('\n\n') : null;
}

// ── Internal link prioritization ──────────────────────────────────────────────

const BLOG_PATTERNS   = /\/(blog|article|articles|actualite|actualites|news|post|posts|guide|guides|ressource|ressources|dossier|conseil|conseils|tuto|tutoriel|tutorial)\//i;
const SERVICE_PATTERNS = /\/(service|services|solution|solutions|produit|produits|product|products|offre|offres|prestation|prestations|expertise|competence)\//i;
const SKIP_PATTERNS    = /\/(contact|about|qui-sommes-nous|a-propos|mentions-legales|cgv|cgu|politique-de-confidentialite|confidentialite|privacy|legal|sitemap|404|403|login|connexion|inscription|register|panier|cart|checkout|mon-compte|account)\b/i;

/**
 * Sort internal links: blog posts first, service pages second, other pages last.
 * Generic/utility pages (contact, legal, etc.) are deprioritized.
 */
function prioritizeInternalLinks(links) {
  function score(link) {
    const url = link.url ?? '';
    if (SKIP_PATTERNS.test(url))    return 3;
    if (BLOG_PATTERNS.test(url))    return 0;
    if (SERVICE_PATTERNS.test(url)) return 1;
    return 2;
  }
  return [...links].sort((a, b) => score(a) - score(b));
}
