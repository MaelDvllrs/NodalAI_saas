'use client';

import { useEffect, useRef, useState } from 'react';
import { Terminal, CheckCircle2, AlertCircle, Copy, ExternalLink, ChevronDown, ChevronUp, Code2, Eye, Info, BarChart2, Target, Image, Search, Layers, Globe, Link } from 'lucide-react';
import { cn } from '../utils/cn';

export type SemanticCluster = {
  clusterId: number;
  label: string;
  terms: { term: string; display: string; score: number }[];
  score: number;
  pageCount?: number;
};

export type SemanticAnalysis = {
  keyword: string;
  pagesAnalyzed: number;
  intent?: string;
  contentFormat?: string;
  avgWordCount?: number;
  dominantSubtopics?: string[];
  faqQuestions?: string[];
  primaryTerms: string[];
  secondaryTerms: string[];
  longTailVariants: string[];
  entities: string[];
  semanticField: string[];
  coOccurrences: string[];
  contentGaps: string[];
  tfidfTopTerms: { term: string; score: number }[];
  relatedKws: { keyword: string; volume: number }[];
  clusters?: SemanticCluster[];
};

export type LogEvent =
  | { type: 'step'; message: string }
  | { type: 'module-start'; moduleType: string; instanceId: string; label: string }
  | { type: 'module-done'; moduleType: string; instanceId: string; label: string }
  | { type: 'module-error'; moduleType: string; instanceId: string; label: string; error: string }
  | { type: 'data'; key: string; value: unknown }
  | { type: 'preview'; data: { titleTag: string; h1: string; metaDescription: string } }
  | { type: 'embeds'; data: { faqEmbed: string | null; schemas: { position: string; code: string }[] } }
  | { type: 'coverage'; data: { totalScore: number; bm25Score?: number; semanticScore?: number; topicCoverage: number; entityCoverage: number; wordScore: number; faqScore: number; intentScore: number }; message: string }
  | { type: 'images'; data: { featured: string | null; content: { index: number; url: string; prompt: string }[] } }
  | { type: 'done'; message?: string; data?: { itemId: string; itemName: string; collectionId: string } }
  | { type: 'error'; message: string }
  | { type: 'seo-preview'; data: {
      mainKeyword: string;
      kd: number | null;
      kwSearchVolume: number | null;
      serpResults: { rank: number; url: string; domain: string; title: string; description: string; pageType?: string }[];
      serpModel: { intent: string; contentFormat: string; avgWordCount: number; dominantSubtopics: string[]; recurringEntities: string[]; hasFaq: boolean; faqQuestions: string[] } | null;
      semanticAnalysis: SemanticAnalysis & {
        intentTopTerms?: { term: string; display?: string; score: number; tfidf: number; minCount?: number; maxCount?: number; target?: number }[];
        termDistribution?: { term: string; display?: string; presences: boolean[]; counts?: number[]; minCount?: number; maxCount?: number; target?: number }[];
        pagesMeta?: { idx: number; url: string; domain: string; title: string; rank: number }[];
        relatedKws?: { keyword: string; volume: number }[];
        clusters?: SemanticCluster[];
      } | null;
    };
  }
  | { type: 'debug'; label: string; [key: string]: unknown };

interface Props {
  events: LogEvent[];
}

