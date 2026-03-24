'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import AppLayout from '../../components/AppLayout';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle2, AlertCircle, Loader2, Clock,
  Search, TrendingUp, Layers, Sparkles, Rocket, Globe,
  MousePointerClick, Zap, ExternalLink, BarChart2, Link as LinkIcon, Type,
  Copy, Check, ChevronDown, ThumbsUp, ThumbsDown,
  Lightbulb, MessageSquare, Database,
  ChevronLeft,
} from 'lucide-react';
import { WebflowIcon, GoogleIcon, CountryFlag, ChatGptIcon, GeminiIcon, PerplexityIcon, RedditIcon } from '../../components/WorkflowBlocks';
import { Skeleton } from '../../components/UI';
import { cn } from '../../utils/cn';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface WorkflowRun {
  id: string;
  workflow_id: string | null;
  project_id: string | null;
  status: 'running' | 'done' | 'error';
  created_at: string;
  rating?: number | null;
  workflows: { name: string } | null;
  sites: { name: string } | null;
}

interface RunStep {
  id: string;
  workflow_run_id: string;
  module_type: string;
  step_index: number;
  status: 'done' | 'error' | 'skipped';
  result_json: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
}

// ─── Module meta ──────────────────────────────────────────────────────────────


const MODULE_META: Record<string, { label: string; icon?: React.ElementType; accent?: string; brandIcon?: React.ElementType }> = {
  'trigger-manual':        { label: 'Déclencheur',              icon: MousePointerClick, accent: 'text-amber-400' },
  'text-input':            { label: 'Entrée texte',              icon: Type,              accent: 'text-slate-400' },
  'prompt-input':          { label: 'Prompt GEO',               icon: MessageSquare,     accent: 'text-violet-400' },
  'website-scraper':       { label: 'Scraping de site',          icon: Globe,             accent: 'text-cyan-400' },
  'keyword-research':      { label: 'Recherche mots-clés',      icon: Search,            accent: 'text-blue-400' },
  'serp-analysis':         { label: 'Analyse SERP',              brandIcon: GoogleIcon },
  'semantic-extraction':   { label: 'Extraction sémantique',    icon: Layers,            accent: 'text-green-400' },
  'blog-generation':       { label: 'Génération de blog',        icon: Sparkles,          accent: 'text-accent' },
  'content-generation':    { label: 'Génération de contenu',    icon: Sparkles,          accent: 'text-accent' },
  'webflow-publish':       { label: 'Publication Webflow',       brandIcon: WebflowIcon },
  'webflow-structure':     { label: 'Structure Webflow',         brandIcon: WebflowIcon },
  'geo-prompt-generator':   { label: 'Générateur de prompt GEO',  icon: Lightbulb,  accent: 'text-yellow-400' },
  'blog-generation-geo':   { label: 'Blog GEO',                  icon: Sparkles,   accent: 'text-violet-400' },
  'chatgpt-analysis':      { label: 'Analyse ChatGPT',            brandIcon: ChatGptIcon },
  'gemini-analysis':       { label: 'Analyse Gemini',            brandIcon: GeminiIcon },
  'perplexity-analysis':   { label: 'Analyse Perplexity',        brandIcon: PerplexityIcon },
  'reddit-analyzer':       { label: 'Analyseur Reddit',           brandIcon: RedditIcon },
};

function getModuleMeta(type: string) {
  return MODULE_META[type] ?? { label: type, icon: Zap, accent: 'text-text-muted' };
}

// ─── Status icon ──────────────────────────────────────────────────────────────

function StepStatusIcon({ status }: { status: RunStep['status'] }) {
  if (status === 'done')    return <CheckCircle2 size={14} className="text-green-400 shrink-0" />;
  if (status === 'error')   return <AlertCircle size={14} className="text-red-400 shrink-0" />;
  return <Clock size={14} className="text-text-muted shrink-0" />;
}

function FeedbackButtons({ runId, stepId, section, token }: { runId?: string; stepId?: string; section: string; token?: string | null }) {
  const [vote, setVote] = useState<'like' | 'dislike' | null>(null);

  useEffect(() => {
    if (!runId || !stepId) return;
    fetch(`${API_URL}/feedback?runId=${runId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then((votes: Record<string, 'like' | 'dislike'>) => {
        if (votes[stepId]) setVote(votes[stepId]);
      })
      .catch(() => {});
  }, [runId, stepId, token]);

  async function sendFeedback(v: 'like' | 'dislike') {
    setVote(v);
    try {
      await fetch(`${API_URL}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ runId, stepId, section, rating: v }),
      });
    } catch (e) {
      // ignore errors
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button aria-label="like" onClick={() => sendFeedback('like')} className={cn('p-0.5 rounded', vote === 'like' ? 'bg-green-500/10' : 'hover:bg-background/50')}>
        <ThumbsUp size={12} className={cn(vote === 'like' ? 'text-green-400' : 'text-text-muted')} />
      </button>
      <button aria-label="dislike" onClick={() => sendFeedback('dislike')} className={cn('p-0.5 rounded', vote === 'dislike' ? 'bg-red-500/10' : 'hover:bg-background/50')}>
        <ThumbsDown size={12} className={cn(vote === 'dislike' ? 'text-red-400' : 'text-text-muted')} />
      </button>
    </div>
  );
}

// small helper to show a flag emoji for common languages
// replaced by `CountryFlag` component from WorkflowBlocks

// ─── Result renderers ─────────────────────────────────────────────────────────

