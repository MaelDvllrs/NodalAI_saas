/**
 * Module: FAQ Generator
 *
 * Generates FAQ questions/answers optimised for GEO (Generative Engine Optimization).
 * This is a lightweight module that wraps the FAQ generation already handled by
 * the content generation step. Its role here is to allow standalone FAQ generation
 * or augmentation of an existing article.
 *
 * Inputs  (ctx): mainKeyword, serpModel, blogContent
 * Outputs (ctx): faqQuestions
 */

export const FaqGeneratorModule = {
  /**
   * @param {WorkflowContext} ctx
   * @param {{ count?: number }} config
   * @param {{ emitEvent: Function, jobId: string }} runtime
   */
  async execute(ctx, config, { emitEvent, jobId }) {
    const { mainKeyword, serpModel, parsedBlog } = ctx;
    if (!mainKeyword) throw new Error('mainKeyword requis pour FaqGeneratorModule');

    // FAQ questions may already be embedded in the generated content
    const existingFaq = parsedBlog?.faqItems ?? [];
    if (existingFaq.length > 0) {
      emitEvent(jobId, {
        type: 'step',
        message: `❓ FAQ récupérée depuis l'article généré (${existingFaq.length} questions)`,
      });
      return { faqQuestions: existingFaq };
    }

    // Fallback: use SERP-derived questions
    const serpFaq = serpModel?.faqQuestions ?? [];
    if (serpFaq.length > 0) {
      emitEvent(jobId, {
        type: 'step',
        message: `❓ FAQ récupérée depuis l'analyse SERP (${serpFaq.length} questions)`,
      });
      return { faqQuestions: serpFaq };
    }

    emitEvent(jobId, { type: 'step', message: '⚠️ Aucune FAQ disponible pour ce workflow' });
    return { faqQuestions: [] };
  },
};
