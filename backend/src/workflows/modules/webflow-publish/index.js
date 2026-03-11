/**
 * Module: Webflow Publish
 *
 * Creates (and optionally publishes) a Webflow CMS item.
 *
 * Two modes:
 *   1. ctx.fieldData already set (content-generation ran with detectedFields)
 *   2. ctx.parsedBlog available → fetch collection fields → build fieldData here
 *
 * Inputs  (ctx): parsedBlog | fieldData, siteId, apiKey, collectionName | collectionId
 * Outputs (ctx): webflowItemId
 */

import { createItem, publishItem, getCollectionByName, getCollectionFields } from './webflow.js';
import { buildBodyHtml, buildFieldData, detectFields } from '../../../utils/htmlBuilder.js';

export const WebflowPublishModule = {
  /**
   * @param {WorkflowContext} ctx
   * @param {{ status?: 'draft' | 'publish', collectionId?: string, apiKey?: string }} config
   * @param {{ emitEvent: Function, jobId: string }} runtime
   */
  async execute(ctx, config, { emitEvent, jobId }) {
    const apiKey          = ctx.apiKey         ?? config?.apiKey         ?? null;
    const collectionName  = ctx.collectionName  ?? config?.collectionName ?? null;
    const siteId          = ctx.siteId          ?? config?.siteId         ?? null;
    const publishStatus   = ctx.publishStatus;
    const status          = config?.status      ?? publishStatus          ?? 'draft';
    const secondaryKeywords = ctx.secondaryKeywords ?? [];
    const images          = ctx.images          ?? null;

    if (!apiKey) {
      emitEvent(jobId, { type: 'step', message: '⚠️ apiKey Webflow manquant — publication ignorée' });
      return { webflowItemId: null };
    }

    // ── Resolve field data ──────────────────────────────────────────────────
    let fieldData          = ctx.fieldData          ?? null;
    let resolvedCollectionId = ctx.collectionId     ?? config?.collectionId ?? null;

    if (!fieldData) {
      const parsedBlog = ctx.parsedBlog ?? null;
      if (!parsedBlog) {
        emitEvent(jobId, { type: 'step', message: '⚠️ Aucun contenu disponible (parsedBlog manquant) — publication Webflow ignorée' });
        return { webflowItemId: null };
      }

      // Resolve collection ID from name when not provided directly
      if (!resolvedCollectionId) {
        if (!siteId || !collectionName) {
          emitEvent(jobId, { type: 'step', message: '⚠️ siteId ou collectionName manquant — publication Webflow ignorée' });
          return { webflowItemId: null };
        }
        emitEvent(jobId, { type: 'step', message: '📋 Recherche de la collection Webflow...' });
        const collection = await getCollectionByName(siteId, apiKey, collectionName);
        if (!collection) throw new Error(`Collection "${collectionName}" introuvable sur ce site Webflow.`);
        resolvedCollectionId = collection.id;
      }

      emitEvent(jobId, { type: 'step', message: '📋 Récupération des champs de la collection Webflow...' });
      const fields         = await getCollectionFields(resolvedCollectionId, apiKey);
      const detectedFields = detectFields(fields);

      const htmlBody         = ctx.htmlBody ?? buildBodyHtml(parsedBlog);
      const featuredImageUrl = images?.featured ?? null;
      const uploadedImages   = images?.content  ?? [];

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

      emitEvent(jobId, {
        type: 'step',
        message: `✅ ${fields.length} champs Webflow résolus (body → "${detectedFields.body || 'NON DÉTECTÉ'}")`,
      });
    }

    if (!resolvedCollectionId) {
      emitEvent(jobId, { type: 'step', message: '⚠️ collectionId Webflow introuvable — publication ignorée' });
      return { webflowItemId: null };
    }

    // ── Create item ─────────────────────────────────────────────────────────
    emitEvent(jobId, { type: 'step', message: '🚀 Création de l\'article dans Webflow...' });
    const createdItem = await createItem(resolvedCollectionId, apiKey, fieldData, status === 'draft');
    const itemId      = createdItem?.id ?? createdItem?.itemId;

    if (status === 'publish' && itemId) {
      await publishItem(resolvedCollectionId, apiKey, itemId);
      emitEvent(jobId, { type: 'step', message: '✅ Article publié en live sur Webflow.' });
    } else {
      emitEvent(jobId, { type: 'step', message: '✅ Article sauvegardé en brouillon dans Webflow.' });
    }

    return { webflowItemId: itemId ?? null };
  },
};
