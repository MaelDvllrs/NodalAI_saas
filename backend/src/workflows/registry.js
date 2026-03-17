/**
 * Module Registry
 *
 * Central lookup table of all available workflow modules.
 *
 * Each module entry exposes:
 *   ports.in  — input ports  { key, label, required }
 *   ports.out — output ports { key, label }
 *
 * The engine uses `ports.in` to validate that required ctx keys are present
 * before executing a step.  Downstream modules automatically receive outputs
 * because the engine merges every module's return value into the shared ctx.
 *
 * Usage:
 *   import { registry } from './registry.js';
 *   const mod = registry.get('keyword-research');
 *   console.log(mod.ports.in);  // [{ key:'theme', label:'Thème', required:false }, ...]
 */

import { TextInputModule }          from './modules/text-input/index.js';
import { WebsiteScraperModule }     from './modules/website-scraper/index.js';
import { KeywordResearchModule }    from './modules/keyword-research/index.js';
import { SerpAnalysisModule }       from './modules/serp-analysis/index.js';
import { SemanticExtractionModule } from './modules/semantic-extraction/index.js';
import { ContentGenerationModule }  from './modules/content-generation/index.js';
import { BlogGenerationModule }     from './modules/blog-generation/index.js';
import { FaqGeneratorModule }       from './modules/faq-generator.js';
import { InternalLinkingModule }    from './modules/internal-linking/index.js';
import { WebflowStructureModule }    from './modules/webflow-structure/index.js';
import { WebflowPublishModule }     from './modules/webflow-publish/index.js';

