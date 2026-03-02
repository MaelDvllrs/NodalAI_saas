/**
 * SERP Analysis Service
 *
 * Implements a 5-step SERP-driven content intelligence pipeline:
 *   1. SERP Structure Extraction  — fetch top-10 organic results via DataForSEO
 *   2. Semantic Model Building    — Claude analyzes snippets → structured JSON model
 *   3. AI Structure Improvement   — covered by claude.service.generateOptimizedOutline
 *   4. SEO Coverage Scoring       — compare generated article vs SERP model
 *   5. SERP Change Detection      — detect drift between two SERP model snapshots
 */

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

// ── Clients ──────────────────────────────────────────────────────────────────

function getDataForSeoAuth() {
  const login    = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error('DataForSEO : identifiants manquants dans .env');
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Supabase : variables SUPABASE_URL / SUPABASE_SERVICE_KEY manquantes');
  return createClient(url, key);
}

function getClaude() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquant dans .env');
  return new Anthropic({ apiKey });
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — SERP Structure Extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch the top-10 French organic results for a keyword from DataForSEO.
 *
 * Returns an array of structured result objects:
 *   { rank, title, description, url, domain }
 *
 * @param {string} keyword
 * @returns {Promise<SerpResult[]>}
 */
export async function fetchSerpResults(keyword) {
  const headers = {
    Authorization: getDataForSeoAuth(),
    'Content-Type': 'application/json',
  };

  const payload = [
    {
      keyword,
      language_code: 'fr',
      location_code: 2250, // France
      device: 'desktop',
      depth: 10,
    },
  ];

  let response;
  try {
    response = await axios.post(
      'https://api.dataforseo.com/v3/serp/google/organic/live/regular',
      payload,
      { headers, timeout: 30_000 }
    );
  } catch (err) {
    console.error('[SERP] Erreur réseau DataForSEO:', err?.message);
    return [];
  }

  const task = response.data?.tasks?.[0];
  console.log(`[SERP] Statut: ${task?.status_code} — ${task?.status_message}`);

  if (task?.status_code !== 20000) {
    console.warn('[SERP] Tâche échouée:', JSON.stringify(task, null, 2));
    return [];
  }

  const items = task?.result?.[0]?.items ?? [];

  // Keep only organic results (exclude ads, featured snippets, people-also-ask, etc.)
  const organics = items
    .filter((i) => i.type === 'organic')
    .slice(0, 10)
    .map((i) => ({
      rank: i.rank_group,
      title: i.title ?? '',
      description: i.description ?? '',
      url: i.url ?? '',
      domain: i.domain ?? '',
    }));

  console.log(`[SERP] ${organics.length} résultats organiques extraits pour "${keyword}"`);
  return organics;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Semantic Model Building
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} SerpModel
 * @property {string}   keyword
 * @property {number}   avgWordCount
 * @property {string[]} dominantSubtopics
 * @property {string[]} recurringEntities
 * @property {string[]} faqQuestions
 * @property {string}   intent
 * @property {string}   contentFormat
 * @property {boolean}  hasFaq
 * @property {number}   competitorCount
 * @property {string}   createdAt
 */

/**
 * Build a structured semantic model by asking Claude to analyze the SERP snippets.
 *
 * Claude receives titles + meta descriptions of top-10 results and infers:
 *   - avgWordCount (estimated from snippet density / title patterns)
 *   - dominantSubtopics
 *   - recurringEntities
 *   - faqQuestions
 *   - dominant search intent
 *   - dominant content format
 *
 * @param {string}       keyword
 * @param {SerpResult[]} serpResults
 * @returns {Promise<SerpModel>}
 */
