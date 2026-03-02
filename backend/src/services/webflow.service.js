import axios from 'axios';

const BASE_URL = 'https://api.webflow.com/v2';

function headers(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    accept: 'application/json',
  };
}

// ── Collections ───────────────────────────────────────────────────────────────
export async function getCollectionByName(siteId, apiKey, collectionName) {
  const res = await axios.get(`${BASE_URL}/sites/${siteId}/collections`, {
    headers: headers(apiKey),
  });

  const collections = res.data?.collections || [];
  const name = collectionName.toLowerCase();

  return (
    collections.find(
      (c) =>
        c.slug?.toLowerCase() === name ||
        c.displayName?.toLowerCase() === name ||
        c.singularName?.toLowerCase() === name
    ) || null
  );
}

export async function getCollectionFields(collectionId, apiKey) {
  const res = await axios.get(`${BASE_URL}/collections/${collectionId}`, {
    headers: headers(apiKey),
  });
  return res.data?.fields || [];
}

// ── Items ─────────────────────────────────────────────────────────────────────
export async function getExistingItems(collectionId, apiKey) {
  const items = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const res = await axios.get(`${BASE_URL}/collections/${collectionId}/items`, {
      headers: headers(apiKey),
      params: { offset, limit },
    });

    const page = res.data?.items || [];
    items.push(...page);

    if (page.length < limit) break;
    offset += limit;
  }

  return items;
}

export async function createItem(collectionId, apiKey, fieldData, isDraft) {
  const res = await axios.post(
    `${BASE_URL}/collections/${collectionId}/items`,
    { fieldData, isDraft, isArchived: false },
    { headers: headers(apiKey) }
  );
  return res.data;
}

export async function publishItem(collectionId, apiKey, itemId) {
  await axios.post(
    `${BASE_URL}/collections/${collectionId}/items/publish`,
    { itemIds: [itemId] },
    { headers: headers(apiKey) }
  );
}
