/**
 * Module: Semantic Extraction
 *
 * Crawls competitor pages, extracts TF-IDF terms, applies BM25 reranking
 * and builds the serpModel used by the content generation module.
 *
 * Inputs  (ctx): mainKeyword, serpResults
 * Outputs (ctx): semanticAnalysis, serpModel
 */

import { analyzeSemanticKeywords } from './semantic.js';
import { cleanSemanticTerms }       from './claude.js';
import { saveSerpModel }            from '../serp-analysis/db.js';

export const SemanticExtractionModule = {
  /**
   * @param {WorkflowContext} ctx
   * @param {{}} config
   * @param {{ emitEvent: Function, jobId: string }} runtime
   */
  async execute(ctx, _config, { emitEvent, jobId }) {
    const { mainKeyword, serpResults } = ctx;
    if (!mainKeyword) throw new Error('mainKeyword requis pour SemanticExtractionModule');

    if (!serpResults || serpResults.length === 0) {
      emitEvent(jobId, { type: 'step', message: '⚠️ Pas de résultats SERP — extraction sémantique ignorée' });
      return { semanticAnalysis: null, serpModel: null };
    }

    emitEvent(jobId, {
      type: 'step',
      message: `🧠 Analyse sémantique — crawl pages top ${Math.min(serpResults.length, 8)} SERP + BM25/embeddings...`,
    });

    let semanticAnalysis = null;
    let serpModel        = null;

    try {
      semanticAnalysis = await analyzeSemanticKeywords(mainKeyword, serpResults);

      if (semanticAnalysis?.intentTopTerms?.length > 0) {
        emitEvent(jobId, {
          type: 'step',
          message: `🧹 Nettoyage termes sémantiques (${semanticAnalysis.intentTopTerms.length} bruts → ~300 propres)...`,
        });
        try {
          semanticAnalysis.intentTopTerms = await cleanSemanticTerms(semanticAnalysis.intentTopTerms, mainKeyword);
          semanticAnalysis.tfidfTopTerms  = semanticAnalysis.intentTopTerms;
        } catch (cleanErr) {
          // Non-blocking
        }
      }

      emitEvent(jobId, {
        type: 'step',
        message:
          `✅ Analyse sémantique terminée — ${semanticAnalysis.pagesAnalyzed} pages, ` +
          `intention: ${semanticAnalysis.intent ?? '?'}, format: ${semanticAnalysis.contentFormat ?? '?'}, ` +
          `${semanticAnalysis.primaryTerms.length} termes principaux`,
      });
      emitEvent(jobId, { type: 'data', key: 'semanticAnalysis', value: semanticAnalysis });

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

      saveSerpModel(mainKeyword, serpModel).catch(() => {});
    } catch (err) {
      emitEvent(jobId, { type: 'step', message: `⚠️ Analyse sémantique ignorée (erreur): ${err.message}` });
    }

    return { semanticAnalysis, serpModel };
  },
};