export async function buildSerpModel(keyword, serpResults) {
  if (!serpResults || serpResults.length === 0) {
    return buildEmptyModel(keyword);
  }

  const client = getClaude();

  const snippetsText = serpResults
    .map((r, i) => `[${i + 1}] TITRE: "${r.title}" | DESCRIPTION: "${r.description}" | URL: ${r.url}`)
    .join('\n');

  const prompt = `Tu es un expert SEO et analyste SERP.

Voici les ${serpResults.length} premiers résultats organiques Google pour le mot-clé : "${keyword}"

${snippetsText}

ANALYSE CES RÉSULTATS et retourne UNIQUEMENT un objet JSON valide (pas de texte avant ou après) avec la structure exacte suivante :

{
  "avgWordCount": <estimation du nombre moyen de mots des articles (basé sur la densité des snippets et la complexité du sujet, entre 800 et 4000)>,
  "dominantSubtopics": [<liste de 6 à 10 sous-thèmes/H2 dominants présents dans les titres et snippets>],
  "recurringEntities": [<liste de 5 à 10 entités nommées récurrentes : marques, outils, personnes, lieux, concepts clés>],
  "faqQuestions": [<liste de 4 à 8 questions fréquemment posées déduites des snippets et du sujet>],
  "intent": "<l'une des 4 intentions : informationnelle | transactionnelle | navigationnelle | commerciale>",
  "contentFormat": "<format dominant parmi : guide | liste | comparaison | définition | tutoriel | avis>",
  "hasFaq": <true si les snippets suggèrent une FAQ ou des questions/réponses, sinon false>
}

RÈGLES :
- Déduis les sous-thèmes depuis les titres et snippets réels
- Identifie les entités mentionnées ou fortement suggérées
- Estime avgWordCount selon la profondeur apparente du contenu
- intent = ce que cherche l'utilisateur en tapant ce mot-clé
- Retourne UNIQUEMENT le JSON, sans texte introductif`;

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].text.trim();
    const jsonStr = raw.startsWith('{') ? raw : raw.match(/\{[\s\S]*\}/)?.[0] || '{}';
    const parsed = JSON.parse(jsonStr);

    return {
      keyword,
      avgWordCount:       parsed.avgWordCount       ?? 1500,
      dominantSubtopics:  Array.isArray(parsed.dominantSubtopics)  ? parsed.dominantSubtopics  : [],
      recurringEntities:  Array.isArray(parsed.recurringEntities)  ? parsed.recurringEntities  : [],
      faqQuestions:       Array.isArray(parsed.faqQuestions)       ? parsed.faqQuestions       : [],
      intent:             parsed.intent       ?? 'informationnelle',
      contentFormat:      parsed.contentFormat ?? 'guide',
      hasFaq:             parsed.hasFaq       ?? false,
      competitorCount:    serpResults.length,
      createdAt:          new Date().toISOString(),
    };
  } catch (err) {
    console.error('[SERP] Erreur buildSerpModel (Claude):', err?.message);
    return buildEmptyModel(keyword);
  }
}

