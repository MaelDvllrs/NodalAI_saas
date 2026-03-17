/**
 * Module: Webflow Structure
 *
 * Fetches the structure of a Webflow CMS collection (fields + detected field map)
 * and injects it into the pipeline context so downstream modules (blog-generation,
 * webflow-publish) can use it without making their own API calls.
 *
 * Place this module BEFORE blog-generation to let the generation step build
 * correctly typed fieldData right away.
 *
 * Inputs  (config only): apiKey, siteId, collectionName
 * Outputs (ctx): collectionId, webflowFields, detectedFields
 */

import { getCollectionByName, getCollectionFields } from '../webflow-publish/webflow.js';
import { detectFields } from '../../../utils/htmlBuilder.js';

export const WebflowStructureModule = {
  /**
   * @param {WorkflowContext} ctx
   * @param {{ apiKey?: string, siteId?: string, collectionName?: string }} config
   * @param {{ emitEvent: Function, jobId: string }} runtime
   */
  async execute(ctx, config, { emitEvent, jobId }) {
    const apiKey         = config?.apiKey         ?? ctx.apiKey         ?? null;
    const siteId         = config?.siteId         ?? ctx.siteId         ?? null;
    const collectionName = config?.collectionName ?? ctx.collectionName ?? null;

    if (!apiKey || !siteId || !collectionName) {
      emitEvent(jobId, {
        type: 'step',
        message: '⚠️ apiKey, siteId ou collectionName manquant — structure Webflow ignorée',
      });
      return {};
    }

    emitEvent(jobId, { type: 'step', message: '📋 Récupération de la structure Webflow...' });

    const collection = await getCollectionByName(siteId, apiKey, collectionName);
    if (!collection) {
      throw new Error(`Collection "${collectionName}" introuvable sur ce site Webflow.`);
    }

    const fields         = await getCollectionFields(collection.id, apiKey);
    const detectedFields = detectFields(fields);

    emitEvent(jobId, {
      type: 'step',
      message: `✅ Structure Webflow récupérée : ${fields.length} champ${fields.length > 1 ? 's' : ''} (body → "${detectedFields.body || 'NON DÉTECTÉ'}")`,
    });

    return {
      collectionId:   collection.id,
      webflowFields:  fields,
      detectedFields,
    };
  },
};
