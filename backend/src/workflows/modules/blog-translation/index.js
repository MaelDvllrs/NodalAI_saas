/**
 * Module: Blog Translation
 *
 * Translates a generated blog article (HTML + Webflow fieldData) to a target
 * language and adapts its links:
 *
 *  • Internal links  → domain-swapped with targetSiteUrl (simple regex replace)
 *  • External links  → Claude Haiku suggests equivalent sources in the target
 *                      language / country; adapted directly in the HTML before
 *                      the translation pass so Claude sees the final URLs
 *  • Visible text    → Claude Sonnet translates all text while preserving HTML
 *  • fieldData       → Claude Haiku batch-translates plain-text fields
 *                      (title, meta-title, meta-description, excerpt…)
 *                      HTML-body fields are patched with the translated HTML
 *
 * Inputs  (ctx): htmlBody, htmlBodyFull, fieldData, siteUrl, translations
 * Outputs (ctx): htmlBody, htmlBodyFull, fieldData (latest translation),
 *                translations[] (accumulated — one entry per blog-translation step)
 *
 * Config:
 *   targetLanguage        {string}  e.g. "Anglais", "Espagnol"  (default: "Anglais")
 *   targetCountry         {string}  e.g. "US", "ES", "DE"       (default: "US")
 *   targetSiteUrl         {string}  e.g. "https://mysite.com"   (default: "")
 *   translateExternalLinks{boolean} replace external links      (default: true)
 */

import {
  normalizeLanguage,
  extractExternalLinks,
  findExternalLinkAlternatives,
  translateHtml,
  translateFieldData,
} from './translate.js';

const HTML_KEY = /^(body|post-body|content|html|rich.?text)/i;

export const BlogTranslationModule = {
  async execute(ctx, config, { emitEvent, jobId }) {
    const { htmlBody, htmlBodyFull, siteUrl } = ctx;
    // If fieldData wasn't built yet (no webflow-structure in pipeline), derive a
    // minimal one from parsedBlog so H1 / title tag / meta desc can be translated.
    let fieldData = ctx.fieldData ?? null;
    if (!fieldData && ctx.parsedBlog) {
      const p = ctx.parsedBlog;
      fieldData = {
        name:               p.h1 || p.titleTag || '',
        'meta-title':       p.titleTag || '',
        'meta-description': p.metaDescription || '',
      };
    }
    const {
      targetLanguage         = 'Anglais',
      targetCountry          = 'US',
      targetSiteUrl          = '',
      translateExternalLinks = true,
    } = config;

    const sourceHtml = htmlBodyFull || htmlBody || '';
    if (!sourceHtml && !fieldData) {
      throw new Error('blog-translation: aucun contenu à traduire (htmlBody ou fieldData requis)');
    }

    emitEvent(jobId, { type: 'step', message: `🌐 Traduction en ${targetLanguage} (${targetCountry})…` });

    // ── 1. Internal links: domain swap ────────────────────────────────────────
    let html = sourceHtml;
    const tgtDomain = targetSiteUrl.replace(/\/$/, '');
    const srcDomain = (siteUrl ?? '').replace(/\/$/, '');

    if (srcDomain && tgtDomain && srcDomain !== tgtDomain) {
      const before = html;
      html = html.replaceAll(srcDomain, tgtDomain);
      const n = (before.match(new RegExp(srcDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length;
      if (n) emitEvent(jobId, { type: 'step', message: `🔗 ${n} lien(s) interne(s) remplacé(s)` });
    }

    // ── 2. External links: find equivalents ───────────────────────────────────
    let linkReplacements = {};
    if (translateExternalLinks && html) {
      const externals = extractExternalLinks(html, tgtDomain);
      if (externals.length) {
        emitEvent(jobId, { type: 'step', message: `🔍 ${externals.length} lien(s) externe(s) détecté(s) — recherche d'équivalents…` });
        linkReplacements = await findExternalLinkAlternatives(externals, targetLanguage, targetCountry);
        const adapted = Object.values(linkReplacements).filter(v => v && v !== 'null').length;
        emitEvent(jobId, { type: 'step', message: `🔗 ${adapted}/${externals.length} lien(s) externe(s) adapté(s)` });
      }
    }

    // ── 3. Translate HTML ─────────────────────────────────────────────────────
    // We always translate htmlBodyFull (body + FAQ + visual schemas).
    // Then we extract the body-only portion by splitting on the comment markers
    // written by buildFullHtml: <!-- === FAQ === --> and <!-- === SCHÉMA N === -->
    let translatedHtml = html;
    let translatedHtmlBody = '';
    if (html) {
      emitEvent(jobId, { type: 'step', message: `✍️ Traduction du contenu…` });
      translatedHtml = await translateHtml(html, targetLanguage, targetCountry, linkReplacements);
      emitEvent(jobId, { type: 'step', message: `✅ Contenu HTML traduit` });

      // Determine body-only boundary (first FAQ or SCHÉMA comment marker)
      const markers = [
        translatedHtml.indexOf('<!-- === FAQ'),
        translatedHtml.indexOf('<!-- === SCH'),
      ].filter(i => i !== -1);
      const splitIdx = markers.length > 0 ? Math.min(...markers) : -1;
      translatedHtmlBody = splitIdx !== -1
        ? translatedHtml.slice(0, splitIdx).trim()
        : translatedHtml;
    }

    // ── 4. Translate fieldData plain-text fields ──────────────────────────────
    let translatedFieldData = fieldData ?? null;
    if (fieldData) {
      emitEvent(jobId, { type: 'step', message: `📝 Traduction des métadonnées…` });
      translatedFieldData = await translateFieldData(fieldData, targetLanguage, targetCountry);

      // Patch HTML body fields with the freshly translated HTML
      for (const key of Object.keys(translatedFieldData)) {
        if (HTML_KEY.test(key) && typeof fieldData[key] === 'string' && fieldData[key].includes('<')) {
          translatedFieldData[key] = translatedHtml;
        }
      }
      emitEvent(jobId, { type: 'step', message: `✅ Métadonnées traduites` });
    }

    // ── 5. Accumulate into ctx.translations for multi-locale Webflow publish ──
    const lang = normalizeLanguage(targetLanguage);
    const prevTranslations = Array.isArray(ctx.translations) ? ctx.translations : [];
    const translations = [
      ...prevTranslations,
      {
        targetLanguage: lang,
        targetCountry,
        htmlBody:   translatedHtml,
        htmlBodyFull: translatedHtml,
        fieldData:  translatedFieldData,
      },
    ];

    emitEvent(jobId, { type: 'step', message: `📦 Traduction ajoutée (${lang} / ${targetCountry}) — total : ${translations.length}` });

    return {
      htmlBody:     translatedHtmlBody || translatedHtml,
      htmlBodyFull: translatedHtml,
      fieldData:    translatedFieldData,
      translations,
    };
  },
};
