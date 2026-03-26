/**
 * Module: Webflow Publish
 *
 * Creates (and optionally publishes) a Webflow CMS item.
 *
 * Expects ctx.collectionId, ctx.webflowFields and ctx.detectedFields to have been
 * set by the "webflow-structure" module that runs before this one. Falls back to
 * fetching the collection itself when those values are absent (standalone mode).
 *
 * Inputs  (ctx): parsedBlog | fieldData, collectionId, webflowFields, detectedFields, translations[]
 * Inputs  (config): apiKey, siteId, collectionName, status
 * Outputs (ctx): webflowItemId, webflowLocalizedItems[]
 */

import { createItem, publishItem, getCollectionByName, getCollectionFields, getSiteLocales, updateItemForLocale } from './webflow.js';
import { buildBodyHtml, buildFieldData, detectFields } from '../../../utils/htmlBuilder.js';

export const WebflowPublishModule = {
  /**
   * @param {WorkflowContext} ctx
   * @param {{ status?: 'draft' | 'publish', apiKey?: string, siteId?: string, collectionName?: string }} config
   * @param {{ emitEvent: Function, jobId: string }} runtime
   */
  async execute(ctx, config, { emitEvent, jobId }) {
    const apiKey         = config?.apiKey         ?? ctx.apiKey         ?? null;
    const siteId         = config?.siteId         ?? ctx.siteId         ?? null;
    const collectionName = config?.collectionName ?? ctx.collectionName ?? null;
    const publishStatus  = ctx.publishStatus;
    const status         = config?.status         ?? publishStatus      ?? 'draft';
    const images         = ctx.images             ?? null;

    if (!apiKey) {
      emitEvent(jobId, { type: 'step', message: '⚠️ apiKey Webflow manquant — publication ignorée' });
      return { webflowItemId: null };
    }

    // ── Resolve collection ID + fields ──────────────────────────────────────
    // Primary path: webflow-structure has already resolved these and put them in ctx.
    // Fallback: fetch on the spot (standalone mode, no webflow-structure in the workflow).
    let resolvedCollectionId = ctx.collectionId  ?? config?.collectionId ?? null;
    let fields               = ctx.webflowFields ?? null;
    let detectedFields       = ctx.detectedFields ?? null;

    if (!resolvedCollectionId) {
      if (!siteId || !collectionName) {
        emitEvent(jobId, { type: 'step', message: '⚠️ collectionId introuvable — ajoutez le module "Structure Webflow" en amont ou configurez siteId et collectionName' });
        return { webflowItemId: null };
      }
      emitEvent(jobId, { type: 'step', message: '📋 Recherche de la collection Webflow...' });
      const collection = await getCollectionByName(siteId, apiKey, collectionName);
      if (!collection) throw new Error(`Collection "${collectionName}" introuvable sur ce site Webflow.`);
      resolvedCollectionId = collection.id;
    }

    if (!fields) {
      emitEvent(jobId, { type: 'step', message: '📋 Récupération des champs de la collection...' });
      fields         = await getCollectionFields(resolvedCollectionId, apiKey);
      detectedFields = detectFields(fields);
    }

    // ── Resolve field data ──────────────────────────────────────────────────
    let fieldData = ctx.fieldData ?? null;

    if (!fieldData) {
      const parsedBlog = ctx.parsedBlog ?? null;
      if (!parsedBlog) {
        emitEvent(jobId, { type: 'step', message: '⚠️ Aucun contenu disponible (parsedBlog manquant) — publication Webflow ignorée' });
        return { webflowItemId: null };
      }

      const htmlBody         = ctx.htmlBody ?? buildBodyHtml(parsedBlog, detectedFields ?? {});
      const featuredImageUrl = images?.featured ?? null;
      const uploadedImages   = images?.content  ?? [];
      const secondaryKeywords = ctx.secondaryKeywords ?? [];

      fieldData = buildFieldData(
        fields,
        parsedBlog,
        htmlBody,
        status === 'draft',
        secondaryKeywords,
        featuredImageUrl,
        uploadedImages,
        {}
      );
    }

    // ── Create item (primary locale) ────────────────────────────────────────
    emitEvent(jobId, { type: 'step', message: '🚀 Création de l\'article dans Webflow...' });
    const createdItem = await createItem(resolvedCollectionId, apiKey, fieldData, status === 'draft');
    const itemId      = createdItem?.id ?? createdItem?.itemId;

    if (status === 'publish' && itemId) {
      await publishItem(resolvedCollectionId, apiKey, itemId);
      emitEvent(jobId, { type: 'step', message: '✅ Article publié en live sur Webflow.' });
    } else {
      emitEvent(jobId, { type: 'step', message: '✅ Article sauvegardé en brouillon dans Webflow.' });
    }

    // ── Localized versions ───────────────────────────────────────────────────
    const translations = Array.isArray(ctx.translations) ? ctx.translations : [];
    const webflowLocalizedItems = [];

    if (translations.length > 0 && itemId && siteId) {
      emitEvent(jobId, { type: 'step', message: `🌐 ${translations.length} traduction(s) détectée(s) — récupération des locales Webflow…` });

      let locales = { primary: null, secondary: [] };
      try {
        locales = await getSiteLocales(siteId, apiKey);
      } catch (e) {
        emitEvent(jobId, { type: 'step', message: `⚠️ Impossible de récupérer les locales Webflow : ${e.message}` });
      }

      const secondary = locales.secondary ?? [];

      if (secondary.length === 0) {
        emitEvent(jobId, { type: 'step', message: '⚠️ Aucune locale secondaire trouvée sur ce site Webflow — traductions ignorées.' });
      } else {
        for (const translation of translations) {
          const cmsLocaleId = _matchLocale(secondary, translation.targetLanguage, translation.targetCountry);
          if (!cmsLocaleId) {
            emitEvent(jobId, { type: 'step', message: `⚠️ Locale introuvable pour ${translation.targetLanguage} / ${translation.targetCountry} — traduction ignorée` });
            continue;
          }

          emitEvent(jobId, { type: 'step', message: `🌍 Publication locale ${translation.targetLanguage} (${translation.targetCountry})…` });
          try {
            await updateItemForLocale(resolvedCollectionId, apiKey, itemId, cmsLocaleId, translation.fieldData, status === 'draft');
            if (status === 'publish') {
              await publishItem(resolvedCollectionId, apiKey, itemId);
            }
            webflowLocalizedItems.push({ cmsLocaleId, lang: translation.targetLanguage, country: translation.targetCountry });
            emitEvent(jobId, { type: 'step', message: `✅ Locale ${translation.targetLanguage} (${translation.targetCountry}) publiée` });
          } catch (e) {
            emitEvent(jobId, { type: 'step', message: `⚠️ Erreur locale ${translation.targetLanguage} : ${e.message}` });
          }
        }
      }
    }

    return { webflowItemId: itemId ?? null, webflowLocalizedItems };
  },
};

