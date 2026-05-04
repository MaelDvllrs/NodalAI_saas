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

import { createItem, createItemBulk, publishItem, getCollectionByName, getCollectionFields, getSiteLocales, updateItemForLocale } from './webflow.js';
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

    // ── Resolve locales early (needed before item creation) ─────────────────
    // Use locales already fetched by webflow-structure if available (avoids a second API call).
    // Falls back to fetching from the site API if siteId is configured on this module.
    const effectiveSiteId  = siteId ?? ctx.siteId ?? null;
    const translations     = Array.isArray(ctx.translations) ? ctx.translations : [];
    const webflowLocalizedItems = [];

    let locales    = { primary: null, secondary: [] };
    let localePairs = []; // [{ cmsLocaleId, translation }]

    if (translations.length > 0) {
      if (ctx.webflowLocales) {
        locales = ctx.webflowLocales;
        emitEvent(jobId, { type: 'step', message: `🌐 ${translations.length} traduction(s) — locales Webflow déjà disponibles` });
      } else if (effectiveSiteId) {
        emitEvent(jobId, { type: 'step', message: `🌐 ${translations.length} traduction(s) — récupération des locales Webflow…` });
        try {
          locales = await getSiteLocales(effectiveSiteId, apiKey);
        } catch (e) {
          emitEvent(jobId, { type: 'step', message: `⚠️ Locales Webflow non récupérées : ${e.message}` });
        }
      } else {
        emitEvent(jobId, { type: 'step', message: '⚠️ siteId manquant — impossible de vérifier les locales Webflow (ajoutez le module "Structure Webflow" en amont)' });
      }

      const secondary = locales.secondary ?? [];
      if (secondary.length === 0 && translations.length > 0) {
        emitEvent(jobId, { type: 'step', message: '⚠️ Aucune locale secondaire sur ce site Webflow — traductions ignorées.' });
      } else {
        for (const translation of translations) {
          const cmsLocaleId = _matchLocale(secondary, translation.targetLanguage, translation.targetCountry);
          if (!cmsLocaleId) {
            emitEvent(jobId, { type: 'step', message: `⚠️ Locale introuvable pour ${translation.targetLanguage} / ${translation.targetCountry} — ignorée` });
          } else {
            localePairs.push({ cmsLocaleId, translation });
          }
        }
      }
    }

    // ── Create item ──────────────────────────────────────────────────────────
    // Webflow does NOT auto-create secondary locale variants when creating the
    // primary item — they must all exist before PATCH can update them.
    // Strategy: if secondary locales are needed, use POST /items/bulk to seed all
    // locale variants (with primary fieldData) in one call, then PATCH each
    // secondary with its translated content.
    // Fallback to createItem (single locale) if bulk fails or no locales.
    let itemId = null;
    const isDraft = status === 'draft';

    if (localePairs.length > 0 && locales.primary?.cmsLocaleId) {
      const allLocaleIds = [
        locales.primary.cmsLocaleId,
        ...localePairs.map(p => p.cmsLocaleId),
      ];
      emitEvent(jobId, { type: 'step', message: `🚀 Création de l'article avec ${allLocaleIds.length} locale(s) (bulk)…` });
      try {
        itemId = await createItemBulk(resolvedCollectionId, apiKey, fieldData, allLocaleIds, isDraft);
      } catch (bulkErr) {
        emitEvent(jobId, { type: 'step', message: `⚠️ Création bulk échouée (${bulkErr.message}) — fallback locale principale uniquement` });
        localePairs = [];
        const createdItem = await createItem(resolvedCollectionId, apiKey, fieldData, isDraft);
        itemId = createdItem?.id ?? createdItem?.itemId ?? null;
      }
    } else {
      emitEvent(jobId, { type: 'step', message: '🚀 Création de l\'article dans Webflow…' });
      const createdItem = await createItem(resolvedCollectionId, apiKey, fieldData, isDraft);
      itemId = createdItem?.id ?? createdItem?.itemId ?? null;
    }

    if (!itemId) {
      emitEvent(jobId, { type: 'step', message: '⚠️ Webflow n\'a pas retourné d\'itemId — vérifiez les logs.' });
      return { webflowItemId: null, webflowLocalizedItems };
    }

    // ── Update each secondary locale with translated content ─────────────────
    for (const { cmsLocaleId, translation } of localePairs) {
      if (!translation.fieldData) {
        emitEvent(jobId, { type: 'step', message: `⚠️ fieldData manquant pour ${translation.targetLanguage} — locale ignorée` });
        continue;
      }
      emitEvent(jobId, { type: 'step', message: `🌍 Mise à jour locale ${translation.targetLanguage} (${translation.targetCountry})…` });
      try {
        await updateItemForLocale(resolvedCollectionId, apiKey, itemId, cmsLocaleId, translation.fieldData, isDraft);
        webflowLocalizedItems.push({ cmsLocaleId, lang: translation.targetLanguage, country: translation.targetCountry });
        emitEvent(jobId, { type: 'step', message: `✅ Locale ${translation.targetLanguage} (${translation.targetCountry}) mise à jour` });
      } catch (e) {
        emitEvent(jobId, { type: 'step', message: `⚠️ Erreur locale ${translation.targetLanguage} : ${e.message}` });
      }
    }

    // ── Publish once (covers all locales) ────────────────────────────────────
    if (status === 'publish') {
      await publishItem(resolvedCollectionId, apiKey, itemId);
      const localeCount = webflowLocalizedItems.length;
      emitEvent(jobId, { type: 'step', message: `✅ Article publié en live${localeCount > 0 ? ` (${localeCount + 1} locale(s))` : ''}.` });
    } else {
      emitEvent(jobId, { type: 'step', message: '✅ Article sauvegardé en brouillon dans Webflow.' });
    }

    return { webflowItemId: itemId, webflowLocalizedItems };
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