export default function ProgressLog({ events }: Props) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events]);

  if (events.length === 0) return null;

  const debugEvents = events.filter((e) => e.type === 'debug') as Extract<LogEvent, { type: 'debug' }>[];
  const embedsEvent = events.find((e) => e.type === 'embeds') as Extract<LogEvent, { type: 'embeds' }> | undefined;
  const doneEvent = events.find((e) => e.type === 'done') as Extract<LogEvent, { type: 'done' }> | undefined;
  const errorEvent = events.find((e) => e.type === 'error') as Extract<LogEvent, { type: 'error' }> | undefined;
  const previewEvent = events.find((e) => e.type === 'preview') as Extract<LogEvent, { type: 'preview' }> | undefined;

  const mainKeyword = (events.find((e) => e.type === 'data' && (e as { key: string }).key === 'mainKeyword') as { value: string } | undefined)?.value;
  const secondaryKeywords = (events.find((e) => e.type === 'data' && (e as { key: string }).key === 'secondaryKeywords') as { value: string[] } | undefined)?.value;
  const serpModelData = (events.find((e) => e.type === 'data' && (e as { key: string }).key === 'serpModel') as { value: { dominantSubtopics: string[]; recurringEntities: string[]; intent: string; contentFormat: string; avgWordCount: number; faqQuestions: string[] } } | undefined)?.value;
  const coverageEvent = events.find((e) => e.type === 'coverage') as Extract<LogEvent, { type: 'coverage' }> | undefined;
  const imagesEvent = events.find((e) => e.type === 'images') as Extract<LogEvent, { type: 'images' }> | undefined;
  const semanticData = (events.find((e) => e.type === 'data' && (e as { key: string }).key === 'semanticAnalysis') as { value: SemanticAnalysis } | undefined)?.value;
  const siteProfileData = (events.find((e) => e.type === 'data' && (e as { key: string }).key === 'siteProfile') as { value: {
    theme?: string; tone?: string; targetAudience?: string; mainTopics?: string[];
    existingBlogTitles?: string[]; description?: string; writingStyle?: string;
    keywords?: string[]; contentGaps?: string[]; recommendedToneForGeneration?: string; language?: string;
  } } | undefined)?.value;
  const sitemapUrlsData = (events.find((e) => e.type === 'data' && (e as { key: string }).key === 'sitemapUrls') as { value: string[] } | undefined)?.value;
  const generationPrompt = (events.find((e) => e.type === 'data' && (e as { key: string }).key === 'generationPrompt') as { value: string } | undefined)?.value;

  return (
    <div className="space-y-6">
      {/* Terminal Log */}
      <div className="bg-black/90 rounded-xl border border-border overflow-hidden shadow-2xl">
        <div className="px-4 py-2 bg-zinc-900 border-b border-border flex items-center justify-between">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
          </div>
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
            <Terminal size={10} />
            Output Stream
          </span>
        </div>
        <div ref={scrollContainerRef} className="p-4 space-y-1.5 max-h-[300px] overflow-y-auto font-mono text-[11px] leading-relaxed">
          {events
            .filter((e) => e.type === 'step')
            .map((e, i) => (
              <div key={i} className="flex gap-2 text-zinc-400">
                <span className="text-zinc-600 shrink-0">[{i+1}]</span>
                <span className="opacity-90">{(e as { message: string }).message}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Generation Prompt Panel */}
      {generationPrompt && (
        <details className="group border border-border rounded-xl bg-card overflow-hidden transition-all">
          <summary className="flex items-center justify-between px-5 py-3 cursor-pointer select-none text-xs font-bold text-text-muted uppercase tracking-wider hover:bg-border/30">
            <div className="flex items-center gap-2">
              <Code2 size={14} />
              Prompt de génération Claude
            </div>
            <ChevronDown className="group-open:rotate-180 transition-transform" size={14} />
          </summary>
          <div className="px-5 pb-5 border-t border-border bg-black/5">
            <pre className="text-[10px] font-mono bg-background border border-border rounded-lg p-3 overflow-x-auto text-text-muted mt-4 whitespace-pre-wrap max-h-[500px] overflow-y-auto">
              {generationPrompt}
            </pre>
          </div>
        </details>
      )}

      {/* Site Profile Panel */}
      {siteProfileData && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-text-muted">
              <Globe size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Profil du site</span>
            </div>
            {sitemapUrlsData && sitemapUrlsData.length > 0 && (
              <div className="flex items-center gap-1.5 text-[10px] text-accent bg-accent/10 border border-accent/20 rounded-full px-2.5 py-0.5">
                <Link size={9} />
                <span>{sitemapUrlsData.length} URLs sitemap</span>
              </div>
            )}
          </div>

          {/* Theme + description */}
          {siteProfileData.theme && (
            <div className="bg-background rounded-lg p-3 border border-border">
              <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Thème</p>
              <p className="text-sm font-bold text-text">{siteProfileData.theme}</p>
              {siteProfileData.description && (
                <p className="text-[11px] text-text-muted mt-1 leading-relaxed">{siteProfileData.description}</p>
              )}
            </div>
          )}

          {/* Tone + audience grid */}
          <div className="grid grid-cols-2 gap-2">
            {siteProfileData.tone && (
              <div className="bg-background rounded-lg p-2.5 border border-border">
                <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Ton détecté</p>
                <p className="text-[11px] font-semibold text-text">{siteProfileData.tone}</p>
              </div>
            )}
            {siteProfileData.language && (
              <div className="bg-background rounded-lg p-2.5 border border-border">
                <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Langue</p>
                <p className="text-[11px] font-semibold text-text uppercase">{siteProfileData.language}</p>
              </div>
            )}
            {siteProfileData.targetAudience && (
              <div className="bg-background rounded-lg p-2.5 border border-border col-span-2">
                <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Audience cible</p>
                <p className="text-[11px] text-text">{siteProfileData.targetAudience}</p>
              </div>
            )}
          </div>

          {/* Writing style */}
          {siteProfileData.writingStyle && (
            <div className="bg-background rounded-lg p-2.5 border border-border">
              <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Style rédactionnel</p>
              <p className="text-[11px] text-text-muted leading-relaxed">{siteProfileData.writingStyle}</p>
            </div>
          )}

          {/* Recommended tone for generation */}
          {siteProfileData.recommendedToneForGeneration && (
            <div className="bg-accent/5 border border-accent/15 rounded-lg p-2.5">
              <p className="text-[10px] text-accent font-bold uppercase tracking-wider mb-0.5">Ton recommandé pour la génération</p>
              <p className="text-[11px] text-text-muted leading-relaxed">{siteProfileData.recommendedToneForGeneration}</p>
            </div>
          )}

          {/* Main topics */}
          {siteProfileData.mainTopics && siteProfileData.mainTopics.length > 0 && (
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Sujets principaux</p>
              <div className="flex flex-wrap gap-1.5">
                {siteProfileData.mainTopics.map((t, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-border text-text-muted text-[10px] font-medium">{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Keywords */}
          {siteProfileData.keywords && siteProfileData.keywords.length > 0 && (
            <div className="border-t border-border pt-3">
              <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Mots-clés détectés</p>
              <div className="flex flex-wrap gap-1.5">
                {siteProfileData.keywords.map((k, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-text-muted text-[10px] border border-border font-mono">{k}</span>
                ))}
              </div>
            </div>
          )}

          {/* Existing blog titles */}
          {siteProfileData.existingBlogTitles && siteProfileData.existingBlogTitles.length > 0 && (
            <details className="border-t border-border pt-3">
              <summary className="text-[10px] text-amber-500 font-bold uppercase tracking-wider cursor-pointer select-none">
                Articles existants ({siteProfileData.existingBlogTitles.length}) — à ne pas dupliquer
              </summary>
              <div className="mt-2 space-y-0.5">
                {siteProfileData.existingBlogTitles.map((t, i) => (
                  <div key={i} className="text-[11px] text-text-muted px-1 py-0.5 flex items-start gap-1.5">
                    <span className="text-amber-500/60 shrink-0 font-mono text-[9px] mt-0.5">{i + 1}.</span>
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Content gaps */}
          {siteProfileData.contentGaps && siteProfileData.contentGaps.length > 0 && (
            <details className="border-t border-border pt-3">
              <summary className="text-[10px] text-green-500 font-bold uppercase tracking-wider cursor-pointer select-none">
                Gaps de contenu ({siteProfileData.contentGaps.length}) — opportunités
              </summary>
              <div className="mt-2 space-y-1">
                {siteProfileData.contentGaps.map((g, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[11px] text-text-muted bg-green-500/5 border border-green-500/15 rounded px-2 py-1">
                    <span className="text-green-500 font-bold shrink-0">{i + 1}.</span>
                    <span>{g}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Sitemap URLs */}
          {sitemapUrlsData && sitemapUrlsData.length > 0 && (
            <details className="border-t border-border pt-3">
              <summary className="text-[10px] text-text-muted font-bold uppercase tracking-wider cursor-pointer select-none flex items-center gap-1.5">
                <Link size={9} />
                URLs internes disponibles ({sitemapUrlsData.length})
              </summary>
              <div className="mt-2 space-y-0.5 max-h-48 overflow-y-auto">
                {sitemapUrlsData.map((url, i) => (
                  <div key={i} className="text-[10px] text-text-muted font-mono truncate px-1 py-0.5 hover:bg-border/30 rounded">
                    {url}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Dynamic Data Panel */}
      {(mainKeyword || secondaryKeywords) && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="flex items-center gap-2 text-text-muted mb-2">
            <Info size={14} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Analyse Sémantique</span>
          </div>
          {mainKeyword && (
            <div>
              <p className="text-sm font-bold text-text mb-1">{String(mainKeyword)}</p>
              <p className="text-[10px] text-text-muted uppercase tracking-wider">Mot-clé principal identifié</p>
            </div>
          )}
          {secondaryKeywords && Array.isArray(secondaryKeywords) && secondaryKeywords.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              {secondaryKeywords.map((kw, i) => (
                <span
                  key={i}
                  className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] font-medium text-text-muted border border-border"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SERP Semantic Model */}
      {serpModelData && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="flex items-center gap-2 text-text-muted mb-2">
            <Target size={14} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Modèle SERP Concurrent</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-background rounded-lg p-3 border border-border">
              <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Intention</p>
              <p className="font-semibold capitalize">{serpModelData.intent}</p>
            </div>
            <div className="bg-background rounded-lg p-3 border border-border">
              <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Format dominant</p>
              <p className="font-semibold capitalize">{serpModelData.contentFormat}</p>
            </div>
            <div className="bg-background rounded-lg p-3 border border-border">
              <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Mots cibles</p>
              <p className="font-semibold">{Math.round(serpModelData.avgWordCount * 1.1).toLocaleString('fr-FR')} mots</p>
            </div>
            <div className="bg-background rounded-lg p-3 border border-border">
              <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Sous-thèmes SERP</p>
              <p className="font-semibold">{serpModelData.dominantSubtopics.length} détectés</p>
            </div>
          </div>
          {serpModelData.dominantSubtopics.length > 0 && (
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Sous-thèmes à couvrir</p>
              <div className="flex flex-wrap gap-1.5">
                {serpModelData.dominantSubtopics.map((t, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-accent/10 text-accent text-[10px] font-medium border border-accent/20">{t}</span>
                ))}
              </div>
            </div>
          )}
          {serpModelData.recurringEntities.length > 0 && (
            <div className="border-t border-border pt-3">
              <p className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Entités clés</p>
              <div className="flex flex-wrap gap-1.5">
                {serpModelData.recurringEntities.map((e, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-border text-text-muted text-[10px] font-medium">{e}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Semantic Analysis Panel */}
      {semanticData && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-text-muted">
              <Search size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Analyse Sémantique Approfondie</span>
            </div>
            <span className="text-[10px] text-text-muted bg-border px-2 py-0.5 rounded-full">
              {semanticData.pagesAnalyzed} pages · TF-IDF + DataForSEO
            </span>
          </div>

          {/* Primary terms */}
          {semanticData.primaryTerms.length > 0 && (
            <div>
              <p className="text-[10px] text-accent font-bold uppercase tracking-wider mb-2">Termes sémantiques principaux</p>
              <div className="flex flex-wrap gap-1.5">
                {semanticData.primaryTerms.map((t, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-accent/10 text-accent text-[10px] font-semibold border border-accent/20">{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Secondary terms */}
          {semanticData.secondaryTerms.length > 0 && (
            <div className="border-t border-border pt-3">
              <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider mb-2">Termes complémentaires</p>
              <div className="flex flex-wrap gap-1.5">
                {semanticData.secondaryTerms.map((t, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-text-muted text-[10px] border border-border">{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Long-tail variants */}
          {semanticData.longTailVariants.length > 0 && (
            <div className="border-t border-border pt-3">
              <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider mb-2">Longues traînes identifiées</p>
              <div className="flex flex-col gap-1">
                {semanticData.longTailVariants.map((t, i) => (
                  <span key={i} className="text-[11px] text-text-muted bg-background px-2 py-1 rounded border border-border font-mono">{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Entities + co-occurrences side by side */}
          <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
            {semanticData.entities.length > 0 && (
              <div>
                <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider mb-2">Entités sémantiques</p>
                <div className="flex flex-wrap gap-1">
                  {semanticData.entities.map((e, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-[10px] font-medium border border-purple-200 dark:border-purple-700/40">{e}</span>
                  ))}
                </div>
              </div>
            )}
            {semanticData.coOccurrences.length > 0 && (
              <div>
                <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider mb-2">Co-occurrences</p>
                <div className="flex flex-col gap-0.5">
                  {semanticData.coOccurrences.slice(0, 6).map((c, i) => (
                    <span key={i} className="text-[10px] text-text-muted font-mono">{c}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Content gaps */}
          {semanticData.contentGaps.length > 0 && (
            <div className="border-t border-border pt-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Layers size={11} className="text-amber-500" />
                <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider">Gaps de contenu identifiés</p>
              </div>
              <div className="space-y-1">
                {semanticData.contentGaps.map((g, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11px] text-text-muted bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/30 rounded px-2.5 py-1.5">
                    <span className="text-amber-500 font-bold shrink-0">{i + 1}.</span>
                    <span>{g}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Semantic clusters */}
          {(semanticData as SemanticAnalysis & { clusters?: SemanticCluster[] }).clusters &&
           (semanticData as SemanticAnalysis & { clusters?: SemanticCluster[] }).clusters!.length > 0 && (
            <div className="border-t border-border pt-3">
              <div className="flex items-center gap-1.5 mb-3">
                <Layers size={11} className="text-violet-400" />
                <p className="text-[10px] text-violet-400 font-bold uppercase tracking-wider">
                  Groupes Sémantiques ({(semanticData as SemanticAnalysis & { clusters?: SemanticCluster[] }).clusters!.length} clusters)
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(semanticData as SemanticAnalysis & { clusters?: SemanticCluster[] }).clusters!.map((cluster, ci) => {
                  const palettes = [
                    'border-blue-700/40 bg-blue-900/10 text-blue-300',
                    'border-violet-700/40 bg-violet-900/10 text-violet-300',
                    'border-emerald-700/40 bg-emerald-900/10 text-emerald-300',
                    'border-amber-700/40 bg-amber-900/10 text-amber-300',
                    'border-rose-700/40 bg-rose-900/10 text-rose-300',
                    'border-cyan-700/40 bg-cyan-900/10 text-cyan-300',
                    'border-fuchsia-700/40 bg-fuchsia-900/10 text-fuchsia-300',
                    'border-lime-700/40 bg-lime-900/10 text-lime-300',
                  ];
                  const pal = palettes[ci % palettes.length];
                  return (
                    <div key={cluster.clusterId} className={`border rounded-lg p-2.5 flex flex-col gap-1 ${pal}`}>
                      <span className="text-[11px] font-bold leading-tight">{cluster.label}</span>
                      <div className="flex items-center justify-between mt-auto pt-1">
                        {cluster.pageCount != null && (
                          <span className="text-[9px] opacity-60">{cluster.pageCount} page{cluster.pageCount > 1 ? 's' : ''} SERP</span>
                        )}
                        <span className="text-[9px] font-mono opacity-50 ml-auto">{cluster.score.toFixed(3)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TF-IDF top terms (collapsed) */}
          {semanticData.tfidfTopTerms.length > 0 && (
            <details className="border-t border-border pt-3">
              <summary className="text-[10px] text-text-muted font-bold uppercase tracking-wider cursor-pointer select-none">
                Top TF-IDF ({semanticData.tfidfTopTerms.length} termes)
              </summary>
              <div className="flex flex-wrap gap-1 mt-2">
                {semanticData.tfidfTopTerms.map((t, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded bg-border text-text-muted text-[9px] font-mono">
                    {(t as { display?: string; term: string }).display || t.term} <span className="opacity-50">{t.score}</span>
                  </span>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* SEO Coverage Score */}
      {coverageEvent && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-text-muted">
              <BarChart2 size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Score Couverture SEO</span>
            </div>
            <span className={cn(
              'text-2xl font-bold',
              coverageEvent.data.totalScore >= 80 ? 'text-green-500' :
              coverageEvent.data.totalScore >= 60 ? 'text-amber-500' : 'text-error'
            )}>
              {coverageEvent.data.totalScore}/100
            </span>
          </div>
          <div className="space-y-2.5">
            {([
              { label: 'Sous-thèmes couverts', value: coverageEvent.data.topicCoverage, weight: '35%' },
              { label: 'Entités intégrées', value: coverageEvent.data.entityCoverage, weight: '20%' },
              { label: 'Volume de contenu', value: coverageEvent.data.wordScore, weight: '20%' },
              { label: 'Section FAQ', value: coverageEvent.data.faqScore, weight: '15%' },
              { label: 'Alignement intention', value: coverageEvent.data.intentScore, weight: '10%' },
            ] as const).map((row, i) => (
              <div key={i} className="space-y-1">
                <div className="flex justify-between text-[10px] text-text-muted">
                  <span>{row.label} <span className="opacity-50">({row.weight})</span></span>
                  <span className="font-semibold">{row.value}%</span>
                </div>
                <div className="h-1.5 bg-border rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-700',
                      row.value >= 80 ? 'bg-green-500' : row.value >= 50 ? 'bg-amber-500' : 'bg-error'
                    )}
                    style={{ width: `${row.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Images Panel */}
      {imagesEvent && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="flex items-center gap-2 text-text-muted">
            <Image size={14} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Images Générées</span>
          </div>

          {/* Featured */}
          {imagesEvent.data.featured && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-text-muted uppercase tracking-wider">Image principale</p>
              <div className="flex items-center gap-3 p-3 bg-background border border-border rounded-lg">
                <img
                  src={imagesEvent.data.featured}
                  alt="Image principale"
                  className="w-20 h-12 object-cover rounded-md border border-border shrink-0"
                />
                <a
                  href={imagesEvent.data.featured}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-accent hover:underline truncate flex items-center gap-1"
                >
                  <ExternalLink size={10} />
                  {imagesEvent.data.featured.split('/').pop()}
                </a>
              </div>
            </div>
          )}

          {/* Content images */}
          {imagesEvent.data.content.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-text-muted uppercase tracking-wider">
                Images rich text ({imagesEvent.data.content.length})
              </p>
              <div className="space-y-2">
                {imagesEvent.data.content.map((img) => (
                  <div key={img.index} className="flex items-center gap-3 p-3 bg-background border border-border rounded-lg">
                    <span className="text-[10px] font-bold text-text-muted shrink-0 w-5 text-center">{img.index}</span>
                    <img
                      src={img.url}
                      alt={`Image contenu ${img.index}`}
                      className="w-20 h-12 object-cover rounded-md border border-border shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-text-muted italic truncate">{img.prompt}…</p>
                      <a
                        href={img.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-accent hover:underline truncate flex items-center gap-1 mt-0.5"
                      >
                        <ExternalLink size={10} />
                        {img.url.split('/').pop()}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Content Preview */}
      {previewEvent && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="flex items-center gap-2 text-text-muted mb-2">
            <Eye size={14} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Aperçu Métadonnées</span>
          </div>
          <div className="space-y-4">
            <div className="p-3 bg-background border border-border rounded-lg space-y-1">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold text-zinc-500 uppercase">Google Preview</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-border text-text-muted">{previewEvent.data.titleTag.length} chars</span>
              </div>
              <p className="text-[#1a0dab] dark:text-[#8ab4f8] text-lg font-medium hover:underline cursor-pointer truncate">
                {previewEvent.data.titleTag}
              </p>
              <p className="text-[#4d5156] dark:text-[#bdc1c6] text-xs leading-relaxed line-clamp-2">
                {previewEvent.data.metaDescription}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Embeds */}
      {embedsEvent && (
        <EmbedsPanel faqEmbed={embedsEvent.data.faqEmbed} schemas={embedsEvent.data.schemas} />
      )}

      {/* Debug details */}
      {debugEvents.length > 0 && (
        <details className="group border border-border rounded-xl bg-card overflow-hidden transition-all">
          <summary className="flex items-center justify-between px-5 py-3 cursor-pointer select-none text-xs font-bold text-text-muted uppercase tracking-wider hover:bg-border/30">
            <div className="flex items-center gap-2">
              <Code2 size={14} />
              Débogage Système ({debugEvents.length})
            </div>
            <ChevronDown className="group-open:rotate-180 transition-transform" size={14} />
          </summary>
          <div className="px-5 pb-5 space-y-4 border-t border-border bg-black/5">
            {debugEvents.map((e, i) => (
              <div key={i} className="space-y-2 mt-4">
                <p className="text-[10px] font-mono text-zinc-500 font-bold">{e.label}</p>
                <pre className="text-[10px] font-mono bg-background border border-border rounded-lg p-3 overflow-x-auto text-text-muted">
                  {JSON.stringify(
                    Object.fromEntries(Object.entries(e).filter(([k]) => k !== 'type' && k !== 'label')),
                    null, 2
                  )}
                </pre>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Final States */}
      {errorEvent && (
        <div className="bg-error/10 border border-error/20 rounded-xl p-5 flex gap-4 items-start animate-in zoom-in-95 duration-300">
          <div className="mt-1 p-2 bg-error/20 rounded-lg">
            <AlertCircle className="text-error" size={20} />
          </div>
          <div>
            <p className="font-bold text-error text-sm">Échec du processus</p>
            <p className="text-xs text-error/80 mt-1 leading-relaxed">{errorEvent.message}</p>
          </div>
        </div>
      )}

      {doneEvent?.data && (
        <div className="bg-success/10 border border-success/20 rounded-xl p-6 flex gap-5 items-start animate-in zoom-in-95 duration-500">
          <div className="mt-1 p-2 bg-success/20 rounded-lg">
            <CheckCircle2 className="text-success" size={24} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-success text-lg">Article publié !</p>
            <p className="text-sm text-success/80 mt-1 mb-4 truncate">{doneEvent.data.itemName}</p>
            <div className="flex flex-wrap gap-3">
              <a
                href={`https://webflow.com/design/${doneEvent.data.collectionId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary py-2 px-4 text-xs gap-2 bg-success hover:opacity-90 border-none"
              >
                <ExternalLink size={14} />
                Ouvrir Webflow
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmbedsPanel({ faqEmbed, schemas = [] }: { faqEmbed: string | null; schemas?: { position: string; code: string }[] }) {
  const blocks: { label: string; hint: string; code: string }[] = [];
  if (faqEmbed) {
    blocks.push({
      label: 'FAQ — Accordéon HTML',
      hint: 'À insérer en fin d\'article via un bloc Embed Webflow',
      code: faqEmbed,
    });
  }
  schemas.forEach((s, i) => {
    blocks.push({
      label: `Schéma visuel ${i + 1}`,
      hint: s.position ? `Après : ${s.position}` : `Schéma ${i + 1}`,
      code: s.code,
    });
  });

  if (blocks.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm animate-in fade-in duration-700">
      <div className="bg-accent/10 border-b border-border px-5 py-4 flex items-center gap-3">
        <Code2 size={20} className="text-accent" />
        <div>
          <p className="text-xs font-bold text-text uppercase tracking-wider">Embeds Manuels</p>
          <p className="text-[10px] text-text-muted mt-0.5">L'API CMS ne supporte pas les scripts — copiez-les manuellement.</p>
        </div>
      </div>
      <div className="divide-y divide-border">
        {blocks.map((block, i) => (
          <EmbedBlock key={i} {...block} />
        ))}
      </div>
    </div>
  );
}

function EmbedBlock({ label, hint, code }: { label: string; hint: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-5 space-y-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold text-text uppercase tracking-tight">{label}</p>
          <p className="text-[10px] text-text-muted mt-0.5 italic">{hint}</p>
        </div>
        <button
          onClick={handleCopy}
          className={cn(
            "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border",
            copied
              ? "bg-success/10 text-success border-success/20"
              : "bg-background border-border text-text-muted hover:border-text/20 hover:text-text"
          )}
        >
          {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
          {copied ? 'Copié' : 'Copier'}
        </button>
      </div>
      <div className="relative">
        <pre className={cn(
          "text-[10px] font-mono bg-background border border-border rounded-lg p-3 overflow-x-auto text-text-muted leading-relaxed",
          !expanded && "max-h-24 overflow-hidden"
        )}>
          {code}
        </pre>
        {code.length > 200 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 text-[10px] font-bold text-text-muted hover:text-text flex items-center gap-1 transition-colors"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? 'Réduire' : 'Voir tout le code'}
          </button>
        )}
      </div>
    </div>
  );
}
