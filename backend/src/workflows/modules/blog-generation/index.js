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
    const {
      mainKeyword,
      serpModel,
      semanticAnalysis,
      internalLinks    = [],
      ratingExamples   = [],
      detectedFields   = null,
      resolvedRefs     = {},
    } = ctx;

    if (!mainKeyword) throw new Error('mainKeyword requis pour BlogGenerationModule');

    // Tone resolution: ctx.tone → siteProfile recommendation → config value → default
    const tone = ctx.tone ?? ctx.siteProfile?.recommendedToneForGeneration ?? config?.tone ?? 'Expert et pédagogique';

    // Collect snippets already pushed by upstream modules
    const promptSnippets = [...(ctx.promptSnippets ?? [])];

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

    // ── 1c. FAQ snippet (from serpModel) ─────────────────────────────
    if (serpModel?.hasFaq || serpModel?.faqQuestions?.length > 0) {
      const faqSnippet = buildFaqSnippet(serpModel);
      if (faqSnippet) promptSnippets.push(faqSnippet);
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
      });

      rawBlog = result.content;

      // Emit the full generation prompt on the first attempt only
      if (attempt === 1 && result.promptDebug) {
        emitEvent(jobId, { type: 'data', key: 'generationPrompt', value: result.promptDebug });
      }

      parsed = parseBlogContent(rawBlog);

      const wordCount = rawBlog.split(/\s+/).filter(Boolean).length;
      emitEvent(jobId, { type: 'step', message: `📝 Article généré : ${wordCount} mots` });

      // Trim if overlong
      if (wordCount > wcMax * 1.05) {
        emitEvent(jobId, { type: 'step', message: `✂️ Article trop long (${wordCount} mots > max ${wcMax}) — compression...` });
        rawBlog = await trimContentToWordCount(rawBlog, wcMin, wcMax, mainKeyword);
        parsed  = parseBlogContent(rawBlog);
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
      try {
        const { faqEmbed, schemas } = await generateFaqAndSchemas({
          mainKeyword,
          bodyContent: parsed.planMece || rawBlog,
          faqQuestions: ctx.faqQuestions ?? [],
          tone: ctx.tone,
        });
        if (faqEmbed) parsed.faqEmbed = faqEmbed;
        if (schemas?.length) parsed.schemas = schemas;
        emitEvent(jobId, { type: 'step', message: `✅ FAQ (${faqEmbed ? 'OK' : 'vide'}) + ${schemas?.length ?? 0} schéma(s) générés` });
      } catch (faqErr) {
        emitEvent(jobId, { type: 'step', message: `⚠️ FAQ/schémas ignorés : ${faqErr.message}` });
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

function buildFaqSnippet(serpModel) {
  if (!serpModel) return null;
  const questions = serpModel.faqQuestions ?? [];

  const lines = [
    `## FAQ — Questions à intégrer`,
    `Les concurrents incluent une FAQ — tu DOIS inclure une section FAQ dans l'article.`,
  ];
  if (questions.length > 0) {
    lines.push(``);
    lines.push(`### Questions FAQ à traiter prioritairement :`);
    questions.forEach((q, i) => lines.push(`${i + 1}. ${q}`));
  }

  return lines.join('\n');
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
