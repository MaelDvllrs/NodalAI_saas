/**
 * Module: Reddit Analyzer
 *
 * Prend les sources Reddit citées par un module LLM Analysis en amont,
 * scrape chaque post (contenu + top 20 commentaires), puis appelle Claude pour :
 *   1. Analyser les patterns de contenu valorisés par les IA
 *   2. Générer un plan d'action concret (posts, commentaires, AMA)
 *
 * Inputs  (ctx): geoSources (array de { url, name, type } — provenant de chatgpt-analysis,
 *                            gemini-analysis, perplexity-analysis, etc.)
 *                geoPrompt  (string, optionnel — prompt GEO testé)
 *                siteProfile (object, optionnel — profil du site pour contextualiser)
 *                siteUrl     (string, optionnel)
 *
 * Outputs (ctx): redditPosts, redditPatterns, redditStrategy
 */

import { fetchRedditPosts }        from './scraper.js';
import { analyzeRedditPatterns, generateRedditStrategy } from './claude.js';

export const RedditAnalyzerModule = {
  async execute(ctx, config = {}, { emitEvent, jobId }) {

    // ── 0. Collect Reddit URLs from upstream LLM sources ─────────────────────
    const allSources = [
      ...(ctx.geoSources         ?? []),
      ...(ctx.chatgptSources     ?? []),
      ...(ctx.geminiSources      ?? []),
      ...(ctx.perplexitySources  ?? []),
    ];

    const redditUrls = allSources
      .map(s => (typeof s === 'string' ? s : s?.url))
      .filter(u => u && u.includes('reddit.com/r/') && u.includes('/comments/'));

    if (!redditUrls.length) {
      emitEvent(jobId, {
        type: 'step',
        message: '⚠️ Aucune source Reddit trouvée dans le contexte — connectez un module LLM Analysis en amont.',
      });
      return { redditPosts: [], redditPatterns: null, redditStrategy: null };
    }

    const unique = [...new Set(redditUrls)];
    const siteTheme = ctx.siteProfile?.theme
      ?? ctx.siteTheme
      ?? config.siteTheme
      ?? 'Sujet non précisé';
    const siteUrl   = ctx.siteUrl ?? config.siteUrl ?? '';
    const prompts   = ctx.geoPrompts ?? (ctx.geoPrompt ? [ctx.geoPrompt] : []);

    emitEvent(jobId, {
      type: 'step',
      message: `🔍 ${unique.length} post${unique.length > 1 ? 's' : ''} Reddit identifié${unique.length > 1 ? 's' : ''} dans les sources LLM`,
    });

    // ── 1. Scrape Reddit posts ────────────────────────────────────────────────
    emitEvent(jobId, {
      type: 'step',
      message: `📥 Scraping des posts Reddit (top 20 commentaires chacun)...`,
    });

    const posts = await fetchRedditPosts(unique, (current, total, post) => {
      emitEvent(jobId, {
        type: 'step',
        message: `  ✓ [${current}/${total}] ${post.subredditPrefixed} — "${post.title.slice(0, 60)}${post.title.length > 60 ? '…' : ''}" (${post.score} pts, ${post.comments.length} comments)`,
      });
    });

    if (!posts.length) {
      emitEvent(jobId, {
        type: 'step',
        message: '⚠️ Aucun post Reddit accessible (supprimés ou privés).',
      });
      return { redditPosts: [], redditPatterns: null, redditStrategy: null };
    }

    const subreddits = [...new Set(posts.map(p => p.subredditPrefixed))];
    emitEvent(jobId, {
      type: 'step',
      message: `✅ ${posts.length} post${posts.length > 1 ? 's' : ''} récupéré${posts.length > 1 ? 's' : ''} — ${subreddits.length} subreddit${subreddits.length > 1 ? 's' : ''} : ${subreddits.slice(0, 5).join(', ')}${subreddits.length > 5 ? '…' : ''}`,
    });

    // ── 2. Analyse patterns with Claude ──────────────────────────────────────
    emitEvent(jobId, {
      type: 'step',
      message: `🧠 Analyse des patterns de contenu valorisés par les IA...`,
    });

    const patterns = await analyzeRedditPatterns(posts, siteTheme, prompts);

    if (patterns) {
      const types = (patterns.contentTypes ?? []).map(t => t.type).slice(0, 3).join(', ');
      emitEvent(jobId, {
        type: 'step',
        message: `✅ Patterns identifiés — Types dominants : ${types || 'N/A'}`,
      });
      if (patterns.whatAiValues?.length) {
        emitEvent(jobId, {
          type: 'step',
          message: `💡 Pourquoi les IA citent ces contenus : ${patterns.whatAiValues[0]}`,
        });
      }
    }

    // ── 3. Generate strategy with Claude ─────────────────────────────────────
    emitEvent(jobId, {
      type: 'step',
      message: `🎯 Génération du plan d'action Reddit...`,
    });

    const strategy = await generateRedditStrategy(posts, patterns, siteTheme, siteUrl);

    if (strategy) {
      const nPosts    = strategy.postIdeas?.length ?? 0;
      const nComments = strategy.commentTemplates?.length ?? 0;
      emitEvent(jobId, {
        type: 'step',
        message: `✅ Stratégie générée — ${nPosts} idées de posts · ${nComments} templates de commentaires`,
      });
      if (strategy.priorityActions?.length) {
        emitEvent(jobId, {
          type: 'step',
          message: `🚀 Action prioritaire : ${strategy.priorityActions[0]}`,
        });
      }
    }

    // ── 4. Emit data events ───────────────────────────────────────────────────
    emitEvent(jobId, { type: 'data', key: 'redditPosts',    value: posts });
    emitEvent(jobId, { type: 'data', key: 'redditPatterns', value: patterns });
    emitEvent(jobId, { type: 'data', key: 'redditStrategy', value: strategy });

    return { redditPosts: posts, redditPatterns: patterns, redditStrategy: strategy };
  },
};
