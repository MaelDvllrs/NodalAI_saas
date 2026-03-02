import axios from 'axios';

/**
 * Fetches and parses a sitemap.xml to extract all page URLs.
 * Handles both standard sitemaps and sitemap index files.
 */
export async function getSitemapUrls(siteUrl) {
  try {
    const base = siteUrl.replace(/\/$/, '');
    const urls = await fetchSitemap(`${base}/sitemap.xml`);
    return urls;
  } catch {
    return [];
  }
}

async function fetchSitemap(url) {
  const { data: xml } = await axios.get(url, {
    timeout: 10000,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  // Sitemap index → recurse into each child sitemap
  if (xml.includes('<sitemapindex')) {
    const childUrls = [];
    const locRegex = /<loc>(.*?)<\/loc>/gi;
    let match;
    while ((match = locRegex.exec(xml)) !== null) {
      const childUrl = match[1].trim().replace(/&amp;/g, '&');
      try {
        const childResults = await fetchSitemap(childUrl);
        childUrls.push(...childResults);
      } catch {
        // skip failed child sitemaps
      }
    }
    return childUrls;
  }

  // Standard sitemap → extract <loc> URLs
  const urls = [];
  const locRegex = /<loc>(.*?)<\/loc>/gi;
  let match;
  while ((match = locRegex.exec(xml)) !== null) {
    urls.push(match[1].trim().replace(/&amp;/g, '&'));
  }
  return urls;
}
