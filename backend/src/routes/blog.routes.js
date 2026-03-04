import express from 'express';
import { getBestKeywordFromCandidates } from '../services/dataforseo.service.js';
import { suggestKeywordCandidates, getSecondaryKeywords, generateBlogContent, generateOptimizedOutline, getWordCountBounds, trimContentToWordCount, rewriteArticleForSeo, cleanSemanticTerms } from '../services/claude.service.js';
import { fetchSerpResults, saveSerpModel } from '../services/serp.service.js';
import { analyzeSemanticKeywords, scoreArticleVsSerp, scoreTermsInRange } from '../services/semantic.service.js';
import {
  getCollectionByName,
  getCollectionFields,
  getExistingItems,
  createItem,
  publishItem,
} from '../services/webflow.service.js';
import { parseBlogContent } from '../utils/blogParser.js';
import { buildBodyHtml, buildFieldData, detectFields, injectImageUrls } from '../utils/htmlBuilder.js';
import { getSitemapUrls } from '../utils/sitemap.js';
import { optionalAuth } from '../middleware/auth.middleware.js';
import { getOrCreateKeyword, saveSecondaryKeywords, hasSecondaryKeywords, getSecondaryKeywordsForMain } from '../services/keyword.service.js';
import { createBlog, updateBlog, getExistingTitles as getDbExistingTitles, getTopRatedBlogs } from '../services/blog.service.js';
import { getCrawledPages } from '../services/site.service.js';
import { generateImageWithGemini } from '../services/image.service.js';

const router = express.Router();

// In-memory job store: jobId -> { events: [], clients: [], done: false }
const jobs = new Map();

// ── POST /api/generate ──────────────────────────────────────────────────────
router.post('/generate', optionalAuth, async (req, res) => {
  const { siteId, apiKey, collectionName, theme, tone, status, siteUrl, dbSiteId, directKeyword } = req.body;

  if (!siteId || !apiKey || !collectionName || !theme || !tone) {
    return res.status(400).json({ error: 'Champs obligatoires manquants.' });
  }

  const jobId = crypto.randomUUID();
  jobs.set(jobId, { events: [], clients: [], done: false });

  res.json({ jobId });

  // Run pipeline in background (no await)
  runPipeline(jobId, { 
    siteId, // Webflow site ID
    apiKey, 
    collectionName, 
    theme, 
    tone, 
    status, 
    siteUrl,
    dbSiteId, // Database site ID (optional)
    userId: req.user?.id, // User ID if authenticated
    directKeyword: directKeyword || null, // Optional: skip Claude/DataForSEO if provided
  }).catch(
    (err) => emitEvent(jobId, { type: 'error', message: err.message })
  );
});

// ── POST /api/seo-preview ────────────────────────────────────────────────────
// Mode test : exécute seulement keyword + SERP + analyse sémantique.
// Rien n'est écrit en BDD ni dans Webflow.
router.post('/seo-preview', optionalAuth, async (req, res) => {
  const { theme, directKeyword } = req.body;
  if (!theme && !directKeyword) {
    return res.status(400).json({ error: 'theme ou directKeyword requis.' });
  }

  const jobId = crypto.randomUUID();
  jobs.set(jobId, { events: [], clients: [], done: false });
  res.json({ jobId });

  runSeoPreview(jobId, { theme, directKeyword: directKeyword || null }).catch(
    (err) => emitEvent(jobId, { type: 'error', message: err.message })
  );
});

// ── GET /api/stream/:jobId ──────────────────────────────────────────────────
router.get('/stream/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job introuvable.' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send buffered events first
  for (const event of job.events) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  if (job.done) return res.end();

  job.clients.push(res);

  req.on('close', () => {
    job.clients = job.clients.filter((c) => c !== res);
  });
});

// ── Helpers ─────────────────────────────────────────────────────────────────
function emitEvent(jobId, event) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.events.push(event);
  for (const client of job.clients) {
    client.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}

function closeJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.done = true;
  for (const client of job.clients) client.end();
  job.clients = [];
  // Clean up after 5 min
  setTimeout(() => jobs.delete(jobId), 5 * 60 * 1000);
}

