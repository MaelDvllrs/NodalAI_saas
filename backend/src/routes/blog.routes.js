import express from 'express';
import { getBestKeywordFromCandidates } from '../services/dataforseo.service.js';
import { suggestKeywordCandidates, getSecondaryKeywords, generateBlogContent, generateOptimizedOutline } from '../services/claude.service.js';
import { fetchSerpResults, buildSerpModel, saveSerpModel, scoreSerpCoverage } from '../services/serp.service.js';
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
import { createBlog, getExistingTitles as getDbExistingTitles } from '../services/blog.service.js';
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
    emitEvent(jobId, { type: 'step', message: '🔍 Analyse SERP Google (top 10 résultats organiques)...' });
    try {
      serpResults = await fetchSerpResults(mainKeyword);
      if (serpResults.length > 0) {
        emitEvent(jobId, { type: 'step', message: `📊 ${serpResults.length} résultats SERP récupérés. Construction du modèle sémantique...` });
        serpModel = await buildSerpModel(mainKeyword, serpResults);
        emitEvent(jobId, {
          type: 'step',
          message: `✅ Modèle SERP construit — ` +
            `intention: ${serpModel.intent}, format: ${serpModel.contentFormat}, ` +
            `${serpModel.dominantSubtopics.length} sous-thèmes, ~${serpModel.avgWordCount} mots cibles`,
        });
        emitEvent(jobId, { type: 'data', key: 'serpModel', value: serpModel });

        // Save snapshot for future drift detection (non-blocking)
        saveSerpModel(mainKeyword, serpModel).catch(() => {});
      } else {
        emitEvent(jobId, { type: 'step', message: '⚠️ SERP indisponible — génération sans modèle concurrent' });
      }
    } catch (serpErr) {
      console.error('[Pipeline] Erreur SERP (non bloquante):', serpErr.message);
      emitEvent(jobId, { type: 'step', message: '⚠️ Analyse SERP ignorée (erreur) — poursuite du pipeline' });
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

    emitEvent(jobId, { type: 'step', message: '✍️ Génération du blog avec Claude (peut prendre 30-60s)...' });
    const rawBlog = await generateBlogContent({
      mainKeyword,
      secondaryKeywords,
      theme,
      tone,
      existingTitles,
      internalUrls,
      kd,
      serpModel: serpModel ?? null,
      optimizedOutline: optimizedOutline || null,
    });
    emitEvent(jobId, { type: 'step', message: '✅ Blog généré avec succès.' });

    // 6. Parse blog content
    const parsed = parseBlogContent(rawBlog);

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
      const featuredImage = await generateImageWithGemini(
        featuredImagePrompt,
        '',
        `blog-main-${(parsed.titleTag || mainKeyword).toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 40)}`
      );
      if (featuredImage) {
        featuredImageUrl = featuredImage.url;
        emitEvent(jobId, { type: 'step', message: `✅ Image principale générée` });
      } else {
        emitEvent(jobId, { type: 'step', message: '⚠️ Image principale ignorée (erreur Gemini)' });
      }

      // Content images — use Claude's art-direction prompts directly
      if (imageMarkers && imageMarkers.length > 0) {
        emitEvent(jobId, { type: 'step', message: `🖼️ Génération de ${Math.min(imageMarkers.length, 4)} images de contenu...` });

        for (let i = 0; i < Math.min(imageMarkers.length, 4); i++) {
          const description = imageMarkers[i].match(/\[\[IMAGE:([^\]]+)\]\]/)[1];
          const slug = `blog-img${i + 1}-${Date.now()}`;

          emitEvent(jobId, { type: 'step', message: `🎨 Image contenu ${i + 1}/${Math.min(imageMarkers.length, 4)}...` });
          console.log(`[Image ${i + 1}] Prompt: ${description.substring(0, 100)}...`);

          const imageData = await generateImageWithGemini(description, '', slug);
          if (imageData) {
            uploadedImages.push({ description, url: imageData.url });
            emitEvent(jobId, { type: 'step', message: `✅ Image ${i + 1} générée` });
          } else {
            emitEvent(jobId, { type: 'step', message: `⚠️ Image ${i + 1} ignorée (erreur Gemini)` });
          }
        }

        if (uploadedImages.length > 0) {
          console.log(`[Image] Injection de ${uploadedImages.length} images dans planMece (${parsed.planMece?.length} chars)`);
          parsed.planMece = injectImageUrls(parsed.planMece, uploadedImages);
          console.log(`[Image] Après injection: ${parsed.planMece?.match(/\[\[IMAGE:https/g)?.length ?? 0} marqueurs avec URL`);
          emitEvent(jobId, { type: 'step', message: `✅ ${uploadedImages.length} images intégrées dans l'article` });
        }
      }
    } catch (imgErr) {
      console.error('Erreur traitement images:', imgErr);
      emitEvent(jobId, { type: 'step', message: '⚠️ Erreur images — article publié sans images' });
    }

    // 7. Build HTML body
    const bodyHtml = buildBodyHtml(parsed);

    // 7.1 SEO Coverage Scoring — compare article vs SERP model
    if (serpModel && serpModel.dominantSubtopics.length > 0) {
      try {
        const plainText = `${parsed.titleTag || ''} ${parsed.h1 || ''} ${parsed.introduction || ''} ${parsed.planMece || ''}`;
        const coverage  = scoreSerpCoverage(plainText, serpModel);
        emitEvent(jobId, {
          type: 'coverage',
          data: coverage,
          message: `🎯 Score SEO SERP : ${coverage.totalScore}/100 — ` +
            `Sujets: ${coverage.topicCoverage}%, Entités: ${coverage.entityCoverage}%, ` +
            `Mots: ${coverage.wordScore}%, FAQ: ${coverage.faqScore}%, Intention: ${coverage.intentScore}%`,
        });
        emitEvent(jobId, { type: 'step', message: `🎯 Score couverture SEO : ${coverage.totalScore}/100` });
      } catch (scoreErr) {
        console.error('[Pipeline] Erreur coverage score (non bloquante):', scoreErr.message);
      }
    }

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
