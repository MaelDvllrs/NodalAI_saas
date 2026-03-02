/**
 * Builds the full HTML body for the Webflow rich text field
 * and maps blog content to CMS field slugs.
 */

// ── HTML body builder ─────────────────────────────────────────────────────────

export function buildBodyHtml(parsed) {
  const parts = [];

  // Introduction
  if (parsed.introduction) {
    const introHtml = parsed.introduction
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${processLinks(p)}</p>`)
      .join('\n');
    parts.push(introHtml);
  }

  // Full article content (H2/H3 + paragraphs + lists + embedded links)
  if (parsed.planMece) {
    parts.push(convertContentToHtml(parsed.planMece));
  }

  // NOTE: FAQ and visual schemas are NOT injected here.
  // Webflow API does not support HTML embed blocks inside rich text fields.
  // They are returned separately as copyable blocks for manual insertion via
  // the Webflow visual editor (Add block → Embed).

  return parts.join('\n');
}

// ── Full content → HTML ───────────────────────────────────────────────────────
/**
 * Converts the structured article content block to HTML.
 * Handles:
 *   ## H2 : Title          → <h2>
 *   ### H3 : Title         → <h3>
 *   → Description : text   → <p><strong>text</strong></p>
 *   Regular text           → <p>text</p>
 *   - bullet / * bullet    → <ul><li>...</li></ul>
 *   [[INTERNE:URL|anchor]] → <a href="URL">anchor</a>
 *   [[EXTERNE:URL|anchor]] → <a href="URL" target="_blank" rel="noopener noreferrer">anchor</a>
 */
function convertContentToHtml(content) {
  const lines = content.split('\n');
  const html = [];
  const paraBuffer = [];
  // List buffer: accumulate <li> items and flush as a single compact block
  let listItems = [];
  let listTag = 'ul';

  function flushPara() {
    if (paraBuffer.length === 0) return;
    const text = processLinks(paraBuffer.join(' ').trim());
    if (text) html.push(`<p>${text}</p>`);
    paraBuffer.length = 0;
  }

  function flushList() {
    if (listItems.length === 0) return;
    // Compact format: <ul><li>...</li><li>...</li></ul> — no whitespace inside
    html.push(`<${listTag}>${listItems.join('')}</${listTag}>`);
    listItems = [];
    listTag = 'ul';
  }

  for (const line of lines) {
    const t = line.trim();

    // Empty line → flush paragraph and list
    if (!t) {
      flushPara();
      flushList();
      continue;
    }

    // H2 header
    const h2 = t.match(/^##(?!#)\s+(?:H2\s*:\s*)?(.+)/i);
    if (h2) {
      flushPara(); flushList();
      html.push(`<h2>${escapeHtml(cleanMarkdown(h2[1].trim()))}</h2>`);
      continue;
    }

    // H3 header
    const h3 = t.match(/^###\s+(?:H3\s*:\s*)?(.+)/i);
    if (h3) {
      flushPara(); flushList();
      html.push(`<h3>${escapeHtml(cleanMarkdown(h3[1].trim()))}</h3>`);
      continue;
    }

    // Description line → bold intro paragraph
    const desc = t.match(/^→\s*(?:Description\s*:\s*)?(.+)/i);
    if (desc) {
      flushPara(); flushList();
      const text = processLinks(cleanMarkdown(desc[1].trim()));
      html.push(`<p><strong>${text}</strong></p>`);
      continue;
    }

    // Bullet list item (hyphen, en-dash, asterisk, plus, bullet)
    const bullet = t.match(/^[-–*+•]\s+(.+)/);
    if (bullet) {
      flushPara();
      if (listItems.length > 0 && listTag !== 'ul') flushList();
      listTag = 'ul';
      listItems.push(`<li>${processLinks(cleanMarkdown(bullet[1].trim()))}</li>`);
      continue;
    }

    // Numbered list item (1. or 1))
    const numbered = t.match(/^\d+[.)]\s+(.+)/);
    if (numbered) {
      flushPara();
      if (listItems.length > 0 && listTag !== 'ol') flushList();
      listTag = 'ol';
      listItems.push(`<li>${processLinks(cleanMarkdown(numbered[1].trim()))}</li>`);
      continue;
    }

    // Close list if next line is neither bullet nor numbered
    if (listItems.length > 0) { flushList(); }

    // Skip section headers and bracket-only lines
    if (/^#{1,4}/.test(t)) continue;
    if (/^\[.*\]$/.test(t)) continue;
    if (/^-{3,}$/.test(t)) continue;

    // Regular text → accumulate in paragraph buffer
    paraBuffer.push(cleanMarkdown(t));
  }

  flushPara();
  flushList();

  return html.join('\n');
}

// ── Link processor ────────────────────────────────────────────────────────────
/**
 * Converts [[INTERNE:URL|anchor]], [[EXTERNE:URL|anchor]], [[QUOTE:text]], and [[IMAGE:url|alt]] 
 * markers to HTML elements.
 * Also handles standard markdown links [text](url).
 */
function processLinks(text) {
  // Internal: [[INTERNE:URL|anchor text]]
  text = text.replace(/\[\[INTERNE:(https?:\/\/[^\|]+)\|([^\]]+)\]\]/g,
    '<a href="$1">$2</a>');

  // External: [[EXTERNE:URL|anchor text]]
  text = text.replace(/\[\[EXTERNE:(https?:\/\/[^\|]+)\|([^\]]+)\]\]/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$2</a>');

  // Blockquote: [[QUOTE:text]]
  text = text.replace(/\[\[QUOTE:([^\]]+)\]\]/g,
    '<blockquote>$1</blockquote>');

  // Image: [[IMAGE:url|alt text]]
  text = text.replace(/\[\[IMAGE:(https?:\/\/[^\|]+)\|([^\]]+)\]\]/g,
    '<figure><img src="$1" alt="$2" loading="lazy" /><figcaption style="text-align: center; font-size: 0.875rem; color: #6b7280; margin-top: 0.5rem;">$2</figcaption></figure>');

  // Markdown links [text](url) → fallback
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2">$1</a>');

  return text;
}

// ── Webflow field mapper ──────────────────────────────────────────────────────

/**
 * Builds the fieldData object to send to Webflow CMS.
 * Maps blog content to detected field slugs.
 */
export function buildFieldData(fields, parsed, bodyHtml, _isDraft, secondaryKeywords = [], featuredImageUrl = null, uploadedImages = [], resolvedRefs = {}) {
  const fieldData = {};
  const detected = detectFields(fields);

  // ── Required fields ────────────────────────────────────────────────────────
  fieldData.name = parsed.h1 || parsed.titleTag || 'Article sans titre';
  fieldData.slug = generateSlug(fieldData.name);

  // ── Body / Rich text ───────────────────────────────────────────────────────
  if (detected.body) {
    fieldData[detected.body] = bodyHtml;
  }

  // ── SEO fields ─────────────────────────────────────────────────────────────
  if (detected.metaTitle && parsed.titleTag) {
    fieldData[detected.metaTitle] = parsed.titleTag;
  }
  if (detected.metaDescription && parsed.metaDescription) {
    fieldData[detected.metaDescription] = parsed.metaDescription;
  }

  // ── Excerpt / summary → first paragraph of introduction ───────────────────
  if (detected.excerpt && parsed.introduction) {
    const firstPara = parsed.introduction.split(/\n{2,}/)[0].trim();
    fieldData[detected.excerpt] = firstPara.length > 300
      ? firstPara.substring(0, 297) + '...'
      : firstPara;
  }

  // ── Date → current date ────────────────────────────────────────────────────
  if (detected.publishDate) {
    fieldData[detected.publishDate] = new Date().toISOString();
  }

  // ── Tags → secondary keywords (PlainText comma-separated) ─────────────────
  if (detected.tags && secondaryKeywords.length > 0) {
    fieldData[detected.tags] = secondaryKeywords.slice(0, 8).join(', ');
  }

  // ── Featured Image → main blog cover image ────────────────────────────────
  if (detected.featuredImage && featuredImageUrl) {
    // Webflow API v2 format for Image fields
    fieldData[detected.featuredImage] = featuredImageUrl;
  }

  // ── Additional Image fields → use uploaded content images ────────────────
  if (detected.imageFields && detected.imageFields.length > 0 && uploadedImages.length > 0) {
    // Assign uploaded images to additional image fields (max 1 image per field)
    detected.imageFields.slice(0, uploadedImages.length).forEach((imageField, index) => {
      if (uploadedImages[index] && uploadedImages[index].url) {
        fieldData[imageField] = uploadedImages[index].url;
      }
    });
  }

  // ── Embed fields (FAQ, schemas) ────────────────────────────────────────────
  if (detected.faqEmbed && parsed.faqEmbed) {
    fieldData[detected.faqEmbed] = parsed.faqEmbed;
  }
  if (detected.schemaEmbed && parsed.schemas.length > 0) {
    fieldData[detected.schemaEmbed] = parsed.schemas.map((s) => s.code).join('\n\n');
  }

  // ── Auto-generated fields (reading time, word count, etc.) ────────────────
  // Calculate content stats
  const wordCount = calculateWordCount(bodyHtml);
  const readingTime = calculateReadingTime(wordCount);

  if (detected.readingTime) {
    fieldData[detected.readingTime] = readingTime;
  }

  if (detected.wordCount) {
    fieldData[detected.wordCount] = wordCount.toString();
  }

  if (detected.author) {
    fieldData[detected.author] = 'Rédaction'; // Default author
  }

  if (detected.category) {
    // Extract category from theme or main keyword
    fieldData[detected.category] = secondaryKeywords.length > 0 ? secondaryKeywords[0] : 'Blog';
  }

  if (detected.language) {
    fieldData[detected.language] = 'fr'; // French by default
  }

  if (detected.difficulty) {
    // Estimate difficulty based on word count and complexity
    fieldData[detected.difficulty] = estimateDifficulty(wordCount);
  }

  // ── Reference & MultiReference (IDs résolus en amont) ─────────────────
  for (const [slug, value] of Object.entries(resolvedRefs)) {
    fieldData[slug] = value;
  }

  return fieldData;
}

// ── Field detector ────────────────────────────────────────────────────────────

export function detectFields(fields) {
  const detected = { _allFields: [] };

  for (const field of fields) {
    const slug = field.slug?.toLowerCase() || '';
    const type = field.type || '';

    detected._allFields.push({ slug: field.slug, type });

    // Skip built-in Webflow system fields
    if (['name', 'slug', '_archived', '_draft'].includes(slug)) continue;

    // ── Rich text body ────────────────────────────────────────────────────────
    if (type === 'RichText') {
      const isPriority = ['body', 'content', 'post', 'article', 'texte', 'contenu', 'corps', 'richtext'].some((k) => slug.includes(k));
      if (!detected.body || isPriority) detected.body = field.slug;
    }

    // ── SEO title ─────────────────────────────────────────────────────────────
    if ((type === 'PlainText' || type === 'String') && !detected.metaTitle) {
      if (['meta-title', 'seo-title', 'title-tag', 'titre-seo', 'meta-titre', 'og-title', 'seo-tag'].some((k) => slug.includes(k))) {
        detected.metaTitle = field.slug;
      }
    }

    // ── SEO description ───────────────────────────────────────────────────────
    if ((type === 'PlainText' || type === 'String') && !detected.metaDescription) {
      if (['meta-desc', 'seo-desc', 'meta-description', 'description-seo', 'og-desc', 'description-meta'].some((k) => slug.includes(k))) {
        detected.metaDescription = field.slug;
      }
    }

    // ── Excerpt / summary ─────────────────────────────────────────────────────
    if ((type === 'PlainText' || type === 'String') && !detected.excerpt) {
      if (['excerpt', 'extrait', 'summary', 'resume', 'chapeau', 'accroche', 'intro'].some((k) => slug.includes(k))) {
        detected.excerpt = field.slug;
      }
    }

    // ── Date ──────────────────────────────────────────────────────────────────
    if (type === 'Date' && !detected.publishDate) {
      if (['date', 'published', 'created', 'publi', 'post-date'].some((k) => slug.includes(k))) {
        detected.publishDate = field.slug;
      }
    }

    // ── Tags / keywords (PlainText only) ─────────────────────────────────────
    // ⚠️ IMPORTANT: Exclure les champs "title-tag" ou "seo-tag" (ce sont des SEO titles, pas des tags)
    if ((type === 'PlainText' || type === 'String') && !detected.tags) {
      const isTitleTag = slug.includes('title') && slug.includes('tag');
      const isSeoTag = slug.includes('seo') && slug.includes('tag');
      
      if (!isTitleTag && !isSeoTag && ['tag', 'keyword', 'mot-cle', 'sujet', 'theme', 'categorie'].some((k) => slug.includes(k))) {
        detected.tags = field.slug;
      }
    }

    // ── FAQ embed ─────────────────────────────────────────────────────────────
    if ((type === 'PlainText' || type === 'String') && !detected.faqEmbed) {
      if (['faq', 'accordeon', 'faq-embed', 'questions'].some((k) => slug.includes(k))) {
        detected.faqEmbed = field.slug;
      }
    }

    // ── Schema / visual embed ─────────────────────────────────────────────────
    if ((type === 'PlainText' || type === 'String') && !detected.schemaEmbed) {
      if (['schema', 'embed', 'visuel', 'infographie', 'diagramme'].some((k) => slug.includes(k))) {
        detected.schemaEmbed = field.slug;
      }
    }

    // ── Reference (ItemRef) ───────────────────────────────────────────────
    if (type === 'ItemRef') {
      const collectionId = field.validations?.collectionId;
      if (collectionId) {
        if (!detected.referenceFields) detected.referenceFields = [];
        detected.referenceFields.push({ slug: field.slug, collectionId });
      }
    }

    // ── MultiReference (ItemRefSet) ───────────────────────────────────────
    if (type === 'ItemRefSet') {
      const collectionId = field.validations?.collectionId;
      if (collectionId) {
        if (!detected.multiReferenceFields) detected.multiReferenceFields = [];
        detected.multiReferenceFields.push({ slug: field.slug, collectionId });
      }
    }

    // ── Images (support multiple image fields) ───────────────────────────────
    if (type === 'Image') {
      // Featured/main image (priority)
      if (!detected.featuredImage && ['image', 'featured', 'thumbnail', 'cover', 'hero', 'vignette', 'miniature', 'principale'].some((k) => slug.includes(k))) {
        detected.featuredImage = field.slug;
      }
      
      // Collect all other image fields for potential use
      if (!detected.imageFields) {
        detected.imageFields = [];
      }
      if (field.slug !== detected.featuredImage) {
        detected.imageFields.push(field.slug);
      }
    }

    // ── Reading time ──────────────────────────────────────────────────────────
    if ((type === 'PlainText' || type === 'String' || type === 'Number') && !detected.readingTime) {
      if (['reading-time', 'temps-lecture', 'duree-lecture', 'read-time', 'time-to-read', 'lecture'].some((k) => slug.includes(k))) {
        detected.readingTime = field.slug;
      }
    }

    // ── Word count ────────────────────────────────────────────────────────────
    if ((type === 'PlainText' || type === 'String' || type === 'Number') && !detected.wordCount) {
      if (['word-count', 'words', 'nombre-mots', 'mots', 'word-number'].some((k) => slug.includes(k))) {
        detected.wordCount = field.slug;
      }
    }

    // ── Author ────────────────────────────────────────────────────────────────
    if ((type === 'PlainText' || type === 'String') && !detected.author) {
      if (['author', 'auteur', 'writer', 'redacteur', 'by', 'ecrit-par'].some((k) => slug.includes(k))) {
        detected.author = field.slug;
      }
    }

    // ── Category (différent de tags - plus général) ───────────────────────────
    if ((type === 'PlainText' || type === 'String') && !detected.category) {
      // Exclure les champs qui sont plutôt des tags/keywords
      const isNotTags = !slug.includes('tag') && !slug.includes('keyword');
      if (isNotTags && ['category', 'categorie', 'cat', 'type', 'rubrique'].some((k) => slug.includes(k))) {
        detected.category = field.slug;
      }
    }

    // ── Language ──────────────────────────────────────────────────────────────
    if ((type === 'PlainText' || type === 'String') && !detected.language) {
      if (['language', 'langue', 'lang', 'idiom'].some((k) => slug.includes(k))) {
        detected.language = field.slug;
      }
    }

    // ── Difficulty / Level ────────────────────────────────────────────────────
    if ((type === 'PlainText' || type === 'String') && !detected.difficulty) {
      if (['difficulty', 'level', 'niveau', 'difficulte', 'complexite'].some((k) => slug.includes(k))) {
        detected.difficulty = field.slug;
      }
    }
  }

  return detected;
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function generateSlug(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 80);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cleanMarkdown(text) {
  return String(text)
    .replace(/\*\*/g, '')
    .replace(/(?<!\w)\*(?!\w)/g, '')
    .replace(/`/g, '')
    .trim();
}