function JsonViewer({ data }: { data: unknown }) {
  return (
    <pre className="text-[11px] font-mono text-text-muted/80 bg-background rounded-lg p-4 overflow-auto max-h-[600px] leading-relaxed">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function KeywordResult({ data }: { data: Record<string, unknown> }) {
  const kw = data.mainKeyword as string ?? data.directKeyword as string ?? '—';
  const kd = data.kd as number | null;
  const vol = data.kwSearchVolume as number | null;
  const secondary = data.secondaryKeywords as string[] ?? [];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-2.5">
          <Search size={16} className="text-blue-400" />
          <span className="font-bold text-lg text-text">{kw}</span>
        </div>
        {kd != null && (
          <div className="bg-card border border-border rounded-lg px-3 py-2 text-center">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-0.5">KD</p>
            <p className="text-lg font-bold text-text">{kd}</p>
          </div>
        )}
        {vol != null && (
          <div className="bg-card border border-border rounded-lg px-3 py-2 text-center">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-0.5">Volume</p>
            <p className="text-lg font-bold text-text">{vol.toLocaleString('fr-FR')}</p>
          </div>
        )}
      </div>
      {secondary.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-text-muted mb-2">Mots-clés secondaires</p>
          <div className="flex flex-wrap gap-1.5">
            {secondary.slice(0, 20).map((kw, i) => (
              <span key={i} className="text-xs bg-blue-500/5 border border-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-mono">
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SerpResult({ data }: { data: Record<string, unknown> }) {
  const results = (data.serpResults as { url?: string; title?: string; description?: string; position?: number }[]) ?? [];
  function getFavicon(url?: string) {
    if (!url) return '/favicon.ico';
    try {
      const host = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?sz=64&domain=${host}`;
    } catch {
      return '/favicon.ico';
    }
  }

  const favicons = results.slice(0, 4).map(r => getFavicon(r.url));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 mb-3">
        <p className="text-[12px] font-medium tracking-widest text-text-muted">{results.length} Résultats</p>
        <div className="flex items-center">
          <div className="flex items-center">
            {favicons.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`favicon-${i}`}
                className={cn('rounded-full object-cover w-4 h-4 border', i !== 0 ? '-ml-1' : '')}
                style={{ zIndex: 20 - i }}
              />
            ))}
          </div>
        </div>
      </div>

      {results.slice(0, 15).map((r, i) => (
        <div key={i} className="bg-card border border-border rounded-lg p-3 flex items-start gap-3">
          <span className="text-[10px] font-bold text-text-muted/40 w-5 shrink-0 mt-0.5">{r.position ?? i + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text truncate">{r.title ?? '—'}</p>
            <p className="text-[10px] text-text-muted font-mono truncate mt-0.5">{r.url}</p>
            {r.description && (
              <p className="text-xs text-text-muted/70 mt-1 line-clamp-2">{r.description}</p>
            )}
          </div>
          {r.url && (
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-text-muted/40 hover:text-accent shrink-0 mt-0.5">
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

function SemanticResult({ data }: { data: Record<string, unknown> }) {
  const analysis = (data.semanticAnalysis as Record<string, unknown>) ?? data;
  const serpModel = data.serpModel as Record<string, unknown> | undefined;
  const primary = (analysis.primaryTerms as string[]) ?? [];
  const secondary = (analysis.secondaryTerms as string[]) ?? [];
  const longTail = (analysis.longTailVariants as string[]) ?? [];
  const entities = (analysis.entities as string[]) ?? [];
  const coOccurrences = (analysis.coOccurrences as string[]) ?? [];
  const gaps = (analysis.contentGaps as string[]) ?? [];
  type SemanticTerm = { display?: string; term: string; minCount?: number; maxCount?: number; target?: number };
  const intentTopTerms = (analysis.intentTopTerms as SemanticTerm[]) ?? [];
  const top30 = intentTopTerms.slice(0, 30).map(t => t.display || t.term);
  const hasTargets = intentTopTerms.some(t => t.target != null || t.minCount != null);

  function Pills({ terms, color }: { terms: string[]; color: string }) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {terms.map((t, i) => (
          <span key={i} className={cn('text-xs px-2 py-0.5 rounded-full border font-mono', color)}>{t}</span>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* SERP model summary */}
      {serpModel && (
        <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-4 space-y-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-violet-400 mb-1">Modèle SERP concurrent</p>
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="bg-background rounded-lg p-2.5 border border-border">
              <p className="text-[9px] text-text-muted uppercase tracking-wider mb-0.5">Intention</p>
              <p className="font-semibold capitalize">{serpModel.intent as string ?? '—'}</p>
            </div>
            <div className="bg-background rounded-lg p-2.5 border border-border">
              <p className="text-[9px] text-text-muted uppercase tracking-wider mb-0.5">Format dominant</p>
              <p className="font-semibold capitalize">{serpModel.contentFormat as string ?? '—'}</p>
            </div>
            <div className="bg-background rounded-lg p-2.5 border border-border">
              <p className="text-[9px] text-text-muted uppercase tracking-wider mb-0.5">Mots cibles</p>
              <p className="font-semibold">{serpModel.avgWordCount ? Math.round((serpModel.avgWordCount as number) * 1.1).toLocaleString('fr-FR') : '—'} mots</p>
            </div>
            <div className="bg-background rounded-lg p-2.5 border border-border">
              <p className="text-[9px] text-text-muted uppercase tracking-wider mb-0.5">Sous-thèmes SERP</p>
              <p className="font-semibold">{(serpModel.dominantSubtopics as string[])?.length ?? 0} détectés</p>
            </div>
          </div>
          {(serpModel.dominantSubtopics as string[])?.length > 0 && (
            <div>
              <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1.5">Sous-thèmes à couvrir</p>
              <div className="flex flex-wrap gap-1.5">
                {(serpModel.dominantSubtopics as string[]).map((t, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 text-xs border border-violet-500/20">{t}</span>
                ))}
              </div>
            </div>
          )}
          {(serpModel.recurringEntities as string[])?.length > 0 && (
            <div>
              <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1.5">Entités clés</p>
              <div className="flex flex-wrap gap-1.5">
                {(serpModel.recurringEntities as string[]).map((e, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-border text-text-muted text-xs">{e}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TF-IDF terms — full table */}
      {intentTopTerms.length > 0 && (
        <details className="border border-border rounded-xl overflow-hidden group">
          <summary className="flex items-center justify-between px-4 py-2.5 bg-background/80 cursor-pointer select-none list-none">
            <p className="text-[9px] font-bold uppercase tracking-widest text-accent">
              Termes TF-IDF prioritaires ({intentTopTerms.length})
            </p>
            <ChevronDown size={13} className="text-text-muted transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div className="border-t border-border">
          {hasTargets ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-background/80 border-b border-border">
                  <th className="text-left px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-text-muted">#</th>
                  <th className="text-left px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-text-muted">Terme</th>
                  <th className="text-center px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-text-muted">Cible</th>
                  <th className="text-center px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-text-muted">Plage</th>
                </tr>
              </thead>
              <tbody>
                {intentTopTerms.map((t, i) => (
                  <tr key={i} className={cn('border-b border-border/50 last:border-0', i % 2 === 0 ? 'bg-card' : 'bg-background/30')}>
                    <td className="px-3 py-1.5 text-text-muted/40 tabular-nums text-[10px]">{i + 1}</td>
                    <td className="px-3 py-1.5 font-mono text-accent/90">{t.display || t.term}</td>
                    <td className="px-3 py-1.5 text-center text-text-muted tabular-nums">{t.target != null ? `~${t.target}` : '—'}</td>
                    <td className="px-3 py-1.5 text-center text-text-muted/60 tabular-nums text-[10px]">
                      {t.minCount != null ? `${t.minCount}–${t.maxCount ?? '∞'}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex flex-wrap gap-1.5 p-3">
              {intentTopTerms.map((t, i) => (
                <span key={i} className="text-xs bg-accent/5 border border-accent/20 text-accent px-2 py-0.5 rounded-full font-mono">
                  {t.display || t.term}
                </span>
              ))}
            </div>
          )}
          </div>
        </details>
      )}

      {primary.length > 0 && (
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-green-400/70 mb-2">Termes primaires ({primary.length})</p>
          <Pills terms={primary} color="bg-green-500/5 border-green-500/20 text-green-300" />
        </div>
      )}
      {secondary.length > 0 && (
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-2">Termes secondaires ({secondary.length})</p>
          <Pills terms={secondary} color="bg-background border-border text-text-muted" />
        </div>
      )}
      {longTail.length > 0 && (
        <details className="border-t border-border pt-3">
          <summary className="text-[9px] font-bold uppercase tracking-widest text-text-muted cursor-pointer select-none">
            Longues traînes ({longTail.length})
          </summary>
          <div className="mt-2 flex flex-col gap-1">
            {longTail.map((t, i) => (
              <span key={i} className="text-xs text-text-muted bg-background px-2 py-1 rounded border border-border font-mono">{t}</span>
            ))}
          </div>
        </details>
      )}
      {entities.length > 0 && (
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-violet-400/70 mb-2">Entités sémantiques ({entities.length})</p>
          <Pills terms={entities} color="bg-violet-500/5 border-violet-500/20 text-violet-300" />
        </div>
      )}
      {coOccurrences.length > 0 && (
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-2">Co-occurrences</p>
          <div className="flex flex-col gap-0.5">
            {coOccurrences.slice(0, 10).map((c, i) => (
              <span key={i} className="text-xs text-text-muted font-mono">{c}</span>
            ))}
          </div>
        </div>
      )}
      {gaps.length > 0 && (
        <details className="border-t border-border pt-3">
          <summary className="text-[9px] font-bold uppercase tracking-widest text-amber-400/80 cursor-pointer select-none">
            Gaps de contenu ({gaps.length})
          </summary>
          <div className="mt-2 space-y-1">
            {gaps.map((g, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-text-muted bg-amber-500/5 border border-amber-500/15 rounded px-2 py-1">
                <span className="text-amber-400 font-bold shrink-0">{i + 1}.</span>
                <span>{g}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="flex items-center gap-1 text-xs text-text-muted hover:text-text transition-colors">
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
      {copied ? 'Copié' : 'Copier'}
    </button>
  );
}


function BlogGenerationResult({ data, semanticData }: { data: Record<string, unknown>; semanticData?: Record<string, unknown> }) {
  const [tab, setTab] = useState<'meta' | 'rendu' | 'html' | 'outline' | 'schema' | 'tfidf'>('meta');
  const parsedBlog = (data.parsedBlog as Record<string, unknown>) ?? {};
  const fieldData = (data.fieldData as Record<string, unknown>) ?? {};
  const htmlBody = (data.htmlBody as string) ?? (fieldData['body'] as string) ?? '';
  const htmlBodyFull = (data.htmlBodyFull as string) ?? '';
  const outline = (data.outline as string) ?? '';
  const h1 = (parsedBlog.h1 as string) ?? (fieldData['title'] as string) ?? (data.title as string) ?? '—';
  const metaTitle = (parsedBlog.titleTag as string) ?? (fieldData['meta-title'] as string) ?? (fieldData['metaTitle'] as string) ?? '—';
  const metaDesc = (parsedBlog.metaDescription as string) ?? (fieldData['meta-description'] as string) ?? (fieldData['metaDescription'] as string) ?? '—';
  const schemas = (parsedBlog.schemas as (string | { code: string; type?: string; position?: string })[]) ?? [];
  const faqEmbed = (parsedBlog.faqEmbed as string) ?? '';
  const hasSchema = schemas.length > 0 || !!faqEmbed;
  const blogContent = data.blogContent as string | undefined;
  const wordCount = blogContent ? blogContent.split(/\s+/).filter(Boolean).length : null;

  // TF-IDF analysis
  type TfidfTerm = { term: string; display?: string; minCount?: number; maxCount?: number; target?: number };
  const semanticAnalysis = (semanticData?.semanticAnalysis as Record<string, unknown>) ?? semanticData ?? {};
  const intentTopTerms = ((semanticAnalysis.intentTopTerms as TfidfTerm[]) ?? []).filter(t => (t.target ?? 0) > 0 || (t.minCount ?? 0) > 0).slice(0, 50);
  const hasTfidf = intentTopTerms.length > 0;

  const plainText = blogContent ?? (htmlBody ? htmlBody.replace(/<[^>]+>/g, ' ') : '');
  const lowerText = plainText.toLowerCase();
  const tfidfRows = intentTopTerms.map(t => {
    const label = (t.display || t.term).toLowerCase();
    const re = new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const count = (plainText.match(re) ?? []).length;
    const min = t.minCount ?? 0;
    const max = t.maxCount ?? Infinity;
    const target = t.target ?? 0;
    const status: 'ok' | 'low' | 'high' | 'missing' =
      count === 0 ? 'missing' : count < min ? 'low' : max !== Infinity && count > max ? 'high' : 'ok';
    return { label: t.display || t.term, count, min, max: t.maxCount, target, status };
  });
  void lowerText;

  const tabs = [
    { id: 'meta' as const, label: 'Métadonnées' },
    ...(outline ? [{ id: 'outline' as const, label: 'Plan' }] : []),
    { id: 'rendu' as const, label: 'Rendu' },
    { id: 'html' as const, label: 'HTML' },
    ...(hasSchema ? [{ id: 'schema' as const, label: 'Schéma' }] : []),
    ...(hasTfidf ? [{ id: 'tfidf' as const, label: 'TF-IDF' }] : []),
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      {wordCount != null && (
        <div className="flex items-center gap-2 text-xs text-text-muted bg-card border border-border rounded-lg px-3 py-2 w-fit shrink-0">
          <Sparkles size={12} className="text-accent" />
          <span><span className="font-bold text-text">{wordCount.toLocaleString('fr-FR')}</span> mots générés</span>
        </div>
      )}
      <div className="p-0.5 bg-background rounded-lg flex w-fit shrink-0">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('px-4 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all',
              tab === t.id ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text')}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'meta' && (
        <div className="space-y-3 overflow-auto flex-1">
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">H1</p>
              <CopyButton text={h1} />
            </div>
            <p className="text-sm font-semibold text-text">{h1}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Title Tag</p>
              <CopyButton text={metaTitle} />
            </div>
            <p className="text-sm text-text">{metaTitle}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Meta Description</p>
              <CopyButton text={metaDesc} />
            </div>
            <p className="text-sm text-text">{metaDesc}</p>
          </div>
        </div>
      )}
      {tab === 'outline' && (
        <pre className="text-[11px] font-mono text-text-muted/80 bg-background rounded-lg p-4 overflow-auto flex-1 leading-relaxed whitespace-pre-wrap">
          {outline}
        </pre>
      )}
      {tab === 'rendu' && (
        <div className="flex flex-col flex-1 min-h-0 gap-3">
          <div className="flex items-center justify-between shrink-0">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">
              Aperçu rendu <span className="normal-case font-normal tracking-normal text-text-muted/60">(copiez le HTML ci-dessous pour le coller dans un rich text)</span>
            </p>
            <CopyButton text={htmlBody} />
          </div>
          <style>{`
            .blog-render h2 { font-size: 1.3rem; font-weight: 700; margin: 1.5em 0 0.5em; }
            .blog-render h3 { font-size: 1.1rem; font-weight: 600; margin: 1.2em 0 0.4em; }
            .blog-render p  { margin: 0.6em 0; }
            .blog-render a  { color: #2563eb; text-decoration: underline; }
            .blog-render ul, .blog-render ol { padding-left: 1.5em; margin: 0.6em 0; }
            .blog-render li { margin: 0.3em 0; }
            .blog-render strong { font-weight: 700; }
          `}</style>
          <div
            className="blog-render bg-white rounded-lg p-6 overflow-auto flex-1 min-h-0 text-sm leading-relaxed"
            style={{ fontFamily: 'Georgia, serif', color: '#1a1a1a' }}
            dangerouslySetInnerHTML={{ __html: htmlBody }}
          />
        </div>
      )}
      {tab === 'html' && (
        <div className="space-y-4 overflow-auto flex-1">
          {/* Corps seul — pour Webflow et CMS avec rich-text */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-background">
              <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Corps seul <span className="text-accent/60 normal-case font-normal tracking-normal">(sans FAQ ni schémas — compatible API Webflow)</span></p>
              <CopyButton text={htmlBody} />
            </div>
            <pre className="text-[11px] font-mono text-text-muted/70 bg-background p-4 overflow-auto max-h-[400px] leading-relaxed whitespace-pre-wrap break-words">
              {htmlBody || '(aucun contenu HTML)'}
            </pre>
          </div>
          {/* Version complète — corps + FAQ + schémas concaténés */}
          {htmlBodyFull && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-background">
                <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Version complète <span className="text-amber-400/70 normal-case font-normal tracking-normal">(corps + FAQ + schémas — copier-coller manuel)</span></p>
                <CopyButton text={htmlBodyFull} />
              </div>
              <pre className="text-[11px] font-mono text-text-muted/70 bg-background p-4 overflow-auto max-h-[400px] leading-relaxed whitespace-pre-wrap break-words">
                {htmlBodyFull}
              </pre>
            </div>
          )}
        </div>
      )}
      {tab === 'schema' && (
        <div className="space-y-4 overflow-auto flex-1">
          {schemas.map((schema, i) => {
            const code     = typeof schema === 'string' ? schema : (schema as Record<string,string>).code ?? '';
            const type     = typeof schema === 'string' ? null   : (schema as Record<string,string>).type ?? null;
            const position = typeof schema === 'string' ? null   : (schema as Record<string,string>).position ?? null;
            return (
            <div key={i} className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-background">
                <div className="flex items-center gap-2">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">
                    Schéma {i + 1}
                  </p>
                  {type && <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 uppercase tracking-widest font-bold">{type}</span>}
                  {position && <span className="text-[10px] text-text-muted/50 italic">après : {position}</span>}
                </div>
                <CopyButton text={code} />
              </div>
              <pre className="text-[11px] font-mono text-text-muted/80 bg-background p-4 overflow-auto max-h-72 whitespace-pre-wrap break-words leading-relaxed">
                {code}
              </pre>
            </div>
            );
          })}
          {faqEmbed && (() => {
            const scriptIdx = faqEmbed.indexOf('<script');
            const faqHtml   = scriptIdx !== -1 ? faqEmbed.slice(0, scriptIdx).trim() : faqEmbed.trim();
            const faqJsonLd = scriptIdx !== -1 ? faqEmbed.slice(scriptIdx).trim()    : '';
            return (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-background">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">
                    FAQ <span className="text-text-muted/50 normal-case font-normal tracking-normal">(HTML accordéon + schema.org JSON-LD)</span>
                  </p>
                  <CopyButton text={faqEmbed} />
                </div>
                {faqHtml && (
                  <pre className="text-[11px] font-mono text-text-muted/80 bg-background px-4 pt-4 overflow-auto max-h-72 whitespace-pre-wrap break-words leading-relaxed">
                    {faqHtml}
                  </pre>
                )}
                {faqJsonLd && (
                  <>
                    <div className="px-4 py-1.5 bg-background border-t border-white/5">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-green-400/60">schema.org JSON-LD</span>
                    </div>
                    <pre className="text-[11px] font-mono text-text-muted/80 bg-background px-4 pb-4 overflow-auto max-h-60 whitespace-pre-wrap break-words leading-relaxed">
                      {faqJsonLd}
                    </pre>
                  </>
                )}
              </div>
            );
          })()}
        </div>
      )}
      {tab === 'tfidf' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">{tfidfRows.length} termes TF-IDF analysés</p>
            <div className="flex items-center gap-3 text-[9px] uppercase tracking-wider">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Dans la cible</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Insuffisant</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Dépassé</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-border inline-block" />Absent</span>
            </div>
          </div>
          <div className="rounded-xl overflow-hidden border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-background/80 border-b border-border">
                  <th className="text-left px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-text-muted">Terme</th>
                  <th className="text-center px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-text-muted">Utilisé</th>
                  <th className="text-center px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-text-muted">Cible</th>
                  <th className="text-center px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-text-muted">Plage</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {tfidfRows.map((row, i) => {
                  const pct = row.target > 0 ? Math.min(row.count / row.target, 2) : 0;
                  const barColor = row.status === 'ok' ? 'bg-green-500' : row.status === 'low' ? 'bg-amber-400' : row.status === 'high' ? 'bg-red-400' : 'bg-border';
                  const textColor = row.status === 'ok' ? 'text-green-400' : row.status === 'low' ? 'text-amber-400' : row.status === 'high' ? 'text-red-400' : 'text-text-muted/40';
                  return (
                    <tr key={i} className={cn('border-b border-border/50 last:border-0', i % 2 === 0 ? 'bg-card' : 'bg-background/30')}>
                      <td className="px-3 py-2 font-mono text-text">{row.label}</td>
                      <td className={cn('px-3 py-2 text-center font-bold tabular-nums', textColor)}>{row.count}</td>
                      <td className="px-3 py-2 text-center text-text-muted tabular-nums">~{row.target}</td>
                      <td className="px-3 py-2 text-center text-text-muted/60 tabular-nums text-[10px]">{row.min}–{row.max ?? '∞'}</td>
                      <td className="px-3 py-2 w-28">
                        <div className="h-1.5 bg-border rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${Math.min(pct * 100, 100)}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ContentResult({ data }: { data: Record<string, unknown> }) {
  const [tab, setTab] = useState<'meta' | 'html'>('meta');
  const fieldData = (data.fieldData as Record<string, unknown>) ?? {};
  const htmlBody = (data.htmlBody as string) ?? (fieldData['body'] as string) ?? '';
  const title = (fieldData['title'] as string) ?? (data.title as string) ?? '—';
  const metaTitle = (fieldData['meta-title'] as string) ?? (fieldData['metaTitle'] as string) ?? '—';
  const metaDesc = (fieldData['meta-description'] as string) ?? (fieldData['metaDescription'] as string) ?? '—';

  return (
    <div className="space-y-4">
      <div className="p-0.5 bg-background rounded-lg flex w-fit">
        {(['meta', 'html'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('px-4 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all',
              tab === t ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text')}>
            {t === 'meta' ? 'Métadonnées' : 'HTML'}
          </button>
        ))}
      </div>
      {tab === 'meta' ? (
        <div className="space-y-3">
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Titre</p>
              <CopyButton text={title} />
            </div>
            <p className="text-sm font-semibold text-text">{title}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Meta Title</p>
              <CopyButton text={metaTitle} />
            </div>
            <p className="text-sm text-text">{metaTitle}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Meta Description</p>
              <CopyButton text={metaDesc} />
            </div>
            <p className="text-sm text-text">{metaDesc}</p>
          </div>
        </div>
      ) : (
        <pre className="text-[11px] font-mono text-text-muted/70 bg-background rounded-lg p-4 overflow-auto max-h-[500px] leading-relaxed whitespace-pre-wrap break-words">
          {htmlBody || '(aucun contenu HTML)'}
        </pre>
      )}
    </div>
  );
}

function WebflowResult({ data }: { data: Record<string, unknown> }) {
  const itemId = data.webflowItemId as string ?? '—';
  const itemUrl = data.webflowItemUrl as string ?? null;
  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
        <Rocket size={18} className="text-orange-400 shrink-0" />
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-0.5">Item ID Webflow</p>
          <p className="text-sm font-mono text-text">{itemId}</p>
        </div>
      </div>
      {itemUrl && (
        <a href={itemUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-accent hover:underline">
          <ExternalLink size={14} />
          Voir l'article publié
        </a>
      )}
    </div>
  );
}

function ScraperResult({ data }: { data: Record<string, unknown> }) {
  const profile = (data.siteProfile as Record<string, unknown>) ?? data;
  const sitemapUrls = (data.sitemapUrls as string[]) ?? [];
  const theme = profile.theme as string | undefined;
  const description = profile.description as string | undefined;
  const tone = profile.tone as string | undefined;
  const language = profile.language as string | undefined;
  const targetAudience = profile.targetAudience as string | undefined;
  const writingStyle = profile.writingStyle as string | undefined;
  const recommendedTone = profile.recommendedToneForGeneration as string | undefined;
  const mainTopics = (profile.mainTopics as string[]) ?? [];
  const keywords = (profile.keywords as string[]) ?? [];
  const existingTitles = (profile.existingBlogTitles as string[]) ?? [];
  const contentGaps = (profile.contentGaps as string[]) ?? [];

  return (
    <div className="space-y-4">
      {/* 1) Profile card: theme, tone, language, audience, writing style, recommended tone */}
      {/* Profile — wrapped in a card with stacked blocks */}
      <>
        {theme && (
          <div className="bg-background/50 border border-border/50 rounded-md p-3 mb-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-1">Thème</p>
            <h3 className="text-lg font-bold text-text mb-1">{theme}</h3>
            {description && <p className="text-sm text-text-muted leading-relaxed">{description}</p>}
          </div>
        )}

        <div className="grid gap-3">
          {tone && (
            <div className="bg-card border border-border rounded-md p-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Ton détecté</p>
              <p className="text-sm font-semibold text-text mt-1">{tone}</p>
            </div>
          )}

          {language && (
            <div className="bg-card border border-border rounded-md p-3 flex items-center gap-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Langue</p>
                <p className="text-sm font-semibold text-text uppercase flex items-center gap-2 mt-1">
                  <span className="shrink-0"><CountryFlag code={language} size={16} /></span>
                  <span>{language}</span>
                </p>
              </div>
            </div>
          )}

          {targetAudience && (
            <div className="bg-card border border-border rounded-md p-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Audience cible</p>
              <p className="text-sm text-text-muted leading-relaxed mt-1">{targetAudience}</p>
            </div>
          )}

          {writingStyle && (
            <div className="bg-card border border-border rounded-md p-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Style rédactionnel</p>
              <p className="text-sm text-text-muted leading-relaxed mt-1">{writingStyle}</p>
            </div>
          )}

          {recommendedTone && (
            <div className="bg-accent/5 border border-accent/15 rounded-md p-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-accent">Ton recommandé</p>
              <div className="mt-1 text-sm text-text-muted">{recommendedTone}</div>
            </div>
          )}
        </div>
      </>

      {/* 2) Topics & Keywords */}
      <div className="bg-card border border-border rounded-lg p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-3">Sujets & mots-clés</p>
        <div className="flex flex-col gap-3">
          {mainTopics.length > 0 && (
            <div>
              <div className="flex flex-wrap gap-2">
                {mainTopics.map((t, i) => (
                  <span key={i} className="text-sm text-text px-2 py-1 rounded bg-border/40">{t}</span>
                ))}
              </div>
            </div>
          )}

          {keywords.length > 0 && (
            <div>
              <div className="flex flex-wrap gap-2">
                {keywords.map((k, i) => (
                  <span key={i} className="text-xs text-text-muted font-mono px-2 py-1 rounded bg-background border border-border">{k}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3) Existing articles / Gaps / Sitemap — grouped in one card with details */}
      <div className="bg-card border border-border rounded-lg p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-3">Audit contenu</p>

        <div className="space-y-3">
          <details className="group">
            <summary className="flex items-center justify-between cursor-pointer select-none text-[12px] font-medium">
              <span>Articles existants ({existingTitles.length})</span>
              <ChevronDown size={13} className="text-text-muted transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <div className="mt-2 space-y-1">
              {existingTitles.map((t, i) => (
                <div key={i} className="text-sm text-text-muted">
                  {i + 1}. {t}
                </div>
              ))}
            </div>
          </details>

          <details className="group">
            <summary className="flex items-center justify-between cursor-pointer select-none text-[12px] font-medium">
              <span>Gaps de contenu ({contentGaps.length})</span>
              <ChevronDown size={13} className="text-text-muted transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <div className="mt-2 space-y-1">
              {contentGaps.map((g, i) => (
                <div key={i} className="text-sm text-text-muted">{i + 1}. {g}</div>
              ))}
            </div>
          </details>

          <details className="group">
            <summary className="flex items-center justify-between cursor-pointer select-none text-[12px] font-medium">
              <span>URLs sitemap ({sitemapUrls.length})</span>
              <ChevronDown size={13} className="text-text-muted transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
              {sitemapUrls.map((url, i) => (
                <div key={i} className="text-[13px] text-text-muted font-mono truncate">{url}</div>
              ))}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

function WebflowStructureResult({ data }: { data: Record<string, unknown> }) {
  const collectionId = data.collectionId as string ?? '—';
  const detectedFields = (data.detectedFields as Record<string, string>) ?? {};
  type WfField = { id?: string; slug?: string; displayName?: string; type?: string; required?: boolean };
  const webflowFields = (data.webflowFields as WfField[]) ?? [];

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg px-4 py-3 flex items-center gap-3">
        <Database size={16} className="text-orange-400 shrink-0" />
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-0.5">Collection ID</p>
          <p className="text-sm font-mono text-text">{collectionId}</p>
        </div>
      </div>

      {Object.keys(detectedFields).length > 0 && (
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-2">Champs détectés</p>
          <div className="rounded-xl overflow-hidden border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-background/80 border-b border-border">
                  <th className="text-left px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-text-muted">Rôle</th>
                  <th className="text-left px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-text-muted">Slug Webflow</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(detectedFields).map(([role, slug], i) => (
                  <tr key={role} className={cn('border-b border-border/50 last:border-0', i % 2 === 0 ? 'bg-card' : 'bg-background/30')}>
                    <td className="px-3 py-2 text-text-muted uppercase tracking-wider text-[10px] font-semibold">{role}</td>
                    <td className="px-3 py-2 font-mono text-accent/80">{slug}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {webflowFields.length > 0 && (
        <details className="border border-border rounded-xl overflow-hidden group">
          <summary className="flex items-center justify-between px-4 py-2.5 bg-background/80 cursor-pointer select-none list-none">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">
              Tous les champs ({webflowFields.length})
            </p>
            <ChevronDown size={13} className="text-text-muted transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div className="border-t border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-background/80 border-b border-border">
                  <th className="text-left px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-text-muted">Slug</th>
                  <th className="text-left px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-text-muted">Nom</th>
                  <th className="text-left px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-text-muted">Type</th>
                </tr>
              </thead>
              <tbody>
                {webflowFields.map((f, i) => (
                  <tr key={i} className={cn('border-b border-border/50 last:border-0', i % 2 === 0 ? 'bg-card' : 'bg-background/30')}>
                    <td className="px-3 py-2 font-mono text-accent/80">{f.slug ?? '—'}</td>
                    <td className="px-3 py-2 text-text">{f.displayName ?? '—'}</td>
                    <td className="px-3 py-2 text-text-muted text-[10px]">{f.type ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function GeoPromptResult({ data }: { data: Record<string, unknown> }) {
  const prompt = data.geoPrompt as string ?? '—';
  const topic = data.geoTopic as string ?? null;
  const rationale = data.geoRationale as string ?? null;

  return (
    <div className="space-y-3">
      {topic && (
        <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-4 py-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-yellow-400 mb-1">Sujet</p>
          <p className="text-sm font-semibold text-text">{topic}</p>
        </div>
      )}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Prompt GEO généré</p>
          <CopyButton text={prompt} />
        </div>
        <p className="text-sm text-text leading-relaxed">{prompt}</p>
      </div>
      {rationale && (
        <div className="bg-background/50 border border-border/50 rounded-lg px-4 py-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-1">Rationale</p>
          <p className="text-sm text-text-muted leading-relaxed">{rationale}</p>
        </div>
      )}
    </div>
  );
}

function VisualSchemasResult({ data }: { data: Record<string, unknown> }) {
  type Schema = { type?: string; position?: string; code: string };
  const schemas = (data.visualSchemas as Schema[]) ?? [];

  if (schemas.length === 0) {
    return <p className="text-xs text-text-muted italic">Aucun schéma généré.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-text-muted bg-card border border-border rounded-lg px-3 py-2 w-fit">
        <Sparkles size={12} className="text-sky-400" />
        <span><span className="font-bold text-text">{schemas.length}</span> schéma(s) visuel(s) généré(s)</span>
      </div>
      {schemas.map((schema, i) => (
        <div key={i} className="border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-background">
            <div className="flex items-center gap-2">
              <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">
                Schéma {i + 1}
              </p>
              {schema.type && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 uppercase tracking-widest font-bold">
                  {schema.type}
                </span>
              )}
              {schema.position && (
                <span className="text-[10px] text-text-muted/60 italic">après : {schema.position}</span>
              )}
            </div>
            <CopyButton text={schema.code} />
          </div>
          <pre className="text-[11px] font-mono text-text-muted/80 bg-background p-4 overflow-auto max-h-72 whitespace-pre-wrap break-words leading-relaxed">
            {schema.code}
          </pre>
        </div>
      ))}
    </div>
  );
}

function PromptInputResult({ data }: { data: Record<string, unknown> }) {
  const prompt = data.prompt as string ?? data.geoPrompt as string ?? '—';
  const topic = data.topic as string ?? data.geoTopic as string ?? null;

  return (
    <div className="space-y-3">
      {topic && (
        <div className="bg-violet-500/5 border border-violet-500/20 rounded-lg px-4 py-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-violet-400 mb-1">Sujet</p>
          <p className="text-sm font-semibold text-text">{topic}</p>
        </div>
      )}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Prompt</p>
          <CopyButton text={prompt} />
        </div>
        <p className="text-sm text-text leading-relaxed">{prompt}</p>
      </div>
    </div>
  );
}

function GeoLlmAnalysisResult({ data, responsesKey }: { data: Record<string, unknown>; responsesKey: string }) {
  const [tab, setTab] = useState<'questions' | 'sources' | 'gaps' | 'summary' | 'raw'>('summary');
  type GeoSource = { url?: string | null; name?: string; type?: string; frequency?: number };
  const questions          = Array.isArray(data.geoQuestions)           ? (data.geoQuestions as string[])           : [];
  const sources            = Array.isArray(data.geoSources)             ? (data.geoSources as GeoSource[])          : [];
  const commonPoints       = Array.isArray(data.geoCommonPoints)        ? (data.geoCommonPoints as string[])        : [];
  const contentGaps        = Array.isArray(data.geoContentGaps)         ? (data.geoContentGaps as string[])         : [];
  const responseVariations = Array.isArray(data.geoResponseVariations)  ? (data.geoResponseVariations as string[])  : [];
  const summary            = data.geoAnalysis as string                 ?? '';
  const rawResponses       = Array.isArray(data[responsesKey])          ? (data[responsesKey] as string[])          : [];

  const tabs = [
    { id: 'summary' as const,   label: 'Synthèse' },
    { id: 'questions' as const, label: `Questions (${questions.length})` },
    { id: 'sources' as const,   label: `Sources (${sources.length})` },
    { id: 'gaps' as const,      label: `Opportunités (${contentGaps.length})` },
    ...(rawResponses.length > 0 ? [{ id: 'raw' as const, label: `Réponses brutes (${rawResponses.length})` }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="p-0.5 bg-background rounded-lg flex flex-wrap gap-0.5 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all',
              tab === t.id ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text')}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <div className="space-y-3">
          {summary && (
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-2">Analyse GEO</p>
              <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">{summary}</p>
            </div>
          )}
          {commonPoints.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-2">Points communs</p>
              <div className="space-y-1">
                {commonPoints.map((p, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-text-muted bg-card border border-border rounded-lg px-3 py-2">
                    <span className="text-accent font-bold shrink-0 text-xs">{i + 1}.</span>
                    <span>{p}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {responseVariations.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-2">Variations observées</p>
              <div className="space-y-1">
                {responseVariations.map((v, i) => (
                  <div key={i} className="text-sm text-text-muted bg-background/50 border border-border/50 rounded px-3 py-1.5">{v}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'questions' && (
        <div className="space-y-1.5">
          {questions.length === 0 ? (
            <p className="text-sm text-text-muted italic">Aucune question identifiée.</p>
          ) : questions.map((q, i) => (
            <div key={i} className="flex items-start gap-2.5 bg-card border border-border rounded-lg px-3 py-2.5">
              <span className="text-blue-400 font-bold shrink-0 text-xs mt-0.5">Q{i + 1}</span>
              <p className="text-sm text-text">{q}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'sources' && (
        <div className="space-y-2">
          {sources.length === 0 ? (
            <p className="text-sm text-text-muted italic">Aucune source identifiée.</p>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-1">
                <p className="text-[12px] font-medium tracking-widest text-text-muted">{sources.length} source{sources.length > 1 ? 's' : ''}</p>
                <div className="flex items-center">
                  {sources.filter(src => !!src.url).slice(0, 3).map((src, i) => {
                    let favicon = '';
                    try { if (src.url) favicon = `https://www.google.com/s2/favicons?sz=64&domain=${new URL(src.url).hostname}`; } catch {}
                    if (!favicon) return null;
                    return (
                      <img key={i} src={favicon} alt="" className={cn('rounded-full object-cover w-4 h-4 border', i !== 0 ? '-ml-1' : '')} style={{ zIndex: 20 - i }} />
                    );
                  })}
                </div>
              </div>
              {sources.map((src, i) => {
                let favicon: string | null = null;
                let hostname: string | null = null;
                try { if (src.url) { const u = new URL(src.url); favicon = `https://www.google.com/s2/favicons?sz=64&domain=${u.hostname}`; hostname = u.hostname; } } catch {}
                return (
                  <div key={i} className="flex items-center gap-2.5 bg-card border border-border rounded-lg px-3 py-2">
                    {favicon && <img src={favicon} alt="" className="w-4 h-4 rounded-full object-cover shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-text font-medium truncate">{src.name ?? '—'}</p>
                        {src.type && <span className="text-[9px] uppercase tracking-wider text-text-muted/60 border border-border rounded px-1.5 py-0.5 shrink-0">{src.type}</span>}
                      </div>
                      {hostname && <p className="text-[10px] text-text-muted font-mono truncate">{hostname}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {(src.frequency ?? 0) > 1 && (
                        <span className="text-[10px] font-bold text-accent/70">×{src.frequency}</span>
                      )}
                      {src.url && (
                        <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-text-muted/40 hover:text-accent">
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {tab === 'gaps' && (
        <div className="space-y-2">
          {contentGaps.length === 0 ? (
            <p className="text-sm text-text-muted italic">Aucune opportunité identifiée.</p>
          ) : contentGaps.map((g, i) => (
            <div key={i} className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2.5">
              <span className="text-amber-400 font-bold shrink-0 text-xs mt-0.5">{i + 1}.</span>
              <p className="text-sm text-text">{g}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'raw' && (
        <div className="space-y-3">
          {rawResponses.map((resp, i) => (
            <div key={i} className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-background">
                <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Réponse {i + 1}</p>
                <CopyButton text={resp} />
              </div>
              <pre className="text-[11px] font-mono text-text-muted/70 bg-background p-4 overflow-auto max-h-[300px] leading-relaxed whitespace-pre-wrap break-words">
                {resp}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Reddit Analyzer Result ───────────────────────────────────────────────────

function RedditAnalyzerResult({ data }: { data: Record<string, unknown> }) {
  const posts    = (data.redditPosts    as Record<string,unknown>[]) ?? [];
  const patterns = (data.redditPatterns as Record<string,unknown>)   ?? null;
  const strategy = (data.redditStrategy as Record<string,unknown>)   ?? null;

  type TabId = 'posts' | 'patterns' | 'strategy';
  const [tab, setTab] = useState<TabId>('posts');

  const tabs: { id: TabId; label: string }[] = [
    { id: 'posts',    label: `Posts (${posts.length})` },
    ...(patterns ? [{ id: 'patterns' as TabId, label: 'Patterns' }] : []),
    ...(strategy ? [{ id: 'strategy' as TabId, label: 'Stratégie' }] : []),
  ];

  if (!posts.length && !patterns && !strategy) {
    return <p className="text-xs text-text-muted p-4">Aucun résultat Reddit disponible.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="p-0.5 bg-background rounded-lg flex w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('px-4 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all',
              tab === t.id ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Posts tab */}
      {tab === 'posts' && (
        <div className="space-y-3">
          {posts.map((post, i) => {
            const comments = (post.comments as {author:string;body:string;score:number}[]) ?? [];
            return (
              <div key={i} className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-start gap-3">
                  <RedditIcon size={18} className="shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text leading-snug">{post.title as string}</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-[10px] font-bold text-orange-400">{post.subredditPrefixed as string}</span>
                      <span className="text-[10px] text-text-muted">▲ {post.score as number} pts</span>
                      <span className="text-[10px] text-text-muted">{post.numComments as number} commentaires</span>
                      {post.flair && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">{post.flair as string}</span>}
                    </div>
                  </div>
                  <a href={post.permalink as string} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 text-[10px] text-text-muted hover:text-accent transition-colors underline">
                    Voir ↗
                  </a>
                </div>
                {post.selftext && (
                  <p className="px-4 py-2 text-xs text-text-muted/80 line-clamp-3 border-b border-border bg-background/30">
                    {post.selftext as string}
                  </p>
                )}
                {comments.length > 0 && (
                  <div className="divide-y divide-border">
                    {comments.slice(0, 5).map((c, j) => (
                      <div key={j} className="px-4 py-2 flex gap-2">
                        <span className="text-[10px] text-orange-400/70 font-mono shrink-0 w-10 text-right">▲{c.score}</span>
                        <p className="text-xs text-text-muted/80 line-clamp-2">{c.body}</p>
                      </div>
                    ))}
                    {comments.length > 5 && (
                      <p className="px-4 py-2 text-[10px] text-text-muted/40 italic">+{comments.length - 5} commentaires supplémentaires</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Patterns tab */}
      {tab === 'patterns' && patterns && (
        <div className="space-y-4">
          {/* Top subreddits */}
          {(patterns.topSubreddits as {name:string;postCount:number;avgScore:number;why:string}[] ?? []).length > 0 && (
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-3">Subreddits les plus cités</p>
              <div className="space-y-2">
                {(patterns.topSubreddits as {name:string;postCount:number;avgScore:number;why:string}[]).map((s, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-xs font-bold text-orange-400 w-28 shrink-0">{s.name}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] text-text-muted">{s.postCount} post{s.postCount > 1 ? 's' : ''}</span>
                        <span className="text-[10px] text-text-muted">· moy. {s.avgScore} pts</span>
                      </div>
                      <p className="text-xs text-text-muted/70 italic">{s.why}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Content types */}
          {(patterns.contentTypes as {type:string;count:number;avgScore:number;characteristics:string[]}[] ?? []).length > 0 && (
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-3">Types de contenus valorisés</p>
              <div className="space-y-3">
                {(patterns.contentTypes as {type:string;count:number;avgScore:number;characteristics:string[]}[]).map((t, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-text">{t.type}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent">{t.count}×</span>
                      <span className="text-[10px] text-text-muted ml-auto">moy. {t.avgScore} pts</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {t.characteristics.map((c, j) => (
                        <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-background border border-border text-text-muted">{c}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* What AI values */}
          {(patterns.whatAiValues as string[] ?? []).length > 0 && (
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-3">Pourquoi les IA citent ces contenus</p>
              <ul className="space-y-1.5">
                {(patterns.whatAiValues as string[]).map((v, i) => (
                  <li key={i} className="flex gap-2 text-xs text-text-muted"><span className="text-accent shrink-0">→</span>{v}</li>
                ))}
              </ul>
            </div>
          )}
          {/* Gaps */}
          {(patterns.gapsIdentified as string[] ?? []).length > 0 && (
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-3">Opportunités non couvertes</p>
              <ul className="space-y-1.5">
                {(patterns.gapsIdentified as string[]).map((g, i) => (
                  <li key={i} className="flex gap-2 text-xs text-text-muted"><span className="text-amber-400 shrink-0">💡</span>{g}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Strategy tab */}
      {tab === 'strategy' && strategy && (
        <div className="space-y-4">
          {/* Priority actions */}
          {(strategy.priorityActions as string[] ?? []).length > 0 && (
            <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg p-4">
              <p className="text-[9px] font-bold uppercase tracking-widest text-orange-400 mb-3">Actions prioritaires cette semaine</p>
              <ol className="space-y-1.5 list-decimal list-inside">
                {(strategy.priorityActions as string[]).map((a, i) => (
                  <li key={i} className="text-xs text-text">{a}</li>
                ))}
              </ol>
            </div>
          )}
          {/* Post ideas */}
          {(strategy.postIdeas as {title:string;subreddit:string;type:string;hook:string;outline:string[];geoValue:string;priority:string}[] ?? []).length > 0 && (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-2 border-b border-border">
                <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Idées de posts à publier</p>
              </div>
              <div className="divide-y divide-border">
                {(strategy.postIdeas as {title:string;subreddit:string;type:string;hook:string;outline:string[];geoValue:string;priority:string}[]).map((p, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex items-start gap-2 mb-2">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-text">{p.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-bold text-orange-400">{p.subreddit}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-background border border-border text-text-muted">{p.type}</span>
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-bold', p.priority === 'haute' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-background border border-border text-text-muted')}>{p.priority}</span>
                        </div>
                      </div>
                      <CopyButton text={`${p.title}\n\n${p.hook}\n\n${p.outline.map((o,j) => `${j+1}. ${o}`).join('\n')}`} />
                    </div>
                    <p className="text-xs text-text-muted italic mb-2">{p.hook}</p>
                    <ul className="space-y-0.5 mb-2">
                      {p.outline.map((o, j) => <li key={j} className="text-xs text-text-muted/70 flex gap-1.5"><span className="shrink-0 text-accent">{j+1}.</span>{o}</li>)}
                    </ul>
                    <p className="text-[10px] text-accent/70 italic">GEO : {p.geoValue}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Comment templates */}
          {(strategy.commentTemplates as {context:string;targetSubreddits:string[];template:string;tone:string}[] ?? []).length > 0 && (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-2 border-b border-border">
                <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Templates de commentaires</p>
              </div>
              <div className="divide-y divide-border">
                {(strategy.commentTemplates as {context:string;targetSubreddits:string[];template:string;tone:string}[]).map((c, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-background border border-border text-text-muted">{c.tone}</span>
                        {c.targetSubreddits.slice(0,3).map((s,j) => <span key={j} className="text-[10px] font-bold text-orange-400">{s}</span>)}
                      </div>
                      <CopyButton text={c.template} />
                    </div>
                    <p className="text-[10px] text-text-muted/60 italic mb-2">{c.context}</p>
                    <pre className="text-xs text-text-muted/80 bg-background rounded p-2 whitespace-pre-wrap break-words">{c.template}</pre>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* AMA */}
          {strategy.amaStrategy && (strategy.amaStrategy as Record<string,unknown>).recommended && (
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-3">Opportunité AMA</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-orange-400">{(strategy.amaStrategy as Record<string,unknown>).subreddit as string}</span>
                  <span className="text-xs text-text-muted">— {(strategy.amaStrategy as Record<string,unknown>).timing as string}</span>
                </div>
                <p className="text-sm text-text">{(strategy.amaStrategy as Record<string,unknown>).angle as string}</p>
                <div>
                  <p className="text-[10px] text-text-muted mb-1">Questions à anticiper :</p>
                  <ul className="space-y-1">
                    {((strategy.amaStrategy as Record<string,unknown>).sampleQuestions as string[] ?? []).map((q, i) => (
                      <li key={i} className="text-xs text-text-muted flex gap-1.5"><span className="text-accent shrink-0">?</span>{q}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const AI_MODULES = new Set(['blog-generation', 'content-generation']);

function StepResult({ step, steps, token, runId }: { step: RunStep; steps: RunStep[]; token: string | null; runId: string }) {
  if (step.status === 'error') {
    return (
      <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle size={16} className="text-red-400" />
          <span className="text-sm font-bold text-red-400">Erreur</span>
        </div>
        <p className="text-sm text-text-muted font-mono">{step.error_message ?? 'Erreur inconnue'}</p>
      </div>
    );
  }

  if (!step.result_json) {
    return <p className="text-sm text-text-muted italic">Aucun résultat disponible.</p>;
  }

  const data = step.result_json as Record<string, unknown>;

  let content: React.ReactNode;
  switch (step.module_type) {
    case 'keyword-research':      content = <KeywordResult data={data} />; break;
    case 'serp-analysis':         content = <SerpResult data={data} />; break;
    case 'semantic-extraction':   content = <SemanticResult data={data} />; break;
    case 'blog-generation':       content = <BlogGenerationResult data={data} semanticData={steps.find(s => s.module_type === 'semantic-extraction')?.result_json ?? undefined} />; break;
    case 'content-generation':    content = <BlogGenerationResult data={data} semanticData={steps.find(s => s.module_type === 'semantic-extraction')?.result_json ?? undefined} />; break;
    case 'webflow-publish':       content = <WebflowResult data={data} />; break;
    case 'website-scraper':       content = <ScraperResult data={data} />; break;
    case 'webflow-structure':     content = <WebflowStructureResult data={data} />; break;
    case 'blog-generation-geo':   content = <BlogGenerationResult data={data} semanticData={undefined} />; break;
    case 'geo-prompt-generator':  content = <GeoPromptResult data={data} />; break;
    case 'prompt-input':          content = <PromptInputResult data={data} />; break;
    case 'chatgpt-analysis':      content = <GeoLlmAnalysisResult data={data} responsesKey="chatgptResponses" />; break;
    case 'gemini-analysis':       content = <GeoLlmAnalysisResult data={data} responsesKey="geminiResponses" />; break;
    case 'perplexity-analysis':   content = <GeoLlmAnalysisResult data={data} responsesKey="perplexityResponses" />; break;
    case 'reddit-analyzer':       content = <RedditAnalyzerResult data={data} />; break;
    case 'visual-schemas':        content = <VisualSchemasResult data={data} />; break;
    default:                      content = <JsonViewer data={data} />; break;
  }

  return (
    <div className="flex flex-col">
      {content}
      {token && null}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

function RunDetailContent() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStep, setSelectedStep] = useState<RunStep | null>(null);

  const lsKey = `run_step_${id}`;

  function selectStep(step: RunStep) {
    setSelectedStep(step);
    localStorage.setItem(lsKey, step.module_type);
  }

  useEffect(() => {
    if (!token || !id) return;
    Promise.all([
      fetch(`${API_URL}/workflow/runs/${id}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch(`${API_URL}/workflow/runs/${id}/steps`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ])
      .then(([runData, stepsData]) => {
        setRun(runData);
        const sortedSteps = Array.isArray(stepsData) ? stepsData.sort((a: RunStep, b: RunStep) => a.step_index - b.step_index) : [];
        setSteps(sortedSteps);
        if (sortedSteps.length > 0) {
          const saved = localStorage.getItem(lsKey);
          const restored = saved ? sortedSteps.find((s: RunStep) => s.module_type === saved) : null;
          setSelectedStep(restored ?? sortedSteps[0]);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, id]);

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-[1400px] mx-auto py-8 px-6">
          <Skeleton className="h-4 w-40 mb-6" />
          <Skeleton className="h-8 w-64 mb-8" />
          <div className="flex gap-6">
            <Skeleton className="w-64 h-[500px] rounded-xl shrink-0" />
            <Skeleton className="flex-1 h-[500px] rounded-xl" />
          </div>
        </div>
      </AppLayout>
    );
  }

  const statusColor = run?.status === 'done' ? 'text-green-400' : run?.status === 'error' ? 'text-red-400' : 'text-accent';

  const runHeader = (
    <div className="flex items-center gap-2.5">
      <Link href="/runs" className="inline-flex items-center text-text-muted hover:text-text transition-colors">
        <ChevronLeft size={14} />
      </Link>
      <span className="font-semibold text-text">{run?.workflows?.name ?? 'Exécution'}</span>
      <div className="flex items-center gap-3 text-xs text-text-muted">
        {run?.sites?.name && <span>{run.sites.name}</span>}
        <div className="flex items-center gap-1">
          <Clock size={11} />
          <span>{run ? new Date(run.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
        </div>
        {run?.status && <span className={cn('font-semibold', statusColor)}>{run.status === 'done' ? 'Terminé' : run.status === 'error' ? 'Erreur' : 'En cours'}</span>}
      </div>
    </div>
  );

  return (
    <AppLayout header={runHeader}>
      <div className="flex flex-col h-full">
        {steps.length === 0 ? (
          <div className="flex-1 bg-card border border-dashed border-border rounded-xl p-16 text-center">
            <p className="text-text-muted">Aucun module enregistré pour cette exécution.</p>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* Module list */}
            <div className="w-64 shrink-0 rounded-none flex flex-col border-r">
              <div className="px-4 py-3 border-b border-border  backdrop-blur shrink-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Modules exécutés</p>
              </div>
              <div className="p-3 overflow-y-auto flex-1 gap-2 flex flex-col">
                {steps.map((step) => {
                  const meta = getModuleMeta(step.module_type);
                  const Icon = meta.icon;
                  const BrandIcon = meta.brandIcon;
                  const isSelected = selectedStep?.id === step.id;
                  return (
                    <button
                      key={step.id}
                      onClick={() => selectStep(step)}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors group rounded-md',
                        isSelected ? 'bg-accent-hover' : 'hover:bg-accent-hover'
                      )}
                    >
                      {BrandIcon ? (
                        <BrandIcon size={17} className={cn(isSelected ? 'text-text' : 'text-text-muted', 'shrink-0')} />
                      ) : Icon ? (
                        (() => { const I = Icon as React.ComponentType<{size?: number | string; className?: string; monochrome?: boolean}>; return <I size={15} className={cn(isSelected ? 'text-text' : 'text-text-muted', 'shrink-0')} monochrome />; })()
                      ) : null}
                      <span className={cn('flex-1 text-xs font-medium truncate', isSelected ? 'text-text' : 'text-text-muted')}>
                        {meta.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Result panel (no outer card) */}
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
              {selectedStep ? (
                <>
                  {/* Title rendered directly on the page */}
                  <div className="flex items-center gap-3 border-b p-2.5">
                    {(() => {
                      const meta = getModuleMeta(selectedStep.module_type);
                      const Icon = meta.icon;
                      const BrandIcon = meta.brandIcon;
                      return (
                        <>
                          {BrandIcon ? (
                            <BrandIcon size={19} className="shrink-0" />
                          ) : (
                            Icon && <Icon size={19} className={meta.accent} />
                          )}
                          <h2 className="text-[12px] uppercase font-bold text-text tracking-widest">{meta.label}</h2>
                          <div className="ml-auto">
                            <FeedbackButtons key={selectedStep.id} runId={run?.id ?? id} stepId={selectedStep.id} section={selectedStep.module_type} token={token} />
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  <div className='p-2 flex-1 flex flex-col overflow-auto min-h-0'>
                    <StepResult step={selectedStep} steps={steps} token={token} runId={id} />
                  </div>
                </>
              ) : (
                <div className="p-6 text-center text-text-muted text-sm">
                  Sélectionnez un module pour voir ses résultats.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export default function RunDetailPage() {
  return (
    <Suspense fallback={
      <AppLayout>
        <div className="max-w-[1400px] mx-auto py-8 px-6">
          <Skeleton className="h-4 w-40 mb-6" />
          <Skeleton className="h-8 w-64 mb-8" />
          <div className="flex gap-6">
            <Skeleton className="w-64 h-[500px] rounded-xl shrink-0" />
            <Skeleton className="flex-1 h-[500px] rounded-xl" />
          </div>
        </div>
      </AppLayout>
    }>
      <RunDetailContent />
    </Suspense>
  );
}