// ── Language name → ISO 639-1 code ────────────────────────────────────────────
const LANG_CODE = {
  English: 'en', French: 'fr', Spanish: 'es', German: 'de',
  Italian: 'it', Portuguese: 'pt', Dutch: 'nl', Polish: 'pl',
  Japanese: 'ja', Chinese: 'zh',
};

/**
 * Find the cmsLocaleId in the secondary locales array that best matches the
 * given language name + country code (e.g. "French" + "FR" → "fr-FR").
 *
 * Matching priority:
 *  1. tag starts with langCode AND tag contains country (e.g. "fr-FR")
 *  2. tag starts with langCode only (first match)
 */
function _matchLocale(secondaryLocales, targetLanguage, targetCountry) {
  const langCode = LANG_CODE[targetLanguage]?.toLowerCase() ?? targetLanguage.slice(0, 2).toLowerCase();
  const country  = (targetCountry ?? '').toUpperCase();

  // Priority 1 — exact language + country
  const exact = secondaryLocales.find(l => {
    const tag = (l.tag ?? '').toLowerCase();
    return tag.startsWith(langCode) && tag.includes(country.toLowerCase());
  });
  if (exact) return exact.cmsLocaleId;

  // Priority 2 — language only
  const lang = secondaryLocales.find(l => (l.tag ?? '').toLowerCase().startsWith(langCode));
  return lang?.cmsLocaleId ?? null;
}
