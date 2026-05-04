import axios from 'axios';

const BASE_URL = 'https://api.webflow.com/v2';

function headers(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    accept: 'application/json',
  };
}

// Extracts the most useful error message from an Axios error (includes Webflow body)
function wfError(err, label) {
  const body = err?.response?.data;
  const status = err?.response?.status;
  const detail = body
    ? (typeof body === 'string' ? body : JSON.stringify(body))
    : err.message;
  const msg = `[Webflow] ${label} → ${status ?? ''} ${detail}`;
  console.error(msg);
  return new Error(msg);
}

// ── Collections ───────────────────────────────────────────────────────────────

export async function getCollectionByName(siteId, apiKey, collectionName) {
  try {
    const res = await axios.get(`${BASE_URL}/sites/${siteId}/collections`, {
      headers: headers(apiKey),
    });
    const collections = res.data?.collections || [];
    const name = collectionName.toLowerCase();
    return (
      collections.find(
        (c) =>
          c.slug?.toLowerCase()         === name ||
          c.displayName?.toLowerCase()  === name ||
          c.singularName?.toLowerCase() === name
      ) || null
    );
  } catch (err) {
    throw wfError(err, 'getCollectionByName');
  }
}

export async function getCollectionFields(collectionId, apiKey) {
  try {
    const res = await axios.get(`${BASE_URL}/collections/${collectionId}`, {
      headers: headers(apiKey),
    });
    return res.data?.fields || [];
  } catch (err) {
    throw wfError(err, 'getCollectionFields');
  }
}

// ── Items ─────────────────────────────────────────────────────────────────────

export async function getExistingItems(collectionId, apiKey) {
  const items = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    try {
      const res = await axios.get(`${BASE_URL}/collections/${collectionId}/items`, {
        headers: headers(apiKey),
        params: { offset, limit },
      });
      const page = res.data?.items || [];
      items.push(...page);
      if (page.length < limit) break;
      offset += limit;
    } catch (err) {
      throw wfError(err, 'getExistingItems');
    }
  }

  return items;
}

export async function createItem(collectionId, apiKey, fieldData, isDraft) {
  try {
    const res = await axios.post(
      `${BASE_URL}/collections/${collectionId}/items`,
      { fieldData, isDraft, isArchived: false },
      { headers: headers(apiKey) }
    );
    return res.data;
  } catch (err) {
    throw wfError(err, 'createItem');
  }
}

/**
 * Creates one CMS item variant per locale in one bulk call.
 * Webflow does NOT auto-create secondary locale variants on createItem —
 * they must all be seeded in a single POST /items/bulk so PATCH can update them.
 * @param {string[]} cmsLocaleIds  primary locale ID first, then secondary IDs
 * @returns {string|null} shared itemId
 */
export async function createItemBulk(collectionId, apiKey, fieldData, cmsLocaleIds, isDraft) {
  try {
    const res = await axios.post(
      `${BASE_URL}/collections/${collectionId}/items/bulk`,
      { fieldData, cmsLocaleIds, isDraft, isArchived: false },
      { headers: headers(apiKey) }
    );
    const created = res.data?.items ?? res.data;
    return Array.isArray(created) ? (created[0]?.id ?? null) : (res.data?.id ?? null);
  } catch (err) {
    throw wfError(err, 'createItemBulk');
  }
}

export async function publishItem(collectionId, apiKey, itemId) {
  try {
    await axios.post(
      `${BASE_URL}/collections/${collectionId}/items/publish`,
      { itemIds: [itemId] },
      { headers: headers(apiKey) }
    );
  } catch (err) {
    throw wfError(err, 'publishItem');
  }
}

// ── Localization ───────────────────────────────────────────────────────────────

/**
 * Returns the locales for a site.
 * @returns {{ primary: { cmsLocaleId, tag }, secondary: { cmsLocaleId, tag }[] }}
 */
export async function getSiteLocales(siteId, apiKey) {
  try {
    const res = await axios.get(`${BASE_URL}/sites/${siteId}`, {
      headers: headers(apiKey),
    });
    return res.data?.locales ?? { primary: null, secondary: [] };
  } catch (err) {
    throw wfError(err, 'getSiteLocales');
  }
}

/**
 * Updates an existing CMS item for a specific secondary locale.
 * Uses the bulk PATCH endpoint so a single call covers one locale.
 */
export async function updateItemForLocale(collectionId, apiKey, itemId, cmsLocaleId, fieldData, isDraft) {
  try {
    const res = await axios.patch(
      `${BASE_URL}/collections/${collectionId}/items`,
      { items: [{ id: itemId, cmsLocaleId, fieldData, isDraft, isArchived: false }] },
      { headers: headers(apiKey) }
    );
    return res.data;
  } catch (err) {
    throw wfError(err, `updateItemForLocale(${cmsLocaleId})`);
  }
}
