/**
 * Parses Claude's structured blog output into discrete sections.
 * Line-by-line approach — tolerant of Claude formatting variations.
 */
export function parseBlogContent(raw) {
  const result = {
    titleTag: '',
    metaDescription: '',
    h1: '',
    introduction: '',
    planMece: '',   // full article content (H2/H3 + paragraphs + links integrated)
    faqEmbed: '',
    schemas: [],
    raw,
  };

  // Normalize line endings (CRLF → LF)
  const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n');

  // ── 1. Find section boundaries by scanning for "N." headers ────────────────
  // sections[N] = { start: lineIndex, end: lineIndex }
  const sections = {};

  for (let i = 0; i < lines.length; i++) {
    const n = detectSectionNum(lines[i]);
    if (n !== null) {
      sections[n] = { start: i, end: lines.length };
      // Close all previously unclosed sections
      for (let prev = 1; prev < n; prev++) {
        if (sections[prev] && sections[prev].end === lines.length) {
          sections[prev].end = i;
        }
      }
    }
  }

  // ── 2. Extract content per section ─────────────────────────────────────────
  // New prompt structure: 1=title, 2=meta, 3=H1, 4=intro, 5=full content, 6=FAQ, 7=schemas
  // Also handle old structure (8=FAQ, 9=schemas) as fallback
  if (sections[1]) result.titleTag        = extractShort(lines, sections[1]);
  if (sections[2]) result.metaDescription = extractShort(lines, sections[2]);
  if (sections[3]) result.h1              = extractShort(lines, sections[3]);
  if (sections[4]) result.introduction    = extractParagraphs(lines, sections[4]);
  if (sections[5]) result.planMece        = extractBlock(lines, sections[5]);
  // New structure: FAQ=6, Schemas=7
  if (sections[6]) result.faqEmbed        = extractHtmlCode(lines, sections[6]);
  if (sections[7]) result.schemas         = extractSchemasList(lines, sections[7]);
  // Old structure fallback: FAQ=8, Schemas=9
  if (!result.faqEmbed  && sections[8]) result.faqEmbed = extractHtmlCode(lines, sections[8]);
  if (!result.schemas.length && sections[9]) result.schemas = extractSchemasList(lines, sections[9]);

  // ── 3. Fallbacks ────────────────────────────────────────────────────────────
  if (!result.h1 && result.titleTag) result.h1 = result.titleTag;
  if (!result.titleTag && result.h1) result.titleTag = result.h1;

  return result;
}

// ── Section header detection ──────────────────────────────────────────────────
/**
 * Returns 1-9 if the line is a section header like "### 1. TITLE TAG",
 * "## 1.", "**1.**", etc. Returns null otherwise.
 * Only looks for top-level sections (digits 1-9) to avoid confusing ## H2
 * or numbered list items within content.
 */