// ── SEO Preview (test mode) ───────────────────────────────────────────────────
async function runSeoPreview(jobId, { theme, directKeyword }) {
  try {
    // 1. Keyword
    let mainKeyword, kd, kwSearchVolume;
    if (directKeyword) {
      mainKeyword    = directKeyword;
      kd             = null;
      kwSearchVolume = null;
      emitEvent(jobId, { type: 'step', message: `🔑 Mot-clé direct : "${mainKeyword}"` });
    } else {
      emitEvent(jobId, { type: 'step', message: '🤖 Génération de candidats mots-clés avec Claude...' });
      const candidates = await suggestKeywordCandidates(theme);
      if (candidates.length > 0) {
        emitEvent(jobId, { type: 'step', message: `💡 Candidats : ${candidates.map((c) => `"${c}"`).join(', ')}` });
      }
      emitEvent(jobId, { type: 'step', message: '🔍 Analyse métriques SEO via DataForSEO...' });
      const best = await getBestKeywordFromCandidates(theme, candidates);
      mainKeyword    = best.keyword;
      kd             = best.kd;
      kwSearchVolume = best.search_volume;
    }

    emitEvent(jobId, { type: 'data', key: 'mainKeyword', value: mainKeyword });
    emitEvent(jobId, {
      type: 'step',
      message: `✅ Mot-clé retenu : "${mainKeyword}" (volume: ${kwSearchVolume ?? '?'}, KD: ${kd ?? '?'}/100)`,
    });

    // 2. SERP — récupère les résultats organiques (pas d'appel Claude ici)
    let serpModel   = null;
    let serpResults = [];
    emitEvent(jobId, { type: 'step', message: '🔍 Récupération SERP Google top 10...' });
    try {
      serpResults = await fetchSerpResults(mainKeyword);
      if (serpResults.length === 0) {
        emitEvent(jobId, { type: 'step', message: '⚠️ Aucun résultat SERP récupéré' });
      }
    } catch (serpErr) {
      emitEvent(jobId, { type: 'step', message: `⚠️ SERP erreur (non bloquant): ${serpErr.message}` });
    }

    // 3. Analyse sémantique unifiée (TF-IDF → BM25 boost → embeddings reranking → Claude Haiku)
    //    Inclut : intent, contentFormat, avgWordCount, dominantSubtopics, faqQuestions
    //    → pas besoin d'un modèle SERP séparé
    let semanticAnalysis = null;
    if (serpResults.length > 0) {
      emitEvent(jobId, { type: 'step', message: '🧠 Analyse sémantique + crawl pages + reranking BM25/embeddings...' });
      try {
        semanticAnalysis = await analyzeSemanticKeywords(mainKeyword, serpResults);

        // Nettoyage IA : correction orthographe, suppression doublons/génériques, ~300 termes propres
        if (semanticAnalysis?.intentTopTerms?.length > 0) {
          emitEvent(jobId, { type: 'step', message: `🧹 Nettoyage termes sémantiques via IA (${semanticAnalysis.intentTopTerms.length} bruts → ~300 propres)...` });
          try {
            semanticAnalysis.intentTopTerms = await cleanSemanticTerms(semanticAnalysis.intentTopTerms, mainKeyword);
            semanticAnalysis.tfidfTopTerms  = semanticAnalysis.intentTopTerms;
          } catch (cleanErr) {
            console.warn('[SeoPreview] cleanSemanticTerms ignoré:', cleanErr.message);
          }
        }

        emitEvent(jobId, {
          type: 'step',
          message: `✅ ${semanticAnalysis.pagesAnalyzed} pages analysées — ` +
            `intention: ${semanticAnalysis.intent ?? '?'}, format: ${semanticAnalysis.contentFormat ?? '?'}, ` +
            `${semanticAnalysis.primaryTerms.length} termes principaux, ` +
            `${semanticAnalysis.longTailVariants.length} longues traînes, ` +
            `${semanticAnalysis.contentGaps.length} gaps de contenu`,
        });
        emitEvent(jobId, { type: 'data', key: 'semanticAnalysis', value: semanticAnalysis });

        // Synthétiser serpModel depuis semanticAnalysis (plus riche que les snippets)
        serpModel = {
          keyword:           mainKeyword,
          avgWordCount:      semanticAnalysis.avgWordCount      ?? 1500,
          dominantSubtopics: semanticAnalysis.dominantSubtopics ?? [],
          recurringEntities: semanticAnalysis.entities          ?? [],
          faqQuestions:      semanticAnalysis.faqQuestions      ?? [],
          intent:            semanticAnalysis.intent            ?? 'informationnelle',
          contentFormat:     semanticAnalysis.contentFormat     ?? 'guide',
          hasFaq:            (semanticAnalysis.faqQuestions?.length ?? 0) > 0,
          competitorCount:   serpResults.length,
          createdAt:         new Date().toISOString(),
        };
        emitEvent(jobId, { type: 'data', key: 'serpModel', value: serpModel });
      } catch (semErr) {
        emitEvent(jobId, { type: 'step', message: `⚠️ Analyse sémantique erreur: ${semErr.message}` });
      }
    }

    // Émet un résumé complet pour l'affichage frontend
    // Utilise classifiedSerp (avec pageType) si disponible, sinon serpResults bruts
    const serpForPreview = semanticAnalysis?.classifiedSerp ?? serpResults;
    emitEvent(jobId, {
      type: 'seo-preview',
      data: { mainKeyword, kd, kwSearchVolume, serpResults: serpForPreview, serpModel, semanticAnalysis },
    });

    emitEvent(jobId, { type: 'done', data: { itemId: '', itemName: mainKeyword, collectionId: '' } });
  } catch (err) {
    emitEvent(jobId, { type: 'error', message: err.message });
  } finally {
    closeJob(jobId);
  }
}

