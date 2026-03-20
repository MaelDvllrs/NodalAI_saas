/**
 * Module: Visual Schemas
 *
 * Generates 3 visual HTML schemas (comparison tables, process flows, checklists)
 * adapted to the blog content using Claude Sonnet.
 *
 * Inputs  (ctx): blogContent or parsedBlog (required), mainKeyword, tone
 * Outputs (ctx): visualSchemas (Array<{ type, position, code }>)
 */

import { generateVisualSchemas } from './claude.js';

export const VisualSchemasModule = {
  async execute(ctx, config = {}, { emitEvent, jobId }) {
    const blogContent = ctx.blogContent
      ?? ctx.parsedBlog?.planMece
      ?? ctx.parsedBlog?.raw
      ?? null;

    if (!blogContent) {
      throw new Error('VisualSchemas : blogContent requis — connectez un module de génération de blog en amont.');
    }

    const mainKeyword = ctx.mainKeyword ?? ctx.geoPrompt ?? config.mainKeyword ?? 'sujet principal';
    const tone        = ctx.tone ?? ctx.siteProfile?.recommendedToneForGeneration ?? config.tone ?? 'expert et pédagogique';

    emitEvent(jobId, { type: 'step', message: '📊 Génération des schémas visuels (tableaux, processus, checklists)...' });

    const schemas = await generateVisualSchemas({ blogContent, mainKeyword, tone });

    emitEvent(jobId, { type: 'step', message: `✅ ${schemas.length} schéma(s) visuel(s) généré(s)` });

    // Attach schemas to parsedBlog if available so they appear in the schema tab
    if (ctx.parsedBlog && schemas.length > 0) {
      const existing = Array.isArray(ctx.parsedBlog.schemas) ? ctx.parsedBlog.schemas : [];
      ctx.parsedBlog.schemas = [...existing, ...schemas];
    }

    return { visualSchemas: schemas };
  },
};
