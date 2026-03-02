import axios from 'axios';

const BASE_URL = 'https://api.dataforseo.com/v3';

function getAuthHeader() {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error('DataForSEO : identifiants manquants dans .env');
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
}

/**
 * Score a keyword candidate based on SEO opportunity:
 *  - Rewards sufficient search volume (sweet spot 500–10 000/mo)
 *  - Penalises high competition (competition_index 0–100, lower = easier to rank)
 *  - Rewards long-tail keywords (3+ words) — more targeted, easier to rank
 *  - Penalises single-word generic terms
 */
function scoreKeyword(item) {
  const volume     = item.search_volume   || 0;
  const compIndex  = item.competition_index ?? 50; // default mid if missing
  const wordCount  = item.keyword.trim().split(/\s+/).length;

  // Volume score: logarithmic — big gap between 100 vs 1 000 but not 10 000 vs 100 000
  const volumeScore = volume > 0 ? Math.log10(volume) : 0;

  // Competition penalty: 0 = no penalty, 100 = strong penalty
  const compPenalty = compIndex / 100;

  // Long-tail bonus: 1 word = 0, 2 words = 0.3, 3+ words = 0.6
  const longTailBonus = wordCount === 1 ? 0 : wordCount === 2 ? 0.3 : 0.6;

  return volumeScore * (1 - compPenalty * 0.5) + longTailBonus;
}

/**
 * Retrieve the best main keyword for a given theme using DataForSEO.
 * Uses the "keywords for keywords" endpoint targeting French/France.
 * Selects the keyword with the best SEO opportunity score (volume / competition / long-tail).
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
        limit: 50,           // Wider pool for better selection
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

    // Filter: must have search volume, exclude exact theme repetition
    const candidates = items.filter(
      (i) => i.keyword && i.search_volume >= 50 && i.keyword.toLowerCase() !== theme.toLowerCase()
    );

    // Fall back to all items if filtering removed everything
    const pool = candidates.length > 0 ? candidates : items.filter((i) => i.search_volume > 0);

    // Score and pick the best opportunity
    const scored = pool
      .map((i) => ({ ...i, _score: scoreKeyword(i) }))
      .sort((a, b) => b._score - a._score);

    const best = scored[0];

    console.log(
      `[DataForSEO] Thème: "${theme}" → Mot-clé retenu: "${best?.keyword}" ` +
      `(volume: ${best?.search_volume}, compétition: ${best?.competition_index}, score: ${best?._score?.toFixed(2)})`
    );

    return {
      keyword: best ? best.keyword : theme,
      kd: best?.competition_index ?? null,
      search_volume: best?.search_volume ?? null,
    };
  } catch {
    // DataForSEO unavailable (no credits, network error, etc.) — fall back to theme
    return { keyword: theme, kd: null, warning: 'DataForSEO indisponible' };
  }
}