function detectSectionNum(line) {
  const t = line.trim();
  if (!t) return null;

  // Must either start with # (markdown heading) or ** (bold heading)
  // to avoid matching numbered list items inside article content
  const isHeading = /^#{1,4}/.test(t) || /^\*{1,2}\d/.test(t);
  if (!isHeading) return null;

  // Strip leading #, *, spaces to get the bare content
  const stripped = t.replace(/^[#\s*]+/, '').replace(/\*+$/, '').trim();

  // Match "N." or "N " at the start (N = single digit 1-9)
  const m = stripped.match(/^([1-9])[.\s:]+/);
  if (!m) return null;

  return parseInt(m[1]);
}

// ── Content extractors ────────────────────────────────────────────────────────

/**
 * Extract a short single-line value (title tag, meta description, H1).
 * Picks the first meaningful non-instruction line.
 */
function extractShort(lines, { start, end }) {
  for (let i = start; i < end; i++) {
    const t = lines[i].trim();
    if (!t) continue;

    // Skip section headers
    if (/^#{1,4}/.test(t)) continue;
    if (/^\*+#/.test(t)) continue;

    // Skip Webflow field markers [Champ Webflow : ...]
    if (/^\[.*\]$/.test(t)) continue;

    // Skip horizontal rules
    if (/^-{3,}$/.test(t)) continue;

    // Skip lines that look like instructions echoed from the system prompt
    if (/^(Rédige|Génère|Crée|Écris|Inclus|Intègre|Formulez|Produire|Contrainte|Il doit|Elle doit|Format)/i.test(t)) continue;

    // This is the actual content — clean it up (strip all markdown for plain-text fields)
    const cleaned = cleanMarkdownPlain(t);
    if (cleaned.length > 4) return cleaned;
  }
  return '';
}

/**
 * Extract multi-paragraph text (introduction).
 * Preserves paragraph breaks.
 */
function extractParagraphs(lines, { start, end }) {
  const out = [];

  for (let i = start; i < end; i++) {
    const t = lines[i].trim();

    // Skip ALL heading lines (section markers, BLOC sub-labels like #### BLOC A)
    if (/^#{1,4}/.test(t)) continue;
    if (/^\*{1,2}\d/.test(t)) continue;

    if (/^\[.*\]$/.test(t)) continue;
    if (/^-{3,}$/.test(t)) continue;

    // Skip BLOC sub-header labels echoed without hashes (e.g. "BLOC B — INTRODUCTION", "**BLOC B**")
    if (/^(?:\*{1,2})?BLOC\s+[A-Z]/i.test(t)) continue;

    // Skip obvious instruction lines
    if (/^(Rédige|Génère|Crée|Après le H1|Elle doit|La section|Accrocher)/i.test(t)) continue;

    out.push(cleanMarkdown(lines[i]));
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Extract a structured block of content (plan MECE, links sections).
 * Preserves internal structure: ## H2, ### H3, → descriptions, 🔗, 🌐, etc.
 */
function extractBlock(lines, { start, end }) {
  const out = [];
  let pastHeader = false;

  for (let i = start; i < end; i++) {
    const line = lines[i];
    const t = line.trim();

    // Skip the first section header line (### 5. PLAN MECE ...)
    if (!pastHeader) {
      if (detectSectionNum(line) !== null) {
        pastHeader = true;
        continue;
      }
    }
    pastHeader = true;

    if (/^\[.*\]$/.test(t)) continue;
    if (/^-{3,}$/.test(t)) continue;

    // Skip BLOC sub-header labels (with or without bold markers)
    if (/^(?:\*{1,2})?BLOC\s+[A-Z]/i.test(t)) continue;

    out.push(line);
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Extract the HTML code block from the FAQ section.
 */
function extractHtmlCode(lines, { start, end }) {
  const sectionText = lines.slice(start, end).join('\n');

  // Fenced code block (```html ... ```)
  const fenced = sectionText.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  // Raw HTML starting with <div
  const idx = sectionText.indexOf('<div');
  if (idx !== -1) return sectionText.slice(idx).trim();

  return '';
}

/**
 * Extract 2-3 schema code blocks from section 9.
 */
function extractSchemasList(lines, { start, end }) {
  const sectionText = lines.slice(start, end).join('\n');
  const schemas = [];

  const parts = sectionText.split(/(?=📌 SCHÉMA \d+)/);
  for (const part of parts) {
    if (!part.includes('📌')) continue;

    const insertMatch = part.match(/📌 SCHÉMA \d+[^:]*:\s*(.+)/);
    const position = insertMatch ? insertMatch[1].trim() : '';

    const fenced = part.match(/```(?:html)?\s*([\s\S]*?)```/);
    let code = fenced ? fenced[1].trim() : '';

    if (!code) {
      const htmlStart = part.search(/<(div|section|figure|table)/);
      if (htmlStart !== -1) code = part.slice(htmlStart).trim();
    }

    if (code) schemas.push({ position, code });
  }

  return schemas;
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function cleanMarkdown(text) {
  return text
    // Do NOT strip ** here — htmlBuilder.processLinks converts ** → <strong>
    .replace(/(?<!\w)\*(?!\w)/g, '') // remove lonely italic *
    .replace(/\[.*?\]\(.*?\)/g, (m) => m.replace(/\[(.+?)\]\(.+?\)/, '$1')) // keep link text
    .replace(/\[.*?\]/g, '')     // remove remaining [markers]
    .trim();
}

/** For plain-text fields (title, meta, H1) — strips all markdown formatting */
function cleanMarkdownPlain(text) {
  return cleanMarkdown(text).replace(/\*\*/g, '');
}
