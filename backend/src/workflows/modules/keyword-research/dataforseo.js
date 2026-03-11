import axios from 'axios';

const BASE_URL = 'https://api.dataforseo.com/v3';

function getAuthHeader() {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error('DataForSEO : identifiants manquants dans .env');
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
}

/**
 * Normalize competition to a 0–100 index regardless of which field DataForSEO fills.
 * competition_index is often null for non-commercial keywords; fall back to the
 * qualitative `competition` field (HIGH / MEDIUM / LOW / UNKNOWN).
 */
function resolveCompetitionIndex(item) {
  if (item.competition_index != null) return item.competition_index;
  const map = { HIGH: 80, MEDIUM: 50, LOW: 20, UNKNOWN: 50 };
  return map[item.competition?.toUpperCase?.()] ?? 50;
}

/**
 * Score a keyword candidate based on SEO opportunity:
 *  - Rewards sufficient search volume (sweet spot 500–10 000/mo)
 *  - Penalises high competition (competition_index 0–100, lower = easier to rank)
 *  - Rewards long-tail keywords (3+ words) — more targeted, easier to rank
 *  - Penalises single-word generic terms
 */
function scoreKeyword(item) {
  const volume    = item.search_volume  || 0;
  const compIndex = resolveCompetitionIndex(item);
  const wordCount = item.keyword.trim().split(/\s+/).length;

  const volumeScore  = volume > 0 ? Math.log10(volume) : 0;
  const compPenalty  = compIndex / 100;
  const longTailBonus = wordCount === 1 ? 0 : wordCount === 2 ? 0.3 : 0.6;

  return volumeScore * (1 - compPenalty * 0.5) + longTailBonus;
}

/**
 * Get search volume & competition metrics for a specific list of keywords.
 * Uses the google_ads/search_volume endpoint — returns exact metrics per keyword.
 */
export async function getKeywordsMetrics(keywords) {
  const headers = {
    Authorization: getAuthHeader(),
    'Content-Type': 'application/json',
  };

  const payload = [{ keywords, language_code: 'fr', location_code: 2250 }];

  const response = await axios.post(
    `${BASE_URL}/keywords_data/google_ads/search_volume/live`,
    payload,
    { headers }
  );

  const task0 = response.data?.tasks?.[0];
  console.log(`[DataForSEO/search_volume] Statut: ${task0?.status_code} — ${task0?.status_message}`);

  if (task0?.status_code !== 20000) {
    console.log(`[DataForSEO/search_volume] Réponse complète:`, JSON.stringify(response.data, null, 2));
    return [];
  }

  const items = task0?.result || [];
  console.log(`[DataForSEO/search_volume] Résultats (${items.length}):`);
  items.forEach(i =>
    console.log(`  "${i.keyword}" — volume: ${i.search_volume}, competition: ${i.competition}, competition_index: ${i.competition_index}`)
  );

  return items;
}

/**
 * Given a theme and Claude-suggested candidates, pick the best keyword via DataForSEO metrics.
 */
export async function getBestKeywordFromCandidates(theme, candidates) {
  const allKeywords = candidates.length > 0 ? candidates : [theme];

  let items = [];
  try {
    items = await getKeywordsMetrics(allKeywords);
  } catch (err) {
    console.error(`[DataForSEO] Erreur getKeywordsMetrics:`, err?.response?.data ?? err?.message);
  }

  if (items.length === 0) {
    return { keyword: candidates[0] || theme, kd: null, search_volume: null };
  }

  const scored = items
    .filter(i => i.keyword && (i.search_volume ?? 0) >= 10)
    .map(i => ({ ...i, _score: scoreKeyword(i) }))
    .sort((a, b) => b._score - a._score);

  const best = scored[0] || items[0];
  const resolvedKd = best ? resolveCompetitionIndex(best) : null;

  console.log(
    `[DataForSEO] Meilleur candidat: "${best?.keyword}" (volume: ${best?.search_volume}, compétition: ${resolvedKd}/100, score: ${scored[0]?._score?.toFixed(2) ?? 'N/A'})`
  );

  return {
    keyword: best?.keyword ?? (candidates[0] || theme),
    kd: resolvedKd,
    search_volume: best?.search_volume ?? null,
  };
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
        location_code: 2250,
        limit: 50,
        order_by: ['search_volume,desc'],
      },
    ];

    const response = await axios.post(
      `${BASE_URL}/keywords_data/google_ads/keywords_for_keywords/live`,
      payload,
      { headers }
    );

    const tasks = response.data?.tasks;
    const task0 = tasks?.[0];

    console.log(`[DataForSEO] Statut tâche: ${task0?.status_code} — ${task0?.status_message}`);

    if (!tasks || task0?.status_code !== 20000) {
      console.log(`[DataForSEO] Échec API — réponse complète:`, JSON.stringify(response.data, null, 2));
      return { keyword: theme, kd: null, warning: task0?.status_message };
    }

    const items = task0?.result?.[0]?.items;

    console.log(`[DataForSEO] Nombre de résultats bruts: ${items?.length ?? 0}`);
    if (items?.length > 0) {
      console.log(`[DataForSEO] Top 5 résultats bruts:`);
      items.slice(0, 5).forEach((i, idx) =>
        console.log(`  [${idx + 1}] "${i.keyword}" — volume: ${i.search_volume}, competition: ${i.competition}, competition_index: ${i.competition_index}`)
      );
    }

    if (!items || items.length === 0) {
      console.log(`[DataForSEO] Aucun item retourné pour le thème "${theme}"`);
      return { keyword: theme, kd: null };
    }

    const candidates = items.filter(
      i => i.keyword && i.search_volume >= 50 && i.keyword.toLowerCase() !== theme.toLowerCase()
    );

    const pool = candidates.length > 0 ? candidates : items.filter(i => i.search_volume > 0);

    const scored = pool
      .map(i => ({ ...i, _score: scoreKeyword(i) }))
      .sort((a, b) => b._score - a._score);

    const best = scored[0];
    const resolvedKd = best ? resolveCompetitionIndex(best) : null;

    console.log(
      `[DataForSEO] Thème: "${theme}" → Mot-clé retenu: "${best?.keyword}" ` +
      `(volume: ${best?.search_volume}, compétition: ${resolvedKd}/100, score: ${best?._score?.toFixed(2)})`
    );

    return {
      keyword: best ? best.keyword : theme,
      kd: resolvedKd,
      search_volume: best?.search_volume ?? null,
    };
  } catch (err) {
    console.error(`[DataForSEO] Erreur pour le thème "${theme}":`, err?.response?.data ?? err?.message ?? err);
    return { keyword: theme, kd: null, warning: 'DataForSEO indisponible' };
  }
}
