import axios from 'axios';

const BASE_URL = 'https://api.dataforseo.com/v3';

function getAuthHeader() {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error('DataForSEO : identifiants manquants dans .env');
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
}

/**
 * Retrieve the best main keyword for a given theme using DataForSEO.
 * Uses the "keywords for keywords" endpoint targeting French/France.
 */
export async function getMainKeyword(theme) {
  try {
    const headers = {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    };

    const payload = [
      {
        keywords: [theme],
        language_code: 'fr',
        location_code: 2250, // France
        limit: 20,
        order_by: ['search_volume,desc'],
      },
    ];

    const response = await axios.post(
      `${BASE_URL}/keywords_data/google_ads/keywords_for_keywords/live`,
      payload,
      { headers }
    );

    const tasks = response.data?.tasks;
    if (!tasks || tasks[0]?.status_code !== 20000) {
      return { keyword: theme, kd: null, warning: tasks?.[0]?.status_message };
    }

    const items = tasks[0]?.result?.[0]?.items;
    if (!items || items.length === 0) {
      return { keyword: theme, kd: null };
    }

    // Pick keyword with highest search volume, skip the exact theme term if possible
    const sorted = items
      .filter((i) => i.keyword && i.search_volume > 0)
      .sort((a, b) => b.search_volume - a.search_volume);

    const best = sorted.find((i) => i.keyword.toLowerCase() !== theme.toLowerCase()) || sorted[0];
    const keyword = best ? best.keyword : theme;

    // Use competition_index (0–100) as a KD proxy — already included in the response, no extra API call
    const kd = best?.competition_index ?? null;

    return { keyword, kd };
  } catch {
    // DataForSEO unavailable (no credits, network error, etc.) — fall back to theme
    return { keyword: theme, kd: null, warning: 'DataForSEO indisponible' };
  }
}