// ── Pipeline ─────────────────────────────────────────────────────────────────
async function runPipeline(jobId, params) {
  const { siteId, apiKey, collectionName, theme, tone, status, siteUrl, dbSiteId, userId, directKeyword } = params;

  try {
    // 1. Keyword selection: use directKeyword if provided, otherwise Claude + DataForSEO
    let mainKeyword, kd, kwSearchVolume;

    if (directKeyword) {
      mainKeyword = directKeyword;
      kd = null;
      kwSearchVolume = null;
      emitEvent(jobId, { type: 'step', message: `🔑 Mot-clé direct utilisé : "${mainKeyword}"` });
    } else {
      emitEvent(jobId, { type: 'step', message: '🤖 Génération de candidates mots-clés avec Claude...' });
      const candidates = await suggestKeywordCandidates(theme);
      if (candidates.length > 0) {
        emitEvent(jobId, { type: 'step', message: `💡 Candidats : ${candidates.map(c => `"${c}"`).join(', ')}` });
      }
      emitEvent(jobId, { type: 'step', message: '🔍 Analyse des métriques SEO via DataForSEO...' });
      const best = await getBestKeywordFromCandidates(theme, candidates);
      mainKeyword = best.keyword;
      kd = best.kd;
      kwSearchVolume = best.search_volume;
    }

    // Save keyword to DB (or retrieve from cache)
    let keywordRecord = null;
    let mainKeywordId = null;
    if (userId) {
      const { keyword: dbKeyword, cached } = await getOrCreateKeyword(mainKeyword, {
        search_volume: kwSearchVolume ?? null,
        competition_index: kd,
      });
      keywordRecord = dbKeyword;
      mainKeywordId = dbKeyword.id;
      if (cached) {
        emitEvent(jobId, { type: 'step', message: `💾 Mot-clé trouvé en cache (économie de tokens)` });
      }
    }

    emitEvent(jobId, { type: 'data', key: 'mainKeyword', value: mainKeyword });
    emitEvent(jobId, { type: 'data', key: 'kd', value: kd });
    const kdLabel = kd !== null ? `concurrence ${kd}/100` : (directKeyword ? 'mot-clé direct' : 'concurrence inconnue');
    emitEvent(jobId, { type: 'step', message: `✅ Mot-clé principal retenu : "${mainKeyword}" (volume: ${kwSearchVolume ?? '?'}, ${kdLabel})` });

    // 1.5. SERP Analysis — fetch top-10 organic results + build semantic model
    let serpModel   = null;
    let serpResults = [];
    emitEvent(jobId, { type: 'step', message: '🔍 Récupération SERP Google (top 10 résultats organiques)...' });
    try {
      serpResults = await fetchSerpResults(mainKeyword);
      if (serpResults.length > 0) {
        emitEvent(jobId, { type: 'step', message: `📊 ${serpResults.length} résultats SERP récupérés` });
      } else {
        emitEvent(jobId, { type: 'step', message: '⚠️ SERP indisponible — génération sans modèle concurrent' });
      }
    } catch (serpErr) {
      console.error('[Pipeline] Erreur SERP (non bloquante):', serpErr.message);
      emitEvent(jobId, { type: 'step', message: '⚠️ Récupération SERP ignorée (erreur) — poursuite du pipeline' });
    }

    // 1.6. Analyse sémantique unifiée — TF-IDF + BM25 + embeddings + Claude Haiku
    //      Produit aussi intent, contentFormat, avgWordCount, dominantSubtopics, faqQuestions
    //      → remplace buildSerpModel (plus riche car basé sur les pages crawlées, pas juste les snippets)
    let semanticAnalysis = null;
    if (serpResults.length > 0) {
      emitEvent(jobId, { type: 'step', message: `🧠 Analyse sémantique approfondie — crawl pages top ${Math.min(serpResults.length, 8)} SERP + BM25/embeddings...` });
      try {
        semanticAnalysis = await analyzeSemanticKeywords(mainKeyword, serpResults);

        // Nettoyage IA des termes sémantiques : suppression CSS/garbage, correction accents, ~300 termes
        if (semanticAnalysis?.intentTopTerms?.length > 0) {
          emitEvent(jobId, { type: 'step', message: `🧹 Nettoyage termes sémantiques via IA (${semanticAnalysis.intentTopTerms.length} bruts → ~300 propres)...` });
          try {
            semanticAnalysis.intentTopTerms = await cleanSemanticTerms(semanticAnalysis.intentTopTerms, mainKeyword);
            semanticAnalysis.tfidfTopTerms  = semanticAnalysis.intentTopTerms; // alias en sync
          } catch (cleanErr) {
            console.warn('[Pipeline] cleanSemanticTerms ignoré:', cleanErr.message);
          }
        }

        emitEvent(jobId, {
          type: 'step',
          message:
            `✅ Analyse sémantique terminée — ${semanticAnalysis.pagesAnalyzed} pages, ` +
            `intention: ${semanticAnalysis.intent ?? '?'}, format: ${semanticAnalysis.contentFormat ?? '?'}, ` +
            `${semanticAnalysis.primaryTerms.length} termes principaux, ` +
            `${semanticAnalysis.contentGaps.length} gaps identifiés`,
        });
        emitEvent(jobId, { type: 'data', key: 'semanticAnalysis', value: semanticAnalysis });

        // Synthétiser serpModel depuis semanticAnalysis (plus riche que les snippets)
        serpModel = {
          keyword:           mainKeyword,
          avgWordCount:      semanticAnalysis.avgWordCount      ?? 1500,
          dominantSubtopics: semanticAnalysis.dominantSubtopics ?? [],
          recurringEntities: semanticAnalysis.entities          ?? [],
          faqQuestions:      semanticAnalysis.faqQuestions      ?? [],
          intent:            semanticAnalysis.intent            ?? 'informationnelle',
          contentFormat:     semanticAnalysis.contentFormat     ?? 'guide',
          hasFaq:            (semanticAnalysis.faqQuestions?.length ?? 0) > 0,
          competitorCount:   serpResults.length,
          createdAt:         new Date().toISOString(),
        };
        emitEvent(jobId, { type: 'data', key: 'serpModel', value: serpModel });

        // Save snapshot pour drift detection futur (non-bloquant)
        saveSerpModel(mainKeyword, serpModel).catch(() => {});
      } catch (semErr) {
        console.error('[Pipeline] Erreur analyse sémantique (non bloquante):', semErr.message);
        emitEvent(jobId, { type: 'step', message: '⚠️ Analyse sémantique ignorée (erreur) — poursuite du pipeline' });
      }
    }

    // 2. Secondary keywords via Claude (with DB cache)
    emitEvent(jobId, { type: 'step', message: '🤖 Génération des mots-clés secondaires avec Claude...' });
    let secondaryKeywords = [];
    let secondaryFromCache = false;
    
    if (userId && mainKeywordId && await hasSecondaryKeywords(mainKeywordId)) {
      // Get from cache
      const cachedSecondary = await getSecondaryKeywordsForMain(mainKeywordId);
      secondaryKeywords = cachedSecondary.map(kw => kw.keyword);
      secondaryFromCache = true;
      emitEvent(jobId, { type: 'step', message: `💾 ${secondaryKeywords.length} mots-clés secondaires récupérés depuis le cache (économie de tokens)` });
    } else {
      // Generate new
      secondaryKeywords = await getSecondaryKeywords(mainKeyword, theme);
      
      // Save to DB if user is authenticated
      if (userId && mainKeywordId) {
        await saveSecondaryKeywords(mainKeywordId, secondaryKeywords);
        emitEvent(jobId, { type: 'step', message: `💾 Mots-clés secondaires sauvegardés en cache` });
      }
      emitEvent(jobId, { type: 'step', message: `✅ ${secondaryKeywords.length} mots-clés secondaires générés.` });
    }
    
    emitEvent(jobId, { type: 'data', key: 'secondaryKeywords', value: secondaryKeywords });

    // 3. Webflow collection fields
    emitEvent(jobId, { type: 'step', message: '📋 Récupération des champs de la collection Webflow...' });
    const collection = await getCollectionByName(siteId, apiKey, collectionName);
    if (!collection) throw new Error(`Collection "${collectionName}" introuvable sur ce site.`);
    const fields = await getCollectionFields(collection.id, apiKey);
    const detectedFields = detectFields(fields);
    // Debug: show all fields found in the collection
    emitEvent(jobId, {
      type: 'debug',
      label: 'Champs Webflow détectés',
      fields: detectedFields._allFields,
      mapping: { body: detectedFields.body, metaTitle: detectedFields.metaTitle, metaDescription: detectedFields.metaDescription },
    });
    emitEvent(jobId, { type: 'step', message: `✅ ${fields.length} champs récupérés (collection : "${collection.displayName}"). Body → "${detectedFields.body || 'NON DÉTECTÉ'}"` });

    // 4. Existing articles (avoid duplicates) + internal URLs from sitemap or DB
    emitEvent(jobId, { type: 'step', message: '📰 Récupération des articles existants pour éviter les doublons...' });
    
    // Get existing titles from DB if available, otherwise from Webflow
    let existingTitles = [];
    if (userId && dbSiteId) {
      existingTitles = await getDbExistingTitles(dbSiteId);
      emitEvent(jobId, { type: 'step', message: `💾 ${existingTitles.length} titres récupérés depuis la BDD` });
    } else {
      const existingItems = await getExistingItems(collection.id, apiKey);
      existingTitles = existingItems.map((i) => i.fieldData?.name || '').filter(Boolean);
    }

    let internalUrls = [];
    
    // Try to get crawled pages from DB first
    if (userId && dbSiteId) {
      emitEvent(jobId, { type: 'step', message: '💾 Récupération des URLs internes depuis la BDD...' });
      const crawledPages = await getCrawledPages(dbSiteId, false);
      internalUrls = crawledPages.map(page => ({
        url: page.url,
        title: page.title || '',
      })).filter(p => p.url);
      emitEvent(jobId, { type: 'step', message: `✅ ${internalUrls.length} URLs internes récupérées depuis la BDD.` });
    } else if (siteUrl) {
      // Fallback to sitemap crawl
      emitEvent(jobId, { type: 'step', message: '🗺️ Lecture du sitemap.xml pour récupérer les URLs exactes...' });
      const sitemapUrls = await getSitemapUrls(siteUrl);
      const existingItems = await getExistingItems(collection.id, apiKey);
      
      // Match each existing item slug to its exact sitemap URL
      internalUrls = existingItems
        .map((item) => {
          const slug = item.fieldData?.slug || '';
          const title = item.fieldData?.name || '';
          if (!slug || !title) return null;
          const exactUrl = sitemapUrls.find(
            (u) => u.endsWith(`/${slug}`) || u.endsWith(`/${slug}/`)
          );
          return exactUrl ? { url: exactUrl, title } : null;
        })
        .filter(Boolean);
      emitEvent(jobId, { type: 'step', message: `✅ ${internalUrls.length} URLs internes trouvées dans le sitemap.` });
    }

    emitEvent(jobId, { type: 'step', message: `✅ ${existingTitles.length} articles existants analysés.` });

    // 4.5. Resolve Reference / MultiReference fields
    const resolvedRefs = {};
    const refFieldsToResolve = [
      ...(detectedFields.referenceFields || []),
      ...(detectedFields.multiReferenceFields || []),
    ];

    if (refFieldsToResolve.length > 0) {
      emitEvent(jobId, { type: 'step', message: `🔗 Résolution de ${refFieldsToResolve.length} champ(s) référence Webflow...` });

      for (const refField of (detectedFields.referenceFields || [])) {
        try {
          const refItems = await getExistingItems(refField.collectionId, apiKey);
          const match = findRefMatch(refItems, mainKeyword, theme);
          if (match) {
            resolvedRefs[refField.slug] = match.id;
            emitEvent(jobId, { type: 'step', message: `✅ Référence "${refField.slug}" → "${match.fieldData?.name || match.id}"` });
          } else {
            emitEvent(jobId, { type: 'step', message: `⚠️ Aucune correspondance trouvée pour le champ référence "${refField.slug}" (champ ignoré)` });
          }
        } catch (refErr) {
          emitEvent(jobId, { type: 'step', message: `⚠️ Erreur résolution référence "${refField.slug}": ${refErr.message}` });
        }
      }

      for (const refField of (detectedFields.multiReferenceFields || [])) {
        try {
          const refItems = await getExistingItems(refField.collectionId, apiKey);
          const matches = findMultiRefMatches(refItems, secondaryKeywords);
          if (matches.length > 0) {
            resolvedRefs[refField.slug] = matches.map(m => m.id);
            emitEvent(jobId, { type: 'step', message: `✅ Multi-référence "${refField.slug}" → ${matches.length} correspondance(s) : ${matches.map(m => m.fieldData?.name).join(', ')}` });
          } else {
            emitEvent(jobId, { type: 'step', message: `⚠️ Aucune correspondance pour le champ multi-référence "${refField.slug}" (champ ignoré)` });
          }
        } catch (refErr) {
          emitEvent(jobId, { type: 'step', message: `⚠️ Erreur résolution multi-référence "${refField.slug}": ${refErr.message}` });
        }
      }
    }

    // 5. Generate optimised outline (Step 3) then full blog with Claude
    let optimizedOutline = '';
    if (serpModel && serpModel.dominantSubtopics.length > 0) {
      emitEvent(jobId, { type: 'step', message: '📌 Génération du plan optimisé SERP avec Claude...' });
      try {
        optimizedOutline = await generateOptimizedOutline(mainKeyword, serpModel, theme, tone);
        if (optimizedOutline) {
          emitEvent(jobId, { type: 'step', message: `✅ Plan optimisé généré (${optimizedOutline.split('\n').length} lignes)` });
        }
      } catch (outlineErr) {
        console.error('[Pipeline] Erreur outline (non bloquante):', outlineErr.message);
      }
    }

    // ── Génération avec retry si Claude retourne un champ commençant par "Description" ──
    const MAX_GEN_ATTEMPTS = 3;
    let rawBlog = '';
    let parsed  = null;

    // Récupère les blogs les mieux notés pour guider la génération
    let ratingExamples = [];
    if (dbSiteId) {
      try {
        ratingExamples = await getTopRatedBlogs(dbSiteId, 3);
        if (ratingExamples.length > 0) {
          emitEvent(jobId, { type: 'step', message: `⭐ ${ratingExamples.length} article(s) bien noté(s) utilisé(s) comme référence de qualité.` });
        }
      } catch (e) {
        // non-bloquant
      }
    }

    for (let attempt = 1; attempt <= MAX_GEN_ATTEMPTS; attempt++) {
      if (attempt === 1) {
        emitEvent(jobId, { type: 'step', message: '✍️ Génération du blog avec Claude (peut prendre 30-60s)...' });
      } else {
        emitEvent(jobId, { type: 'step', message: `🔄 Tentative ${attempt}/${MAX_GEN_ATTEMPTS} — régénération (contenu invalide détecté)...` });
      }

      rawBlog = await generateBlogContent({
        mainKeyword,
        secondaryKeywords,
        theme,
        tone,
        existingTitles,
        internalUrls,
        kd,
        serpModel: serpModel ?? null,
        optimizedOutline: optimizedOutline || null,
        semanticAnalysis: semanticAnalysis ?? null,
        ratingExamples,
      });

      parsed = parseBlogContent(rawBlog);

      // Détecte si un champ clé commence par "Description" (hallucination Claude)
      const startsWithDescription = (str) =>
        typeof str === 'string' && /^description[\s\S]/i.test(str.trim());

      const badField =
        startsWithDescription(parsed.titleTag)       ? 'titleTag' :
        startsWithDescription(parsed.metaDescription) ? 'metaDescription' :
        startsWithDescription(parsed.introduction)    ? 'introduction' :
        startsWithDescription(parsed.planMece)        ? 'corps de l\'article' :
        null;

      if (!badField) {
        emitEvent(jobId, { type: 'step', message: `✅ Blog généré avec succès${attempt > 1 ? ` (tentative ${attempt})` : ''}.` });
        break;
      }

      console.warn(`[Pipeline] Tentative ${attempt}: champ "${badField}" commence par "Description" — régénération`);
      emitEvent(jobId, {
        type: 'step',
        message: `⚠️ Contenu invalide (${badField} commence par "Description") — régénération...`,
      });

      if (attempt === MAX_GEN_ATTEMPTS) {
        emitEvent(jobId, { type: 'step', message: `⚠️ Toutes les tentatives ont retourné un contenu invalide — poursuite avec le dernier résultat.` });
      }
    }

    // 6. Parse blog content (already done in loop above)

    // ── Blockquote fallback: inject quotes if Claude forgot them ─────────────
    if (parsed.planMece && !parsed.planMece.includes('[[QUOTE:')) {
      console.log('[Pipeline] ⚠️ Aucun [[QUOTE:...]] détecté — injection de 2 citations de secours');
      emitEvent(jobId, { type: 'step', message: '💬 Aucune citation détectée — injection automatique de blockquotes...' });

      const fallbackQuotes = [
        `[[QUOTE:Maîtriser ${mainKeyword} représente aujourd'hui un avantage décisif : ceux qui investissent dans cette expertise obtiennent des résultats mesurables là où les autres stagnent.]]`,
        `[[QUOTE:Dans ce domaine, la réussite passe par une approche structurée et régulièrement mise à jour — l'information seule ne suffit pas, c'est la méthode qui fait la différence.]]`,
      ];

      let body = parsed.planMece;

      // Insert first quote after the end of the first paragraph following the first H2
      const firstH2Idx = body.search(/^## /m);
      if (firstH2Idx !== -1) {
        const afterFirst = body.indexOf('\n\n', firstH2Idx + 1);
        const secondBreak = afterFirst !== -1 ? body.indexOf('\n\n', afterFirst + 2) : -1;
        const insertPos1 = secondBreak !== -1 ? secondBreak + 2 : (afterFirst !== -1 ? afterFirst + 2 : body.length / 3);
        body = body.substring(0, insertPos1) + fallbackQuotes[0] + '\n\n' + body.substring(insertPos1);
      } else {
        body = fallbackQuotes[0] + '\n\n' + body;
      }

      // Insert second quote before the last H2 section
      const allH2 = [...body.matchAll(/^## .+$/gm)];
      if (allH2.length >= 2) {
        const lastH2Pos = allH2[allH2.length - 1].index;
        body = body.substring(0, lastH2Pos) + fallbackQuotes[1] + '\n\n' + body.substring(lastH2Pos);
      } else {
        body = body + '\n\n' + fallbackQuotes[1];
      }

      parsed.planMece = body;
    }

    // ── Word count enforcement ────────────────────────────────────────────────
    if (parsed.planMece) {
      const wc = (str) => (str || '').trim().split(/\s+/).filter(Boolean).length;
      const wcTitle       = wc(parsed.titleTag);
      const wcH1          = wc(parsed.h1);
      const wcMeta        = wc(parsed.metaDescription);
      const wcIntro       = wc(parsed.introduction);
      const wcBody        = wc(parsed.planMece);
      const wcTotal       = wcTitle + wcH1 + wcMeta + wcIntro + wcBody;

      const { min: wcMin, max: wcMax } = getWordCountBounds(kd);
      // Body is ~75-80% of total; derive a total threshold from body bounds
      const totalEstMin = Math.round(wcMin * 1.25);
      const totalEstMax = Math.round(wcMax * 1.25);

      emitEvent(jobId, {
        type: 'debug',
        label: 'Comptage mots (total)',
        wcTotal,
        wcBody,
        wcIntro,
        wcTitle,
        wcH1,
        wcMeta,
        bodyBounds: `${wcMin}–${wcMax}`,
        totalEstimate: `~${totalEstMin}–${totalEstMax}`,
        status: wcBody > wcMax
          ? `⚠️ Corps trop long (+${wcBody - wcMax} mots)`
          : wcBody < wcMin
          ? `⚠️ Corps trop court (-${wcMin - wcBody} mots)`
          : '✅ Corps dans la tranche',
      });

      if (wcBody > wcMax * 1.05) {
        emitEvent(jobId, { type: 'step', message: `✂️ Corps trop long (${wcBody} mots, max ${wcMax}) — raccourcissement en cours...` });
        try {
          const trimmed = await trimContentToWordCount(parsed.planMece, wcMin, wcMax, mainKeyword);
          const newCount = wc(trimmed);
          emitEvent(jobId, { type: 'step', message: `✅ Corps raccourci : ${wcBody} → ${newCount} mots (cible ${wcMin}–${wcMax}).` });
          parsed.planMece = trimmed;
        } catch (trimErr) {
          console.error('[Pipeline] Erreur trim word count:', trimErr.message);
          emitEvent(jobId, { type: 'debug', label: 'Trim erreur', error: trimErr.message });
        }
      }
    }

    // 6.2. Vérification densité termes-clés immédiatement après génération/raccourcissement
    //      Si < 50% des top-30 termes sont dans leur plage, on réécrit maintenant (avant le score SEO)
    //      pour éviter de faire deux passes qui se contredisent.
    if (semanticAnalysis?.intentTopTerms?.length > 0) {
      try {
        const textPost = [parsed.titleTag, parsed.h1, parsed.metaDescription, parsed.introduction, parsed.planMece, parsed.faqEmbed].filter(Boolean).join(' ');
        const densityCheck0 = scoreTermsInRange(textPost, semanticAnalysis.intentTopTerms.slice(0, 30));
        emitEvent(jobId, {
          type: 'debug',
          label: 'Densité post-génération',
          inRange: densityCheck0.inRange,
          total: densityCheck0.total,
          pct: densityCheck0.pct,
        });
        if (densityCheck0.total > 0 && densityCheck0.pct < 50) {
          emitEvent(jobId, {
            type: 'step',
            message: `⚠️ Densité insuffisante après génération : ${densityCheck0.inRange}/${densityCheck0.total} dans la plage (${densityCheck0.pct}%) — renforcement initial...`,
          });
          try {
            const { min: wMin0, max: wMax0 } = getWordCountBounds(kd);
            const rw0 = await rewriteArticleForSeo({
              body:             parsed.planMece,
              introduction:     parsed.introduction,
              mainKeyword,
              tone,
              serpModel,
              semanticAnalysis,
              coverageData:     null,
              wcMin:            wMin0,
              wcMax:            wMax0,
              forceTermDensity: true,
              termRangeDetails: densityCheck0.details.filter((d) => !d.inRange).slice(0, 20),
            });
            parsed.planMece     = rw0.body;
            parsed.introduction = rw0.introduction;
            // Re-trim si le renforcement a allongé l'article
            const wcAfter0 = parsed.planMece.trim().split(/\s+/).length;
            if (wcAfter0 > wMax0 * 1.05) {
              try { parsed.planMece = await trimContentToWordCount(parsed.planMece, wMin0, wMax0, mainKeyword); } catch { /* non bloquant */ }
            }
            const check0b = scoreTermsInRange(
              [parsed.titleTag, parsed.h1, parsed.introduction, parsed.planMece, parsed.faqEmbed].filter(Boolean).join(' '),
              semanticAnalysis.intentTopTerms.slice(0, 30)
            );
            emitEvent(jobId, { type: 'step', message: `✅ Renforcement initial terminé — ${check0b.inRange}/${check0b.total} termes dans la plage (${check0b.pct}%)` });
          } catch (e0) {
            console.error('[Pipeline] Erreur renforcement densité initial:', e0.message);
          }
        }
      } catch (e) {
        console.error('[Pipeline] Erreur densityCheck0 (non bloquante):', e.message);
      }
    }

    // 6.3. Pre-image SEO Coverage Scoring — check quality before spending Gemini credits
    let coverageData = null;
    const SEO_REWRITE_THRESHOLD = 65;

    if (serpModel && serpModel.dominantSubtopics.length > 0) {
      try {
        const plainText = `${parsed.titleTag || ''} ${parsed.h1 || ''} ${parsed.introduction || ''} ${parsed.planMece || ''}`;
        coverageData = await scoreArticleVsSerp(plainText, semanticAnalysis?.pageTexts ?? [], serpModel);

        emitEvent(jobId, {
          type: 'debug',
          label: 'Score SEO pré-images',
          totalScore: coverageData.totalScore,
          topicCoverage: coverageData.topicCoverage,
          entityCoverage: coverageData.entityCoverage,
          wordScore: coverageData.wordScore,
        });

        if (coverageData.totalScore < SEO_REWRITE_THRESHOLD) {
          emitEvent(jobId, {
            type: 'step',
            message: `⚠️ Score SEO insuffisant : ${coverageData.totalScore}/100 (seuil ${SEO_REWRITE_THRESHOLD}) — réécriture optimisée en cours...`,
          });

          try {
            const { min: wcMin, max: wcMax } = getWordCountBounds(kd);
            const rewritten = await rewriteArticleForSeo({
              body:              parsed.planMece,
              introduction:      parsed.introduction,
              mainKeyword,
              tone,
              serpModel,
              semanticAnalysis,
              coverageData,
              wcMin,
              wcMax,
            });

            parsed.planMece     = rewritten.body;
            parsed.introduction = rewritten.introduction;

            // Re-check blockquotes after rewrite
            if (!parsed.planMece.includes('[[QUOTE:')) {
              const fbq = `[[QUOTE:Maîtriser ${mainKeyword} représente aujourd'hui un avantage décisif : ceux qui investissent dans cette expertise obtiennent des résultats mesurables là où les autres stagnent.]]`;
              const allH2r = [...parsed.planMece.matchAll(/^## .+$/gm)];
              if (allH2r.length >= 2) {
                const lastPos = allH2r[allH2r.length - 1].index;
                parsed.planMece = parsed.planMece.substring(0, lastPos) + fbq + '\n\n' + parsed.planMece.substring(lastPos);
              } else {
                parsed.planMece = parsed.planMece + '\n\n' + fbq;
              }
            }

            // Re-score after rewrite
            const plainText2   = `${parsed.titleTag || ''} ${parsed.h1 || ''} ${parsed.introduction || ''} ${parsed.planMece || ''}`;
            const newCoverage  = await scoreArticleVsSerp(plainText2, semanticAnalysis?.pageTexts ?? [], serpModel);
            coverageData       = newCoverage;

            emitEvent(jobId, {
              type: 'step',
              message: `✅ Réécriture SEO terminée — nouveau score : ${newCoverage.totalScore}/100 (${newCoverage.totalScore >= SEO_REWRITE_THRESHOLD ? '✅ seuil atteint' : '⚠️ encore en dessous du seuil'})`,
            });
          } catch (rewriteErr) {
            console.error('[Pipeline] Erreur rewriteArticleForSeo:', rewriteErr.message);
            emitEvent(jobId, { type: 'step', message: '⚠️ Réécriture SEO ignorée (erreur) — poursuite avec contenu original' });
          }
        } else {
          emitEvent(jobId, { type: 'step', message: `✅ Score SEO : ${coverageData.totalScore}/100 — qualité suffisante, pas de réécriture nécessaire` });
        }

        emitEvent(jobId, {
          type: 'coverage',
          data: coverageData,
          message: `🎯 Score SEO SERP : ${coverageData.totalScore}/100 — ` +
            `Sujets: ${coverageData.topicCoverage}%, Entités: ${coverageData.entityCoverage}%, ` +
            `Mots: ${coverageData.wordScore}%, FAQ: ${coverageData.faqScore}%, Intention: ${coverageData.intentScore}%`,
        });
      } catch (scoreErr) {
        console.error('[Pipeline] Erreur coverage score (non bloquante):', scoreErr.message);
      }
    }

    // 6.4. Vérification densité termes-clés — après raccourcissement ET réécriture SEO
    //      Au moins 50% des top 30 termes doivent être dans leur plage de fréquence cible.
    //      Insensible aux accents (référencement == referencement).
    const TERM_RANGE_THRESHOLD = 50;
    if (semanticAnalysis?.intentTopTerms?.length > 0) {
      try {
        const plainText3 = [parsed.titleTag, parsed.h1, parsed.metaDescription, parsed.introduction, parsed.planMece, parsed.faqEmbed]
          .filter(Boolean).join(' ');
        const termRangeResult = scoreTermsInRange(plainText3, semanticAnalysis.intentTopTerms.slice(0, 30));

        emitEvent(jobId, {
          type: 'debug',
          label: 'Densité termes-clés',
          inRange: termRangeResult.inRange,
          total: termRangeResult.total,
          pct: termRangeResult.pct,
        });

        if (termRangeResult.pct < TERM_RANGE_THRESHOLD) {
          emitEvent(jobId, {
            type: 'step',
            message: `⚠️ Densité termes-clés insuffisante : ${termRangeResult.inRange}/${termRangeResult.total} dans la plage (${termRangeResult.pct}%) — renforcement en cours...`,
          });
          try {
            const { min: wcMin2, max: wcMax2 } = getWordCountBounds(kd);
            const rewritten2 = await rewriteArticleForSeo({
              body:             parsed.planMece,
              introduction:     parsed.introduction,
              mainKeyword,
              tone,
              serpModel,
              semanticAnalysis,
              coverageData,
              wcMin:            wcMin2,
              wcMax:            wcMax2,
              forceTermDensity: true,
              termRangeDetails: termRangeResult.details.filter((d) => !d.inRange).slice(0, 20),
            });
            parsed.planMece     = rewritten2.body;
            parsed.introduction = rewritten2.introduction;

            // Re-trim si le renforcement a allongé l’article
            const wcAfter = parsed.planMece.trim().split(/\s+/).length;
            if (wcAfter > wcMax2 * 1.05) {
              try {
                parsed.planMece = await trimContentToWordCount(parsed.planMece, wcMin2, wcMax2, mainKeyword);
              } catch { /* non bloquant */ }
            }

            if (!parsed.planMece.includes('[[QUOTE:')) {
              parsed.planMece += `\n\n[[QUOTE:Maîtriser ${mainKeyword} représente aujourd'hui un avantage décisif pour qui veut se démarquer dans son domaine.]]`;
            }

            const termRangeResult2 = scoreTermsInRange(
              [parsed.titleTag, parsed.h1, parsed.metaDescription, parsed.introduction, parsed.planMece, parsed.faqEmbed].filter(Boolean).join(' '),
              semanticAnalysis.intentTopTerms.slice(0, 30)
            );
            emitEvent(jobId, {
              type: 'step',
              message: `✅ Renforcement densité terminé — ${termRangeResult2.inRange}/${termRangeResult2.total} termes dans la plage (${termRangeResult2.pct}%)`,
            });
          } catch (densityErr) {
            console.error('[Pipeline] Erreur renforcement densité:', densityErr.message);
            emitEvent(jobId, { type: 'step', message: '⚠️ Renforcement densité ignoré (erreur) — poursuite' });
          }
        } else {
          emitEvent(jobId, { type: 'step', message: `✅ Densité termes-clés : ${termRangeResult.inRange}/${termRangeResult.total} dans la plage (${termRangeResult.pct}%) — OK` });
        }
      } catch (rangeErr) {
        console.error('[Pipeline] Erreur scoreTermsInRange (non bloquante):', rangeErr.message);
      }
    }

    // Debug: show first 300 chars of raw output + parsed sections status
    emitEvent(jobId, {
      type: 'debug',
      label: 'Parsing Claude',
      rawPreview: rawBlog.substring(0, 300),
      parsedSections: {
        titleTag:        parsed.titleTag        ? `✅ "${parsed.titleTag.substring(0, 60)}"` : '❌ vide',
        h1:              parsed.h1              ? `✅ "${parsed.h1.substring(0, 60)}"` : '❌ vide',
        metaDescription: parsed.metaDescription ? `✅ (${parsed.metaDescription.length} car.)` : '❌ vide',
        introduction:    parsed.introduction    ? `✅ (${parsed.introduction.length} car.)` : '❌ vide',
        contenuArticle:  parsed.planMece        ? `✅ (${parsed.planMece.length} car.)` : '❌ vide',
        faqEmbed:        parsed.faqEmbed        ? `✅ (${parsed.faqEmbed.length} car.)` : '❌ vide',
        schemas:         `${parsed.schemas.length} schéma(s)`,
      },
    });

    emitEvent(jobId, { type: 'preview', data: { titleTag: parsed.titleTag, h1: parsed.h1, metaDescription: parsed.metaDescription } });

    // Emit embed blocks (FAQ + schemas) for manual copy-paste in Webflow
    // Webflow API doesn't support HTML embeds inside rich text fields
    if (parsed.faqEmbed || parsed.schemas.length > 0) {
      emitEvent(jobId, {
        type: 'embeds',
        data: {
          faqEmbed: parsed.faqEmbed || null,
          schemas: parsed.schemas,
        },
      });
    }

    // 6.5. Process images
    let featuredImageUrl = null;
    let uploadedImages = [];

    // ── Extract [[FEATURED_IMAGE:...]] prompt written by Claude (from raw output)
    let featuredImagePrompt = null;
    const featuredMatch = rawBlog.match(/\[\[FEATURED_IMAGE:([^\]]+)\]\]/);
    if (featuredMatch) {
      featuredImagePrompt = featuredMatch[1].trim();
      console.log(`[Image] Prompt image principale (Claude): ${featuredImagePrompt.substring(0, 120)}...`);
    } else {
      // Fallback: build a basic prompt from keyword + title
      featuredImagePrompt = `Professional blog header photograph about "${mainKeyword}". Topic: ${parsed.titleTag || parsed.h1}. Modern clean composition, soft professional lighting, 16:9 format, no text, no watermark.`;
      console.log(`[Image] Aucun [[FEATURED_IMAGE]] trouvé — utilisation du prompt de secours`);
    }

    // ── Extract [[IMAGE:...]] markers from article content
    const imageMarkers = parsed.planMece ? parsed.planMece.match(/\[\[IMAGE:([^\]]+)\]\]/g) : [];

    try {
      // Featured image
      emitEvent(jobId, { type: 'step', message: '📸 Génération de l\'image principale (prompt Claude)...' });
      emitEvent(jobId, { type: 'step', message: `🔎 Prompt image principale : "${featuredImagePrompt.substring(0, 120)}${featuredImagePrompt.length > 120 ? '…' : ''}"` });
      const featuredImage = await generateImageWithGemini(
        featuredImagePrompt,
        '',
        `blog-main-${(parsed.titleTag || mainKeyword).toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 40)}`
      );
      if (featuredImage) {
        featuredImageUrl = featuredImage.url;
        emitEvent(jobId, { type: 'step', message: `✅ Image principale générée → ${featuredImageUrl}` });
      } else {
        emitEvent(jobId, { type: 'step', message: '⚠️ Image principale ignorée (erreur Gemini)' });
      }

      // Content images — use Claude's art-direction prompts directly
      const totalContentImages = imageMarkers ? Math.min(imageMarkers.length, 4) : 0;
      emitEvent(jobId, { type: 'step', message: `🔍 Marqueurs [[IMAGE]] détectés dans le rich text : ${imageMarkers?.length ?? 0} (max 4 traités)` });

      if (imageMarkers && imageMarkers.length > 0) {
        emitEvent(jobId, { type: 'step', message: `🖼️ Génération de ${totalContentImages} image(s) de contenu rich text...` });

        for (let i = 0; i < totalContentImages; i++) {
          const description = imageMarkers[i].match(/\[\[IMAGE:([^\]]+)\]\]/)[1];
          const slug = `blog-img${i + 1}-${Date.now()}`;

          emitEvent(jobId, { type: 'step', message: `🎨 [Image ${i + 1}/${totalContentImages}] Prompt : "${description.substring(0, 100)}${description.length > 100 ? '…' : ''}"` });
          console.log(`[Image ${i + 1}] Prompt complet: ${description}`);

          const imageData = await generateImageWithGemini(description, '', slug);
          if (imageData) {
            uploadedImages.push({ description, url: imageData.url });
            emitEvent(jobId, { type: 'step', message: `✅ [Image ${i + 1}/${totalContentImages}] Générée et uploadée → ${imageData.url}` });
          } else {
            emitEvent(jobId, { type: 'step', message: `⚠️ [Image ${i + 1}/${totalContentImages}] Échec Gemini — ignorée` });
          }
        }

        if (uploadedImages.length > 0) {
          const beforeCount = (parsed.planMece?.match(/\[\[IMAGE:/g) || []).length;
          parsed.planMece = injectImageUrls(parsed.planMece, uploadedImages);
          const afterCount = (parsed.planMece?.match(/\[\[IMAGE:https/g) || []).length;
          emitEvent(jobId, {
            type: 'step',
            message: `🔗 Injection rich text : ${afterCount}/${beforeCount} marqueurs [[IMAGE]] remplacés par URL`,
          });
          if (afterCount < uploadedImages.length) {
            emitEvent(jobId, { type: 'step', message: `⚠️ ${uploadedImages.length - afterCount} image(s) non injectée(s) — vérifier correspondance description/marqueur` });
          }
          emitEvent(jobId, {
            type: 'images',
            data: {
              featured: featuredImageUrl,
              content: uploadedImages.map((img, idx) => ({ index: idx + 1, url: img.url, prompt: img.description.substring(0, 80) })),
            },
          });
          emitEvent(jobId, { type: 'step', message: `✅ ${uploadedImages.length} image(s) de contenu intégrées dans le rich text` });
        }
      }
    } catch (imgErr) {
      console.error('Erreur traitement images:', imgErr);
      emitEvent(jobId, { type: 'step', message: '⚠️ Erreur images — article publié sans images' });
    }

    // 7. Build HTML body
    const bodyHtml = buildBodyHtml(parsed);

    // (Coverage already computed and emitted in 6.3 — skip duplicate scoring)

    // Debug: show first 800 chars of generated body HTML to diagnose rendering issues
    emitEvent(jobId, {
      type: 'debug',
      label: 'Body HTML généré',
      totalLength: bodyHtml.length,
      preview: bodyHtml.substring(0, 800),
    });

    // 8. Build field data for Webflow (pass secondaryKeywords, images)
    const fieldData = buildFieldData(fields, parsed, bodyHtml, status === 'draft', secondaryKeywords, featuredImageUrl, uploadedImages, resolvedRefs);

    // Debug: show exactly what will be sent to Webflow
    emitEvent(jobId, {
      type: 'debug',
      label: 'Payload Webflow',
      fieldDataKeys: Object.keys(fieldData),
      name: fieldData.name,
      slug: fieldData.slug,
      bodyLength: fieldData[detectedFields.body]?.length || 0,
      bodyHtmlPreview: bodyHtml.substring(0, 3000),
    });

    // 9. Create item in Webflow
    emitEvent(jobId, { type: 'step', message: '🚀 Publication de l\'article dans Webflow...' });
    const createdItem = await createItem(collection.id, apiKey, fieldData, status === 'draft');

    // 10. Publish if needed
    if (status === 'publish') {
      await publishItem(collection.id, apiKey, createdItem.id);
      emitEvent(jobId, { type: 'step', message: '✅ Article publié en live sur Webflow.' });
    } else {
      emitEvent(jobId, { type: 'step', message: '✅ Article sauvegardé en brouillon dans Webflow.' });
    }

    // 11. Save blog to database (if user is authenticated)
    let savedBlog = null;
    if (userId && dbSiteId) {
      emitEvent(jobId, { type: 'step', message: '💾 Sauvegarde du blog dans la base de données...' });
      try {
        savedBlog = await createBlog({
          siteId: dbSiteId,
          userId: userId,
          title: parsed.titleTag || parsed.h1,
          slug: fieldData.slug,
          h1: parsed.h1,
          titleTag: parsed.titleTag,
          metaDescription: parsed.metaDescription,
          introduction: parsed.introduction,
          body: bodyHtml,
          mainKeywordId: mainKeywordId,
          secondaryKeywords: secondaryKeywords,
          webflowItemId: createdItem.id,
          webflowCollectionId: collection.id,
          status: status === 'publish' ? 'published' : 'draft',
          theme: theme,
          tone: tone,
          rawContent: rawBlog,
        });
        // Save SEO analysis data (separate update — requires seo_analysis JSONB column)
        if (savedBlog && (coverageData || semanticAnalysis)) {
          updateBlog(savedBlog.id, userId, {
            seo_analysis: {
              coverage:    coverageData,
              semantic:    semanticAnalysis,
              // Utilise les résultats classifiés (avec pageType) si disponibles
              serpResults: semanticAnalysis?.classifiedSerp ?? serpResults.slice(0, 20),
              serpModel:   serpModel || null,
            },
          }).catch((e) => console.warn('[Pipeline] seo_analysis non sauvegardé (colonne manquante ?):', e.message));
        }
        emitEvent(jobId, { type: 'step', message: '✅ Blog sauvegardé dans la base de données.' });
      } catch (dbError) {
        console.error('Erreur sauvegarde BDD:', dbError);
        emitEvent(jobId, { type: 'step', message: '⚠️ Erreur lors de la sauvegarde en BDD (article créé dans Webflow)' });
      }
    }

    emitEvent(jobId, {
      type: 'done',
      data: {
        itemId: createdItem.id,
        itemName: createdItem.fieldData?.name || parsed.h1,
        collectionId: collection.id,
        dbBlogId: savedBlog?.id || null,
      },
    });
  } catch (err) {
    emitEvent(jobId, { type: 'error', message: err.message });
  } finally {
    closeJob(jobId);
  }
}

// ── Reference resolution helpers ─────────────────────────────────────────────

/**
 * Trouve l'item le plus proche dans une collection référencée (champ Reference).
 * Essaie de matcher le mot-clé principal ou le thème contre le nom des items.
 * @param {Array} items - Items de la collection référencée
 * @param {string} keyword - Mot-clé principal
 * @param {string} theme - Thème de l'article
 * @returns {object|null} Item correspondant ou null
 */
function findRefMatch(items, keyword, theme) {
  const targets = [keyword, theme].filter(Boolean).map(s => s.toLowerCase());
  return (
    items.find(item => {
      const name = (item.fieldData?.name || '').toLowerCase();
      return targets.some(t => name === t || name.includes(t) || t.includes(name));
    }) ?? null
  );
}

/**
 * Trouve tous les items correspondant aux mots-clés secondaires (champ MultiReference).
 * @param {Array} items - Items de la collection référencée
 * @param {string[]} keywords - Mots-clés secondaires
 * @returns {Array} Items correspondants
 */
function findMultiRefMatches(items, keywords) {
  return items.filter(item => {
    const name = (item.fieldData?.name || '').toLowerCase();
    return keywords.some(kw => {
      const k = kw.toLowerCase();
      return name === k || name.includes(k) || k.includes(name);
    });
  });
}

export default router;
