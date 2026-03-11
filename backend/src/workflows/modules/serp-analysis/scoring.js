/**
 * SEO coverage scoring and SERP drift detection.
 * Used by pipeline.service.js to evaluate generated articles against the SERP model.
 */

/**
 * Compare the generated article text against the SERP model and compute
 * a set of coverage scores.
 *
 * @param {string} articleText
 * @param {object} serpModel
 * @returns {{ totalScore, topicCoverage, entityCoverage, wordScore, faqScore, intentScore }}
 */
export function scoreSerpCoverage(articleText, serpModel) {
  if (!serpModel || !articleText) {
    return { totalScore: 0, topicCoverage: 0, entityCoverage: 0, wordScore: 0, faqScore: 0, intentScore: 0 };
  }

  const text = articleText.toLowerCase();

  const topicsCovered = serpModel.dominantSubtopics.filter((topic) =>
    text.includes(topic.toLowerCase())
  ).length;
  const topicCoverage = serpModel.dominantSubtopics.length > 0
    ? Math.round((topicsCovered / serpModel.dominantSubtopics.length) * 100)
    : 100;

  const entitiesCovered = serpModel.recurringEntities.filter((entity) =>
    text.includes(entity.toLowerCase())
  ).length;
  const entityCoverage = serpModel.recurringEntities.length > 0
    ? Math.round((entitiesCovered / serpModel.recurringEntities.length) * 100)
    : 100;

  const articleWords = articleText.trim().split(/\s+/).length;
  const targetWords  = Math.round(serpModel.avgWordCount * 1.1);
  const ratio        = articleWords / targetWords;
  const wordScore = ratio >= 0.9 && ratio <= 1.5
    ? 100
    : ratio >= 0.6 && ratio < 0.9
      ? Math.round(50 + ((ratio - 0.6) / 0.3) * 50)
      : Math.round(Math.max(0, 100 - Math.abs(ratio - 1.2) * 80));

  const faqScore = !serpModel.hasFaq
    ? 100
    : (text.includes('faq') || text.includes('question') || text.includes('<details>'))
      ? 100
      : 0;

  const intentSignals = {
    informationnelle: ['comment', 'pourquoi', 'qu\'est-ce', 'guide', 'tout savoir'],
    transactionnelle: ['acheter', 'prix', 'commander', 'devis', 'offre', 'meilleur'],
    commerciale:      ['comparatif', 'avis', 'test', 'meilleur', 'top'],
    navigationnelle:  ['site', 'accès', 'connexion', 'login'],
  };
  const signals     = intentSignals[serpModel.intent] ?? [];
  const intentScore = signals.some((s) => text.includes(s)) ? 100 : 50;

  const totalScore = Math.round(
    topicCoverage  * 0.35 +
    entityCoverage * 0.20 +
    wordScore      * 0.20 +
    faqScore       * 0.15 +
    intentScore    * 0.10
  );

  return { totalScore, topicCoverage, entityCoverage, wordScore, faqScore, intentScore };
}

/**
 * Compare two SERP model snapshots and surface meaningful changes.
 *
 * @param {object} oldModel
 * @param {object} newModel
 * @param {{ coverageThreshold?: number, articleText?: string }} [options]
 * @returns {{ newTopics, lostTopics, wordCountShift, coverageDrop }}
 */
export function detectSerpDrift(oldModel, newModel, options = {}) {
  const { coverageThreshold = 70, articleText = '' } = options;

  const oldTopics = new Set((oldModel?.dominantSubtopics ?? []).map((s) => s.toLowerCase()));
  const newTopics = new Set((newModel?.dominantSubtopics ?? []).map((s) => s.toLowerCase()));

  const addedTopics    = [...newTopics].filter((t) => !oldTopics.has(t));
  const removedTopics  = [...oldTopics].filter((t) => !newTopics.has(t));
  const wordCountShift = (newModel?.avgWordCount ?? 0) - (oldModel?.avgWordCount ?? 0);

  let coverageDrop = false;
  if (articleText && newModel) {
    const coverage = scoreSerpCoverage(articleText, newModel);
    coverageDrop = coverage.totalScore < coverageThreshold;
  }

  console.log(
    `[SERP] Drift détecté — +${addedTopics.length} nouveaux sujets, ` +
    `-${removedTopics.length} sujets perdus, ` +
    `${wordCountShift > 0 ? '+' : ''}${wordCountShift} mots`
  );

  return { newTopics: addedTopics, lostTopics: removedTopics, wordCountShift, coverageDrop };
}
