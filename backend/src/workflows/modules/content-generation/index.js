/**
 * Module: Content Generation
 *
 * Generates a full SEO-optimised article using Claude Sonnet.
 * Reads competitor intelligence from the context and writes the
 * raw blog content + parsed HTML back to ctx.
 *
 * Inputs  (ctx): mainKeyword, serpModel, semanticAnalysis, outline,
 *                theme, tone, existingTitles, internalLinks, ratingExamples
 * Outputs (ctx): blogContent, parsedBlog, htmlBody, fieldData
 */

import {
  generateBlogContent,
  generateOptimizedOutline,
  getWordCountBounds,
  trimContentToWordCount,
} from './claude.js';
import { parseBlogContent }             from '../../../utils/blogParser.js';
import { buildBodyHtml, buildFieldData } from '../../../utils/htmlBuilder.js';

const MAX_ATTEMPTS = 3;

export const ContentGenerationModule = {
  /**
   * @param {WorkflowContext} ctx
   * @param {{ includeFaq?: boolean }} config
   * @param {{ emitEvent: Function, jobId: string }} runtime
   */
  async execute(ctx, config, { emitEvent, jobId }) {
    const {
      mainKeyword,
      serpModel,
      semanticAnalysis,
      existingTitles   = [],
      internalLinks    = [],
      ratingExamples   = [],
      detectedFields   = null,
      resolvedRefs     = {},
      secondaryKeywords = [],
    } = ctx;

    // theme/tone: direct ctx value → siteProfile fields → config value
    const theme = ctx.theme ?? ctx.siteProfile?.theme ?? config?.theme ?? null;
    const tone  = ctx.tone  ?? ctx.siteProfile?.recommendedToneForGeneration ?? config?.tone ?? null;

    if (!mainKeyword) throw new Error('mainKeyword requis pour ContentGenerationModule');

    // Build optimized outline from SERP model
    let optimizedOutline = ctx.outline ?? '';
    if (!optimizedOutline && serpModel?.dominantSubtopics?.length > 0) {
      emitEvent(jobId, { type: 'step', message: '📌 Génération du plan optimisé SERP avec Claude...' });
      try {
        optimizedOutline = await generateOptimizedOutline(mainKeyword, serpModel, theme, tone);
        if (optimizedOutline) {
          emitEvent(jobId, { type: 'step', message: `✅ Plan généré (${optimizedOutline.split('\n').length} lignes)` });
        }
      } catch (err) {
        // Non-blocking
      }
    }

    // Word count bounds from KD
    const { min: wcMin, max: wcMax } = getWordCountBounds(serpModel?.kd ?? ctx.kd ?? null);

    let rawBlog  = '';
    let parsed   = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const attemptLabel = attempt === 1 ? '' : ` (tentative ${attempt}/${MAX_ATTEMPTS})`;
      emitEvent(jobId, { type: 'step', message: `✍️ Génération du blog avec Claude${attemptLabel}...` });

      rawBlog = await generateBlogContent({
        mainKeyword,
        secondaryKeywords,
        theme,
        tone,
        existingTitles,
        serpModel,
        semanticAnalysis,
        internalUrls:     internalLinks,
        outline:          optimizedOutline,
        ratingExamples,
      });

      parsed = parseBlogContent(rawBlog);

      const wordCount = rawBlog.split(/\s+/).filter(Boolean).length;
      emitEvent(jobId, { type: 'step', message: `📝 Article généré : ${wordCount} mots` });

      // Trim if overlong
      if (wordCount > wcMax * 1.05) {
        emitEvent(jobId, { type: 'step', message: `✂️ Article trop long (${wordCount} mots > max ${wcMax}) — compression...` });
        rawBlog = await trimContentToWordCount(rawBlog, wcMax);
        parsed  = parseBlogContent(rawBlog);
      }

      const finalWords = rawBlog.split(/\s+/).filter(Boolean).length;
      if (finalWords >= wcMin) break;

      if (attempt < MAX_ATTEMPTS) {
        emitEvent(jobId, { type: 'step', message: `⚠️ Article trop court (${finalWords} mots < min ${wcMin}) — nouvelle tentative...` });
      }
    }

    // Build HTML + Webflow field data if collection fields are available
    let htmlBody  = null;
    let fieldData = null;

    if (parsed && detectedFields) {
      htmlBody  = buildBodyHtml(parsed, detectedFields);
      fieldData = buildFieldData({
        parsed,
        detectedFields,
        htmlBody,
        mainKeyword,
        status:    ctx.publishStatus ?? 'draft',
        resolvedRefs,
      });
    }

    if (parsed?.preview) {
      emitEvent(jobId, { type: 'preview', data: parsed.preview });
    }

    return {
      outline:     optimizedOutline,
      blogContent: rawBlog,
      parsedBlog:  parsed,
      htmlBody,
      fieldData,
    };
  },
};
