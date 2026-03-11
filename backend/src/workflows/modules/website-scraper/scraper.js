/**
 * scraper.js — HTTP fetch + HTML parsing utilities for website-scraper module.
 *
 * Does NOT use a headless browser: works via plain HTTP + cheerio.
 * Sufficient for most static/SSR sites (WordPress, Webflow, Squarespace...).
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const HTTP_TIMEOUT = 15_000;
const MAX_SITEMAP_URLS = 200;
const USER_AGENT =
  'Mozilla/5.0 (compatible; AutoBlogBot/1.0; +https://github.com/your-org/auto-blog)';

/** @param {string} url */
function normalise(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname.replace(/\/$/, '') || '/';
  } catch {
    return url;
  }
}

/**
 * Fetch a raw URL and return the text body. Returns null on error.
 * @param {string} url
 * @returns {Promise<string|null>}
 */
async function fetchText(url) {
  try {
    const res = await axios.get(url, {
      timeout: HTTP_TIMEOUT,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,text/xml,*/*' },
      maxRedirects: 5,
      validateStatus: (s) => s < 400,
    });
    return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  } catch {
    return null;
  }
}

/**
 * Parse a sitemap XML (regular or sitemap index) and return all page URLs.
 * @param {string} sitemapUrl
 * @returns {Promise<string[]>}
 */
export async function parseSitemap(sitemapUrl) {
  const xml = await fetchText(sitemapUrl);
  if (!xml) return [];

  const $ = cheerio.load(xml, { xmlMode: true });
  const urls = [];

  // Sitemap index → recurse into child sitemaps (one level)
  const sitemapLocs = $('sitemapindex sitemap loc');
  if (sitemapLocs.length > 0 && urls.length === 0) {
    const childUrls = sitemapLocs.map((_, el) => $(el).text().trim()).get();
    for (const childUrl of childUrls.slice(0, 5)) {
      const childXml = await fetchText(childUrl);
      if (!childXml) continue;
      const $c = cheerio.load(childXml, { xmlMode: true });
      $c('urlset url loc').each((_, el) => urls.push($c(el).text().trim()));
      if (urls.length >= MAX_SITEMAP_URLS) break;
    }
    return urls.slice(0, MAX_SITEMAP_URLS);
  }

  // Regular sitemap
  $('urlset url loc').each((_, el) => urls.push($(el).text().trim()));
  return urls.slice(0, MAX_SITEMAP_URLS);
}

/**
 * Scrape a single HTML page and return structured metadata.
 * @param {string} url
 * @returns {Promise<PageData|null>}
 */
export async function scrapePage(url) {
  const html = await fetchText(url);
  if (!html) return null;

  const $ = cheerio.load(html);

  // Remove noise
  $('script, style, noscript, iframe, svg, nav, footer, header, [aria-hidden="true"]').remove();

  const title = $('title').first().text().trim()
    || $('h1').first().text().trim()
    || '';

  const metaDescription = $('meta[name="description"]').attr('content')?.trim()
    || $('meta[property="og:description"]').attr('content')?.trim()
    || '';

  const h1 = $('h1').first().text().trim();
  const h2s = $('h2').map((_, el) => $(el).text().trim()).get().filter(Boolean).slice(0, 10);

  // Body text (first ~1 500 chars of article / main)
  const mainEl = $('article, main, [role="main"], .content, #content, body').first();
  const bodyText = mainEl.text().replace(/\s+/g, ' ').trim().slice(0, 1500);

  // Internal links
  const origin = new URL(url).origin;
  const internalLinks = $('a[href]')
    .map((_, el) => {
      try {
        const href = new URL($(el).attr('href') ?? '', url).href;
        return href.startsWith(origin) ? normalise(href) : null;
      } catch {
        return null;
      }
    })
    .get()
    .filter(Boolean);

  // Unique, deduplicated
  const uniqueLinks = [...new Set(internalLinks)].slice(0, 50);

  // Canonical / language
  const canonical = $('link[rel="canonical"]').attr('href')?.trim() || url;
  const lang = $('html').attr('lang')?.slice(0, 2) || 'fr';

  return { url, title, metaDescription, h1, h2s, bodyText, internalLinks: uniqueLinks, canonical, lang };
}

/**
 * Discover the most important pages of a site by scraping the homepage
 * and picking representative internal links (blog, about, services...).
 *
 * @param {string} siteUrl
 * @param {{ sitemapUrls?: string[], maxPages?: number }} opts
 * @returns {Promise<PageData[]>}
 */
export async function scrapeKeypages(siteUrl, { sitemapUrls = [], maxPages = 6 } = {}) {
  const scraped = [];
  const seen = new Set();

  /** Helper — scrape and push if not already seen */
  async function visit(url) {
    const norm = normalise(url);
    if (seen.has(norm)) return;
    seen.add(norm);
    const page = await scrapePage(url);
    if (page) scraped.push(page);
  }

  // 1. Homepage is always first
  await visit(siteUrl);

  // 2. Look for blog/article pages in sitemap URLs
  const blogUrls = sitemapUrls.filter(u =>
    /\/(blog|article|post|news|actualite|guide)[s/]/i.test(u)
  ).slice(0, 3);
  for (const u of blogUrls) await visit(u);

  // 3. Pick diverse internal links from homepage
  const homepage = scraped[0];
  if (homepage && scraped.length < maxPages) {
    const prioritised = homepage.internalLinks.filter(u => {
      const p = new URL(u, siteUrl).pathname.toLowerCase();
      return /\/(about|qui|services|solutions|contact|blog|guide)/i.test(p);
    });
    for (const u of prioritised.slice(0, maxPages - scraped.length)) {
      await visit(u);
    }
  }

  return scraped.slice(0, maxPages);
}
