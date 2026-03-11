/**
 * Template: Blog SEO
 *
 * The standard workflow for generating an SEO-optimised blog article.
 * This mirrors the existing runPipeline() logic, expressed as a declarative
 * list of steps that the WorkflowEngine can execute.
 *
 * Each step references its module implementation via the registry so that
 * stored workflow JSON (which only contains the `type` string) can be
 * re-hydrated at runtime with registry.resolveStep(stepDef).
 */

import { registry } from '../registry.js';

export const BlogSeoTemplate = {
  id:          'blog-seo',
  name:        'Blog SEO',
  description: 'Génère un article de blog optimisé pour le référencement naturel.',

  /**
   * Returns a fully-resolved array of step definitions (with module implementations).
   * Pass overrides to customise individual steps (e.g. disable FAQ).
   *
   * @param {{ faq?: boolean, internalLinking?: boolean }} opts
   * @returns {StepDefinition[]}
   */
  build(opts = {}) {
    const { faq = true, internalLinking = true } = opts;

    return [
      registry.resolveStep({
        type:     'keyword-research',
        label:    'Recherche de mots-clés',
      }),
      registry.resolveStep({
        type:     'serp-analysis',
        label:    'Analyse SERP',
        config:   { topN: 10 },
        optional: true,
      }),
      registry.resolveStep({
        type:     'semantic-extraction',
        label:    'Extraction sémantique',
        optional: true,
      }),
      ...(internalLinking ? [registry.resolveStep({
        type:     'internal-linking',
        label:    'Maillage interne',
        optional: true,
        config:   { maxLinks: 5 },
      })] : []),
      registry.resolveStep({
        type:  'content-generation',
        label: 'Génération de contenu',
        config: { includeFaq: faq },
      }),
      ...(faq ? [registry.resolveStep({
        type:     'faq-generator',
        label:    'Génération FAQ',
        optional: true,
        config:   { count: 5 },
      })] : []),
    ];
  },
};
