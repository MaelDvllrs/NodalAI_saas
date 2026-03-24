/**
 * Reddit scraper — uses Reddit's public JSON API (no auth required).
 * Fetches post metadata + top 20 comments (sorted by score) for each URL.
 */

const USER_AGENT = 'blogauto-geo-analyzer/1.0 (contact: admin@blogauto.app)';
const RATE_LIMIT_MS = 1100; // Reddit recommends ≤1 req/s

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Converts any Reddit URL variant to its canonical .json API URL.
 * Handles:
 *   https://www.reddit.com/r/sub/comments/id/slug/
 *   https://reddit.com/r/sub/comments/id/
 *   https://old.reddit.com/r/sub/comments/id/slug/
 */
function toJsonUrl(url) {
  // Normalize host
  const normalized = url
    .replace(/^https?:\/\/(old\.|new\.|www\.)?reddit\.com/, 'https://www.reddit.com')
    .replace(/\?.*$/, '')   // strip query string
    .replace(/#.*$/, '')    // strip fragment
    .replace(/\/$/, '');    // strip trailing slash

  // Must be a /comments/ URL
  if (!normalized.includes('/comments/')) {
    throw new Error(`Not a Reddit post URL: ${url}`);
  }

  return `${normalized}.json?limit=100&sort=top`;
}

/**
 * Cleans comment body text:
 * - Removes deleted/removed markers
 * - Trims whitespace
 */
function cleanBody(text) {
  if (!text || text === '[deleted]' || text === '[removed]') return null;
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Recursively flattens Reddit comment tree into a flat array.
 * Reddit returns nested "more" objects for collapsed threads — we skip those.
 */
function flattenComments(children = []) {
  const result = [];
  for (const child of children) {
    if (child.kind !== 't1') continue; // t1 = comment, skip "more"
    const d = child.data;
    const body = cleanBody(d.body);
    if (!body) continue;
    result.push({
      id: d.id,
      author: d.author ?? '[deleted]',
      body,
      score: d.score ?? 0,
      depth: d.depth ?? 0,
      created_utc: d.created_utc ?? 0,
    });
    // Recurse into replies
    if (d.replies?.data?.children?.length) {
      result.push(...flattenComments(d.replies.data.children));
    }
  }
  return result;
}

// ── Main fetch ────────────────────────────────────────────────────────────────

/**
 * Fetches a single Reddit post with its top 20 comments.
 *
 * @param {string} url — Reddit post URL (any variant)
 * @returns {object|null} — post data or null if unavailable
 */
export async function fetchRedditPost(url) {
  const jsonUrl = toJsonUrl(url);

  let res;
  try {
    res = await fetch(jsonUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
    });
  } catch (err) {
    console.warn(`[reddit-scraper] fetch error for ${url}: ${err.message}`);
    return null;
  }

  if (!res.ok) {
    console.warn(`[reddit-scraper] HTTP ${res.status} for ${url}`);
    return null;
  }

  let json;
  try {
    json = await res.json();
  } catch {
    console.warn(`[reddit-scraper] JSON parse error for ${url}`);
    return null;
  }

  // Reddit returns [postListing, commentsListing]
  if (!Array.isArray(json) || json.length < 2) return null;

  const postChildren = json[0]?.data?.children ?? [];
  if (!postChildren.length) return null;

  const post = postChildren[0]?.data;
  if (!post) return null;

  // Post is deleted or removed
  const selftext = cleanBody(post.selftext);
  if (post.removed_by_category) {
    console.warn(`[reddit-scraper] post removed: ${url}`);
  }

  // Flatten + sort all comments by score descending → keep top 20
  const allComments = flattenComments(json[1]?.data?.children ?? []);
  const top20 = allComments
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(({ id: _id, depth: _depth, created_utc: _ts, ...rest }) => rest); // keep author, body, score

  return {
    url,
    subreddit: post.subreddit ?? '',
    subredditPrefixed: post.subreddit_name_prefixed ?? `r/${post.subreddit}`,
    title: post.title ?? '',
    selftext: selftext ?? '',
    score: post.score ?? 0,
    upvoteRatio: post.upvote_ratio ?? null,
    numComments: post.num_comments ?? 0,
    author: post.author ?? '[deleted]',
    created_utc: post.created_utc ?? 0,
    postType: post.is_self ? 'text' : (post.is_video ? 'video' : 'link'),
    flair: post.link_flair_text ?? null,
    permalink: `https://www.reddit.com${post.permalink}`,
    comments: top20,
  };
}

/**
 * Fetches multiple Reddit posts sequentially with rate limiting.
 *
 * @param {string[]} urls — list of Reddit post URLs
 * @param {function} [onProgress] — optional callback(current, total, post)
 * @returns {object[]} — array of fetched posts (nulls removed)
 */
export async function fetchRedditPosts(urls, onProgress) {
  const unique = [...new Set(urls.filter(u => u?.includes('reddit.com/r/')))];
  const results = [];

  for (let i = 0; i < unique.length; i++) {
    const url = unique[i];
    const post = await fetchRedditPost(url);
    if (post) {
      results.push(post);
      onProgress?.(i + 1, unique.length, post);
    }
    // Rate limit — skip delay after last request
    if (i < unique.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  return results;
}
