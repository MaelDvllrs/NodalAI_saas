import axios from 'axios';

function getAuthHeader() {
  const login    = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error('DataForSEO : identifiants manquants dans .env');
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
}

/**
 * Fetch the top-10 French organic results for a keyword from DataForSEO.
 *
 * Returns an array: { rank, title, description, url, domain }
 *
 * @param {string} keyword
 * @returns {Promise<SerpResult[]>}
 */
export async function fetchSerpResults(keyword) {
  const headers = {
    Authorization: getAuthHeader(),
    'Content-Type': 'application/json',
  };

  const payload = [
    {
      keyword,
      language_code: 'fr',
      location_code: 2250, // France
      device: 'desktop',
      depth: 20,
    },
  ];

  let response;
  try {
    response = await axios.post(
      'https://api.dataforseo.com/v3/serp/google/organic/live/regular',
      payload,
      { headers, timeout: 30_000 }
    );
  } catch (err) {
    console.error('[SERP] Erreur réseau DataForSEO:', err?.message);
    return [];
  }

  const task = response.data?.tasks?.[0];
  console.log(`[SERP] Statut: ${task?.status_code} — ${task?.status_message}`);

  if (task?.status_code !== 20000) {
    console.warn('[SERP] Tâche échouée:', JSON.stringify(task, null, 2));
    return [];
  }

  const items = task?.result?.[0]?.items ?? [];

  const organics = items
    .filter((i) => i.type === 'organic')
    .slice(0, 20)
    .map((i) => ({
      rank:        i.rank_group,
      title:       i.title       ?? '',
      description: i.description ?? '',
      url:         i.url         ?? '',
      domain:      i.domain      ?? '',
    }));

  console.log(`[SERP] ${organics.length} résultats organiques extraits pour "${keyword}"`);
  return organics;
}