function buildEmptyModel(keyword) {
  return {
    keyword,
    avgWordCount: 1500,
    dominantSubtopics: [],
    recurringEntities: [],
    faqQuestions: [],
    intent: 'informationnelle',
    contentFormat: 'guide',
    hasFaq: false,
    competitorCount: 0,
    createdAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence — store / retrieve SERP models in Supabase
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist a SERP model snapshot in Supabase (table: serp_models).
 * The table is created on first use via upsert; a migration is provided separately.
 *
 * @param {string}    keyword
 * @param {SerpModel} model
 */
export async function saveSerpModel(keyword, model) {
  try {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('serp_models')
      .upsert(
        {
          keyword: keyword.toLowerCase(),
          model,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'keyword' }
      );

    if (error) console.error('[SERP] Erreur saveSerpModel:', error.message);
    else console.log(`[SERP] Modèle SERP sauvegardé pour "${keyword}"`);
  } catch (err) {
    // Non-blocking — DB save failure must not break the pipeline
    console.error('[SERP] saveSerpModel exception:', err?.message);
  }
}

/**
 * Retrieve the last stored SERP model for a keyword, or null if not found.
 *
 * @param {string} keyword
 * @returns {Promise<SerpModel|null>}
 */
export async function getSerpModel(keyword) {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('serp_models')
      .select('model, updated_at')
      .eq('keyword', keyword.toLowerCase())
      .single();

    if (error || !data) return null;
    return { ...data.model, _savedAt: data.updated_at };
  } catch (err) {
    console.error('[SERP] getSerpModel exception:', err?.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — SEO Coverage Scoring
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} CoverageScore
 * @property {number} totalScore       0–100 overall SEO alignment
 * @property {number} topicCoverage    % of dominantSubtopics present in article
 * @property {number} entityCoverage   % of recurringEntities present in article
 * @property {number} wordScore        0–100 how close article word count is to target
 * @property {number} faqScore         0 or 100 based on FAQ presence
 * @property {number} intentScore      0 or 100 based on intent keyword signals
 */

/**
 * Compare the generated article text against the SERP model and compute
 * a set of coverage scores.
 *
 * @param {string}    articleText  Plain text content of the article
 * @param {SerpModel} serpModel
 * @returns {CoverageScore}
 */
export function scoreSerpCoverage(articleText, serpModel) {
  if (!serpModel || !articleText) {
    return { totalScore: 0, topicCoverage: 0, entityCoverage: 0, wordScore: 0, faqScore: 0, intentScore: 0 };
  }

  const text = articleText.toLowerCase();

  // ── Topic Coverage ──────────────────────────────────────────────────────────
  const topicsCovered = serpModel.dominantSubtopics.filter((topic) =>
    text.includes(topic.toLowerCase())
  ).length;
  const topicCoverage = serpModel.dominantSubtopics.length > 0
    ? Math.round((topicsCovered / serpModel.dominantSubtopics.length) * 100)
    : 100;

  // ── Entity Coverage ─────────────────────────────────────────────────────────
  const entitiesCovered = serpModel.recurringEntities.filter((entity) =>
    text.includes(entity.toLowerCase())
  ).length;
  const entityCoverage = serpModel.recurringEntities.length > 0
    ? Math.round((entitiesCovered / serpModel.recurringEntities.length) * 100)
    : 100;

  // ── Word Count Alignment ────────────────────────────────────────────────────
  // Target: avgWordCount * 1.10 (slightly exceed competitors)
  const articleWords = articleText.trim().split(/\s+/).length;
  const targetWords  = Math.round(serpModel.avgWordCount * 1.1);
  const ratio        = articleWords / targetWords;
  // Perfect = 100, below 60% or above 200% = 50
  const wordScore = ratio >= 0.9 && ratio <= 1.5
    ? 100
    : ratio >= 0.6 && ratio < 0.9
      ? Math.round(50 + ((ratio - 0.6) / 0.3) * 50)
      : Math.round(Math.max(0, 100 - Math.abs(ratio - 1.2) * 80));

  // ── FAQ Score ───────────────────────────────────────────────────────────────
  const faqScore = !serpModel.hasFaq
    ? 100
    : (text.includes('faq') || text.includes('question') || text.includes('<details>'))
      ? 100
      : 0;

  // ── Intent Score ────────────────────────────────────────────────────────────
  const intentSignals = {
    informationnelle:  ['comment', 'pourquoi', 'qu\'est-ce', 'guide', 'tout savoir'],
    transactionnelle:  ['acheter', 'prix', 'commander', 'devis', 'offre', 'meilleur'],
    commerciale:       ['comparatif', 'avis', 'test', 'meilleur', 'top'],
    navigationnelle:   ['site', 'accès', 'connexion', 'login'],
  };
  const signals = intentSignals[serpModel.intent] ?? [];
  const intentHit = signals.some((s) => text.includes(s));
  const intentScore = intentHit ? 100 : 50;

  // ── Total Score (weighted) ───────────────────────────────────────────────────
  const totalScore = Math.round(
    topicCoverage  * 0.35 +
    entityCoverage * 0.20 +
    wordScore      * 0.20 +
    faqScore       * 0.15 +
    intentScore    * 0.10
  );

  return { totalScore, topicCoverage, entityCoverage, wordScore, faqScore, intentScore };
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5 — SERP Change Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} SerpDrift
 * @property {string[]} newTopics      Subtopics present in newModel but not in oldModel
 * @property {string[]} lostTopics     Subtopics present in oldModel but missing in newModel
 * @property {number}   wordCountShift Absolute difference in avgWordCount
 * @property {boolean}  coverageDrop   True if article coverage dropped below threshold
 */

/**
 * Compare two SERP model snapshots and surface meaningful changes.
 *
 * @param {SerpModel} oldModel
 * @param {SerpModel} newModel
 * @param {object}    [options]
 * @param {number}    [options.coverageThreshold=70]  Minimum acceptable coverage score
 * @param {string}    [options.articleText]           Current article text (for coverage check)
 * @returns {SerpDrift}
 */
export function detectSerpDrift(oldModel, newModel, options = {}) {
  const { coverageThreshold = 70, articleText = '' } = options;

  const oldTopics = new Set((oldModel?.dominantSubtopics ?? []).map((s) => s.toLowerCase()));
  const newTopics = new Set((newModel?.dominantSubtopics ?? []).map((s) => s.toLowerCase()));

  const addedTopics = [...newTopics].filter((t) => !oldTopics.has(t));
  const removedTopics = [...oldTopics].filter((t) => !newTopics.has(t));

  const wordCountShift =
    (newModel?.avgWordCount ?? 0) - (oldModel?.avgWordCount ?? 0);

  let coverageDrop = false;
  if (articleText && newModel) {
    const coverage = scoreSerpCoverage(articleText, newModel);
    coverageDrop = coverage.totalScore < coverageThreshold;
  }

  const drift = {
    newTopics:      addedTopics,
    lostTopics:     removedTopics,
    wordCountShift,
    coverageDrop,
  };

  console.log(
    `[SERP] Drift détecté — +${addedTopics.length} nouveaux sujets, ` +
    `-${removedTopics.length} sujets perdus, ` +
    `${wordCountShift > 0 ? '+' : ''}${wordCountShift} mots`
  );

  return drift;
}
