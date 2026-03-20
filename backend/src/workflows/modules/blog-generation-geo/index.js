/**
 * Module: Blog Generation GEO
 *
 * Generates a GEO-optimised blog article designed to be extracted as a direct
 * answer by AI assistants (ChatGPT, Perplexity, Gemini).
 *
 * Structure:
 *  - H1    : the GEO question (geoPrompt)
 *  - H2s   : questions from LLM analysis modules (optional — generated if absent)
 *  - Body  : factual, source-backed content with internal + external links
 *  - FAQ   : thematic FAQ with schema.org JSON-LD
 *  - Schemas : visual schemas (table, comparison, process…)
 *
 * Inputs  (ctx): geoPrompt (required), geoQuestions, geoSources, geoCommonPoints,
 *                geoContentGaps, geoAnalysis, sitemapUrls, siteProfile,
 *                detectedFields, webflowFields, tone
 * Outputs (ctx): blogContent, parsedBlog, htmlBody, htmlBodyFull, fieldData
 */

import { generateGeoBlogContent, generateFaqAndSchemas } from './claude.js';
import { generateTableSchemas } from '../blog-generation/claude.js';
import { parseBlogContent }                              from '../../../utils/blogParser.js';
import { buildBodyHtml, buildFieldData, buildFullHtml }  from '../../../utils/htmlBuilder.js';

export const BlogGenerationGeoModule = {
  async execute(ctx, config = {}, { emitEvent, jobId }) {
    const geoPrompt = ctx.geoPrompt ?? config.geoPrompt ?? null;

    if (!geoPrompt) {
      throw new Error(
        'BlogGenerationGeo : geoPrompt requis — connectez un module "Prompt GEO" ou "Générateur de prompt GEO" en amont.',
      );
    }

    const geoQuestions   = Array.isArray(ctx.geoQuestions)   ? ctx.geoQuestions   : [];
    const geoSources     = Array.isArray(ctx.geoSources)     ? ctx.geoSources     : [];
    const geoCommonPoints = Array.isArray(ctx.geoCommonPoints) ? ctx.geoCommonPoints : [];
    const geoContentGaps = Array.isArray(ctx.geoContentGaps) ? ctx.geoContentGaps : [];
    const geoAnalysis    = ctx.geoAnalysis ?? '';

    const tone           = ctx.tone ?? ctx.siteProfile?.recommendedToneForGeneration ?? config.tone ?? 'Expert, clair et pédagogique';
    const siteProfile    = ctx.siteProfile ?? null;
    const detectedFields = ctx.detectedFields ?? null;
    const webflowFields  = ctx.webflowFields ?? null;
    const resolvedRefs   = ctx.resolvedRefs  ?? {};

    // ── Build internal links from sitemapUrls ────────────────────────────────
    const sitemapUrls = Array.isArray(ctx.sitemapUrls) ? ctx.sitemapUrls : [];
    const internalUrls = sitemapUrls.slice(0, 30).map((url) => {
      // Extract a readable title from the URL slug
      try {
        const slug = new URL(url).pathname.replace(/\/$/, '').split('/').pop() ?? url;
        const title = slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || url;
        return { title, url };
      } catch {
        return { title: url, url };
      }
    });

    // ── Emit context info ────────────────────────────────────────────────────
    emitEvent(jobId, {
      type: 'step',
      message: `✍️ Génération du blog GEO pour : "${geoPrompt.slice(0, 100)}${geoPrompt.length > 100 ? '…' : ''}"`,
    });

    if (geoQuestions.length > 0) {
      emitEvent(jobId, {
        type: 'step',
        message: `📋 ${geoQuestions.length} question(s) IA → structure H2 du blog`,
      });
    } else {
      emitEvent(jobId, {
        type: 'step',
        message: `ℹ️ Aucune question IA en amont — plan H2 généré par Claude`,
      });
    }

    if (internalUrls.length > 0) {
      emitEvent(jobId, {
        type: 'step',
        message: `🔗 ${internalUrls.length} URL(s) internes disponibles pour le maillage`,
      });
    }

    // ── 1. Generate blog content ─────────────────────────────────────────────
    const result = await generateGeoBlogContent({
      geoPrompt,
      geoQuestions,
      geoSources,
      geoCommonPoints,
      geoContentGaps,
      geoAnalysis,
      tone,
      internalUrls,
      siteProfile,
    });

    const rawBlog = result.content;
    emitEvent(jobId, { type: 'data', key: 'generationPrompt', value: result.promptDebug });

    const wordCount = rawBlog.split(/\s+/).filter(Boolean).length;
    emitEvent(jobId, { type: 'step', message: `📝 Article GEO généré : ${wordCount} mots` });

    // ── 2. Parse ─────────────────────────────────────────────────────────────
    let parsed = parseBlogContent(rawBlog);

    // ── 3. FAQ + schemas ─────────────────────────────────────────────────────
    emitEvent(jobId, { type: 'step', message: '❓ Génération FAQ thématique + schémas…' });
    try {
      const { faqEmbed, schemas } = await generateFaqAndSchemas({
        mainKeyword:  geoPrompt,
        bodyContent:  parsed.planMece || rawBlog,
        faqQuestions: geoQuestions.slice(0, 5),
        tone,
      });
      if (faqEmbed)       parsed.faqEmbed = faqEmbed;
      if (schemas?.length) parsed.schemas  = schemas;
      emitEvent(jobId, {
        type: 'step',
        message: `✅ FAQ (${faqEmbed ? 'OK' : 'vide'}) + ${schemas?.length ?? 0} schéma(s) générés`,
      });
    } catch (faqErr) {
      emitEvent(jobId, { type: 'step', message: `⚠️ FAQ/schémas ignorés : ${faqErr.message}` });
    }

    // ── 3b. Generate 2 visual table schemas ───────────────────────────────────
    emitEvent(jobId, { type: 'step', message: '📊 Génération des tableaux visuels...' });
    try {
      const tableSchemas = await generateTableSchemas({
        mainKeyword: geoPrompt,
        bodyContent: parsed.planMece || rawBlog,
        tone,
      });
      if (tableSchemas.length) {
        parsed.schemas = [...(parsed.schemas ?? []), ...tableSchemas];
        emitEvent(jobId, { type: 'step', message: `✅ ${tableSchemas.length} tableau(x) généré(s)` });
      }
    } catch (tableErr) {
      emitEvent(jobId, { type: 'step', message: `⚠️ Tableaux ignorés : ${tableErr.message}` });
    }

    // ── 4. Build HTML ─────────────────────────────────────────────────────────
    const htmlBody     = parsed ? buildBodyHtml(parsed, detectedFields ?? {}) : null;
    const htmlBodyFull = parsed ? buildFullHtml(parsed) : null;

    let fieldData = null;
    if (parsed && webflowFields?.length > 0) {
      fieldData = buildFieldData(
        webflowFields,
        parsed,
        htmlBody,
        ctx.publishStatus === 'draft',
        [],
        ctx.images?.featured ?? null,
        ctx.images?.content  ?? [],
        resolvedRefs,
      );
    }

    if (parsed?.preview) {
      emitEvent(jobId, { type: 'preview', data: parsed.preview });
    }

    return {
      blogContent:  rawBlog,
      parsedBlog:   parsed,
      htmlBody,
      htmlBodyFull,
      fieldData,
    };
  },
};