// ── Content analysis utils ────────────────────────────────────────────────────

/**
 * Calculate word count from HTML content
 * @param {string} html - HTML content
 * @returns {number} Word count
 */
function calculateWordCount(html) {
  // Strip HTML tags and count words
  const text = html.replace(/<[^>]*>/g, ' ');
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  return words.length;
}

/**
 * Calculate reading time in minutes
 * @param {number} wordCount - Number of words
 * @returns {string} Reading time (e.g., "5 min", "12 min")
 */
function calculateReadingTime(wordCount) {
  // Average reading speed: 200 words per minute
  const minutes = Math.ceil(wordCount / 200);
  return `${minutes} min`;
}

/**
 * Estimate content difficulty based on word count
 * @param {number} wordCount - Number of words
 * @returns {string} Difficulty level
 */
function estimateDifficulty(wordCount) {
  if (wordCount < 800) return 'Débutant';
  if (wordCount < 1500) return 'Intermédiaire';
  if (wordCount < 2500) return 'Avancé';
  return 'Expert';
}

// ── Image marker processor ────────────────────────────────────────────────────
/**
 * Replaces [[IMAGE:description]] markers with [[IMAGE:url|alt text]]
 * @param {string} content - Content with [[IMAGE:description]] markers
 * @param {Array<{description: string, url: string}>} images - Array of uploaded images
 * @returns {string} Content avec [[IMAGE:url|alt]] markers
 */
export function injectImageUrls(content, images) {
  if (!images || images.length === 0) return content;

  // Create a map for quick lookup
  const imageMap = new Map(images.map(img => [img.description.toLowerCase(), img.url]));

  // Replace each [[IMAGE:description]] with [[IMAGE:url|description]]
  return content.replace(/\[\[IMAGE:([^\]]+)\]\]/g, (match, description) => {
    const url = imageMap.get(description.toLowerCase());
    if (url) {
      return `[[IMAGE:${url}|${description}]]`;
    }
    // If no URL found, keep the original marker or remove it
    return '';
  });
}