const MODULES = [
  // ── Text Input ─────────────────────────────────────────────────────────────
  {
    id:          'text-input',
    label:       'Entrée texte',
    description: 'Injecte une valeur texte fixe dans le pipeline.',
    ports: {
      in:  [],
      out: [{ key: 'value', label: 'Valeur injectée' }],
    },
    defaultConfig: { outputKey: 'theme', value: '' },
    module:      TextInputModule,
  },

  // ── Website Scraper ────────────────────────────────────────────────────────
  {
    id:          'website-scraper',
    label:       'Scraping de site',
    description: 'Scrape la homepage + sitemap du projet sélectionné et extrait le thème, le ton et le profil du site.',
    ports: {
      in:  [],   // siteUrl vient automatiquement du projet (ctx.siteUrl injecté par le runner)
      out: [
        { key: 'siteProfile',  label: 'Profil du site' },
        { key: 'sitemapUrls',  label: 'URLs sitemap' },
      ],
    },
    defaultConfig: { maxPages: 6 },
    module:      WebsiteScraperModule,
  },

  // ── Keyword Research ───────────────────────────────────────────────────────
  {
    id:          'keyword-research',
    label:       'Recherche de mots-clés',
    description: 'Génère des candidats à partir d\'un thème et sélectionne le meilleur via DataForSEO.',
    ports: {
      in:  [
        // Theme can come from: ctx.theme (initial input), ctx.siteProfile.theme (website-scraper),
        // or config.theme (hardcoded in step config). At least one must be available.
        { key: 'theme',          label: 'Thème',            required: false },
        { key: 'siteProfile',    label: 'Profil du site',   required: false },
        { key: 'directKeyword',  label: 'Mot-clé direct',   required: false },
      ],
      out: [
        { key: 'mainKeyword',    label: 'Mot-clé principal' },
        { key: 'kd',             label: 'Difficulté (KD)' },
        { key: 'kwSearchVolume', label: 'Volume de recherche' },
      ],
    },
    defaultConfig: {},
    module:      KeywordResearchModule,
  },

  // ── SERP Analysis ──────────────────────────────────────────────────────────
  {
    id:          'serp-analysis',
    label:       'Analyse SERP',
    description: 'Récupère les 10 premiers résultats Google et construit le modèle SERP.',
    ports: {
      in:  [
        // mainKeyword comes from keyword-research ctx, or can be set in config.keyword for standalone
        { key: 'mainKeyword', label: 'Mot-clé principal', required: false },
      ],
      out: [
        { key: 'serpResults', label: 'Résultats SERP' },
        { key: 'serpModel',   label: 'Modèle SERP' },
      ],
    },
    defaultConfig: { topN: 10 },
    module:      SerpAnalysisModule,
  },

  // ── Semantic Extraction ────────────────────────────────────────────────────
  {
    id:          'semantic-extraction',
    label:       'Extraction sémantique',
    description: 'Crawl les pages concurrentes et extrait les termes TF-IDF, BM25 + embeddings.',
    ports: {
      in:  [
        { key: 'mainKeyword', label: 'Mot-clé principal', required: true },
        { key: 'serpResults', label: 'Résultats SERP',    required: false },
      ],
      out: [
        { key: 'semanticAnalysis', label: 'Analyse sémantique' },
      ],
    },
    defaultConfig: {},
    module:      SemanticExtractionModule,
  },

  // ── Blog Generation ────────────────────────────────────────────────────────
  {
    id:          'blog-generation',
    label:       'Génération de blog',
    description: 'Génère un article de blog SEO optimisé avec Claude Sonnet.',
    ports: {
      in:  [
        { key: 'mainKeyword',      label: 'Mot-clé principal',      required: true  },
        { key: 'serpModel',        label: 'Modèle SERP',            required: false },
        { key: 'semanticAnalysis', label: 'Analyse sémantique',     required: false },
        { key: 'siteProfile',      label: 'Profil du site',          required: false },
        { key: 'sitemapUrls',      label: 'URLs sitemap',            required: false },
        { key: 'internalLinks',    label: 'Liens internes',          required: false },
        { key: 'tone',             label: 'Ton rédactionnel',        required: false },
        { key: 'detectedFields',   label: 'Champs Webflow détectés', required: false },
      ],
      out: [
        { key: 'blogContent', label: 'Contenu article' },
        { key: 'parsedBlog',  label: 'Article parsé' },
        { key: 'htmlBody',    label: 'HTML généré' },
        { key: 'fieldData',   label: 'Champs Webflow' },
        { key: 'outline',     label: 'Plan généré' },
      ],
    },
    defaultConfig: {},
    module:      BlogGenerationModule,
  },

  // ── Content Generation (legacy — kept for backward compatibility) ───────────
  {
    id:          'content-generation',
    label:       'Génération de contenu',
    description: 'Génère un article SEO optimisé avec Claude Sonnet.',
    ports: {
      in:  [
        { key: 'mainKeyword',      label: 'Mot-clé principal',   required: true  },
        { key: 'serpModel',        label: 'Modèle SERP',          required: false },
        { key: 'semanticAnalysis', label: 'Analyse sémantique',   required: false },
        // siteProfile provides theme + recommended tone when not set explicitly
        { key: 'siteProfile',      label: 'Profil du site',       required: false },
        { key: 'theme',            label: 'Thème',                required: false },
        { key: 'tone',             label: 'Ton rédactionnel',     required: false },
        { key: 'outline',          label: 'Plan article',         required: false },
      ],
      out: [
        { key: 'blogContent', label: 'Contenu article' },
        { key: 'htmlBody',    label: 'HTML généré' },
        { key: 'fieldData',   label: 'Champs Webflow' },
      ],
    },
    defaultConfig: { includeFaq: true },
    module:      ContentGenerationModule,
  },

  // ── FAQ Generator ──────────────────────────────────────────────────────────
  {
    id:          'faq-generator',
    label:       'Génération FAQ',
    description: 'Génère des questions/réponses FAQ optimisées pour le GEO.',
    ports: {
      in:  [
        { key: 'mainKeyword', label: 'Mot-clé principal', required: true  },
        { key: 'serpModel',   label: 'Modèle SERP',       required: false },
        { key: 'blogContent', label: 'Contenu article',   required: false },
      ],
      out: [
        { key: 'faqQuestions', label: 'Questions FAQ' },
      ],
    },
    defaultConfig: { count: 5 },
    module:      FaqGeneratorModule,
  },

  // ── Internal Linking ───────────────────────────────────────────────────────
  {
    id:          'internal-linking',
    label:       'Maillage interne',
    description: 'Suggère des liens internes depuis le contenu du site crawlé.',
    ports: {
      in:  [
        { key: 'mainKeyword', label: 'Mot-clé principal', required: true  },
        { key: 'blogContent', label: 'Contenu article',   required: false },
        { key: 'siteId',      label: 'ID du projet',      required: false },
      ],
      out: [
        { key: 'internalLinks', label: 'Liens internes' },
      ],
    },
    defaultConfig: { maxLinks: 5 },
    module:      InternalLinkingModule,
  },

  // ── Webflow Structure ──────────────────────────────────────────────────────
  {
    id:          'webflow-structure',
    label:       'Structure Webflow',
    description: 'Récupère les champs de la collection Webflow CMS.',
    ports: {
      in:  [],
      out: [
        { key: 'collectionId',   label: 'ID de la collection' },
        { key: 'webflowFields',  label: 'Champs bruts' },
        { key: 'detectedFields', label: 'Champs détectés' },
      ],
    },
    defaultConfig: { apiKey: '', siteId: '', collectionName: '' },
    module:      WebflowStructureModule,
  },

  // ── Webflow Publish ────────────────────────────────────────────────────────
  {
    id:          'webflow-publish',
    label:       'Publication Webflow',
    description: 'Crée et publie l\'article dans une collection Webflow CMS.',
    ports: {
      in:  [
        { key: 'parsedBlog',     label: 'Article analysé',    required: false },
        { key: 'fieldData',      label: 'Champs Webflow',     required: false },
        { key: 'collectionId',   label: 'ID collection',      required: false },
        { key: 'webflowFields',  label: 'Champs bruts',       required: false },
        { key: 'detectedFields', label: 'Champs détectés',    required: false },
        { key: 'publishStatus',  label: 'Statut publication', required: false },
      ],
      out: [
        { key: 'webflowItemId',  label: 'ID article Webflow' },
        { key: 'webflowItemUrl', label: 'URL article' },
      ],
    },
    defaultConfig: { apiKey: '', siteId: '', collectionName: '', status: 'draft' },
    module:      WebflowPublishModule,
  },
];

class ModuleRegistry {
  constructor(modules) {
    this._map = new Map(modules.map(m => [m.id, m]));
  }

  /** @returns {ModuleDescriptor | undefined} */
  get(id) {
    return this._map.get(id);
  }

  /** @returns {ModuleDescriptor[]} */
  all() {
    return [...this._map.values()];
  }

  /**
   * Backward-compat helpers — derive flat string arrays from typed ports.
   * @param {string} id
   */
  getInputKeys(id)  { return (this.get(id)?.ports.in  ?? []).map(p => p.key); }
  getOutputKeys(id) { return (this.get(id)?.ports.out ?? []).map(p => p.key); }

  /**
   * Resolve a step definition by injecting the module implementation.
   */
  resolveStep(stepDef) {
    const descriptor = this.get(stepDef.type);
    if (!descriptor) throw new Error(`[Registry] Module inconnu : "${stepDef.type}"`);
    return {
      ...stepDef,
      label:  stepDef.label  ?? descriptor.label,
      config: { ...descriptor.defaultConfig, ...(stepDef.config ?? {}) },
      ports:  descriptor.ports,
      module: descriptor.module,
    };
  }
}

export const registry = new ModuleRegistry(MODULES);
