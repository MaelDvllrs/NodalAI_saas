/**
 * verifySourceUrls.js — Filters out dead URLs (404, 410) from a source list.
 *
 * Checks each URL with a HEAD request (5s timeout, 10 concurrent).
 * Removes sources that return 4xx client errors (404, 410).
 * Keeps sources with no URL, network errors, or 5xx (temporarily unavailable).
 */

const CONCURRENCY  = 10;
const TIMEOUT_MS   = 5000;
// Only truly dead pages: 404 Not Found, 410 Gone
const DEAD_STATUSES = new Set([404, 410]);

/**
 * @param {{ name: string, url: string|null, type: string, frequency?: number }[]} sources
 * @param {{ emitEvent: Function, jobId: string }} runtime
 * @returns {Promise<typeof sources>}
 */
export async function verifySourceUrls(sources, { emitEvent, jobId }) {
  const withUrl    = sources.filter(s => s.url);
  const withoutUrl = sources.filter(s => !s.url);

  if (withUrl.length === 0) return sources;

  emitEvent(jobId, { type: 'step', message: `🔗 Vérification de ${withUrl.length} URL(s)...` });

  const results = [];

  // Process in batches of CONCURRENCY
  for (let i = 0; i < withUrl.length; i += CONCURRENCY) {
    const batch = withUrl.slice(i, i + CONCURRENCY);
    const checks = await Promise.allSettled(
      batch.map(src => checkUrl(src.url))
    );

    for (let j = 0; j < batch.length; j++) {
      const src    = batch[j];
      const result = checks[j];

      if (result.status === 'fulfilled') {
        const status = result.value;
        if (DEAD_STATUSES.has(status)) {
          emitEvent(jobId, { type: 'step', message: `  🗑️ Supprimée (${status}) : ${src.url}` });
        } else {
          results.push(src);
        }
      } else {
        // Network error / timeout — keep the source (server might block bots)
        results.push(src);
      }
    }
  }

  const removed = withUrl.length - results.length;
  if (removed > 0) {
    emitEvent(jobId, { type: 'step', message: `✅ Vérification terminée — ${removed} URL(s) morte(s) supprimée(s), ${results.length} conservée(s)` });
  } else {
    emitEvent(jobId, { type: 'step', message: `✅ Vérification terminée — toutes les URLs sont valides` });
  }

  return [...results, ...withoutUrl];
}

/**
 * Checks a single URL via HEAD request (fallback to GET if 405).
 * @param {string} url
 * @returns {Promise<number>} HTTP status code
 */
async function checkUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method:   'HEAD',
      signal:   controller.signal,
      redirect: 'follow',
      headers:  { 'User-Agent': 'Mozilla/5.0 (compatible; GEO-bot/1.0)' },
    });

    // Some servers don't support HEAD — retry with GET
    if (res.status === 405) {
      const res2 = await fetch(url, {
        method:   'GET',
        signal:   controller.signal,
        redirect: 'follow',
        headers:  { 'User-Agent': 'Mozilla/5.0 (compatible; GEO-bot/1.0)' },
      });
      return res2.status;
    }

    return res.status;
  } finally {
    clearTimeout(timer);
  }
}
