/**
 * claudeRetry.js
 *
 * Wrapper autour de client.messages.create() avec retry automatique
 * sur les erreurs transitoires Anthropic :
 *   - 529 overloaded_error
 *   - 529 / 500 / 503 (status codes)
 *   - rate_limit_error (429)
 *
 * Stratégie : backoff exponentiel avec jitter
 *   Tentative 1 : immédiate
 *   Tentative 2 : ~2s
 *   Tentative 3 : ~4s
 *   Tentative 4 : ~8s  (max 3 retries par défaut)
 */

const RETRYABLE_TYPES = new Set([
  'overloaded_error',
  'rate_limit_error',
  'api_error',
]);

const RETRYABLE_STATUS = new Set([429, 500, 503, 529]);

function isRetryable(err) {
  if (!err) return false;
  // Anthropic SDK wraps errors with .status and .error.type
  if (err.status && RETRYABLE_STATUS.has(err.status)) return true;
  if (err.error?.type && RETRYABLE_TYPES.has(err.error.type)) return true;
  // Fallback: check message string
  if (typeof err.message === 'string' && /overloaded|rate.?limit|529|503/i.test(err.message)) return true;
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {import('@anthropic-ai/sdk').default} client  - Anthropic client instance
 * @param {object} params                               - Params for client.messages.create()
 * @param {object} [opts]
 * @param {number} [opts.maxRetries=3]                  - Maximum number of retries
 * @param {number} [opts.baseDelayMs=2000]              - Base delay in ms (doubled each retry)
 * @returns {Promise<import('@anthropic-ai/sdk').Message>}
 */
export async function claudeCreate(client, params, { maxRetries = 3, baseDelayMs = 2000 } = {}) {
  let lastErr;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await client.messages.create(params);
    } catch (err) {
      lastErr = err;

      if (!isRetryable(err) || attempt === maxRetries) {
        throw err;
      }

      // Exponential backoff with ±20% jitter
      const delay = baseDelayMs * Math.pow(2, attempt) * (0.8 + Math.random() * 0.4);
      console.warn(
        `[Claude] Erreur ${err.status ?? '?'} (${err.error?.type ?? err.message?.slice(0, 40)}) — ` +
        `retry ${attempt + 1}/${maxRetries} dans ${Math.round(delay)}ms...`
      );
      await sleep(delay);
    }
  }

  throw lastErr;
}
