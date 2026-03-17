'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import AppLayout from '../../components/AppLayout';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle2, AlertCircle, Loader2, Clock,
  Search, TrendingUp, Layers, Sparkles, Rocket, Globe,
  MousePointerClick, Zap, ExternalLink, BarChart2, Link as LinkIcon, Type,
  Copy, Check, ChevronDown, Star,
} from 'lucide-react';
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

const MODULE_META: Record<string, { label: string; icon: React.ElementType; accent: string }> = {
  'trigger-manual':      { label: 'Déclencheur',            icon: MousePointerClick, accent: 'text-amber-400' },
  'text-input':          { label: 'Entrée texte',            icon: Type,              accent: 'text-slate-400' },
  'website-scraper':     { label: 'Scraping de site',        icon: Globe,             accent: 'text-cyan-400' },
  'keyword-research':    { label: 'Recherche mots-clés',    icon: Search,            accent: 'text-blue-400' },
  'serp-analysis':       { label: 'Analyse SERP',            icon: TrendingUp,        accent: 'text-violet-400' },
  'semantic-extraction': { label: 'Extraction sémantique',  icon: Layers,            accent: 'text-green-400' },
  'blog-generation':     { label: 'Génération de blog',      icon: Sparkles,          accent: 'text-accent' },
  'content-generation':  { label: 'Génération de contenu',  icon: Sparkles,          accent: 'text-accent' },
  'webflow-publish':     { label: 'Publication Webflow',     icon: Rocket,            accent: 'text-orange-400' },
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
          <div className="bg-background border border-border rounded-lg px-3 py-2 text-center">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-0.5">KD</p>
            <p className="text-lg font-bold text-text">{kd}</p>
          </div>
        )}
        {vol != null && (
          <div className="bg-background border border-border rounded-lg px-3 py-2 text-center">
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
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-widest text-text-muted mb-3">{results.length} résultats SERP</p>
      {results.slice(0, 15).map((r, i) => (
        <div key={i} className="bg-background border border-border rounded-lg p-3 flex items-start gap-3">
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
                  <tr key={i} className={cn('border-b border-border/50 last:border-0', i % 2 === 0 ? 'bg-surface' : 'bg-background/30')}>
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

// ── StarRating Component ─────────────────────────────────────────────────────

function StarRating({ runId, initialRating, token }: { runId: string; initialRating?: number | null; token: string | null }) {
  const [rating, setRating] = useState<number>(initialRating ?? 0);
  const [hover, setHover] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleRate(value: number) {
    if (!token) return;
    setRating(value);
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`${API_URL}/workflow/runs/${runId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating: value }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  const active = hover || rating;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            disabled={saving || !token}
            onClick={() => handleRate(v)}
            onMouseEnter={() => setHover(v)}
            onMouseLeave={() => setHover(0)}
            className={cn(
              'transition-all disabled:opacity-50',
              v <= active ? 'text-amber-400 scale-110' : 'text-border hover:text-amber-300',
            )}
            aria-label={`${v} étoile${v > 1 ? 's' : ''}`}
          >
            <Star size={16} fill={v <= active ? 'currentColor' : 'none'} />
          </button>
        ))}
        <span className="text-[10px] text-text-muted ml-2 font-mono">
          {saved ? '✅ Enregistré' : rating ? `${rating}/5` : 'Non noté'}
        </span>
      </div>
      {rating >= 4 && (
        <p className="text-[9px] text-success font-medium">
          ⭐ Cette génération sera utilisée comme référence pour les futures générations
        </p>
      )}
    </div>
  );
}

function BlogGenerationResult({ data, semanticData, runId, rating, token }: { data: Record<string, unknown>; semanticData?: Record<string, unknown>; runId: string; rating?: number | null; token: string | null }) {
  const [tab, setTab] = useState<'meta' | 'html' | 'outline' | 'schema' | 'tfidf'>('meta');
  const parsedBlog = (data.parsedBlog as Record<string, unknown>) ?? {};
  const fieldData = (data.fieldData as Record<string, unknown>) ?? {};
  const htmlBody = (data.htmlBody as string) ?? (fieldData['body'] as string) ?? '';
  const htmlBodyFull = (data.htmlBodyFull as string) ?? '';
  const outline = (data.outline as string) ?? '';
  const h1 = (parsedBlog.h1 as string) ?? (fieldData['title'] as string) ?? (data.title as string) ?? '—';
  const metaTitle = (parsedBlog.titleTag as string) ?? (fieldData['meta-title'] as string) ?? (fieldData['metaTitle'] as string) ?? '—';
  const metaDesc = (parsedBlog.metaDescription as string) ?? (fieldData['meta-description'] as string) ?? (fieldData['metaDescription'] as string) ?? '—';
  const schemas = (parsedBlog.schemas as string[]) ?? [];
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
    { id: 'html' as const, label: 'HTML' },
    ...(hasSchema ? [{ id: 'schema' as const, label: 'Schéma' }] : []),
    ...(hasTfidf ? [{ id: 'tfidf' as const, label: 'TF-IDF' }] : []),
  ];

  return (
    <div className="space-y-4">
      {token && (
        <div className="bg-background border border-border rounded-lg p-4">
          <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-2">Notation de la génération</p>
          <p className="text-[10px] text-text-muted mb-2">Évaluez la qualité de cette génération. Les générations ≥ 4★ seront utilisées comme référence lors des prochaines générations.</p>
          <StarRating runId={runId} initialRating={rating} token={token} />
        </div>
      )}
      {wordCount != null && (
        <div className="flex items-center gap-2 text-xs text-text-muted bg-background border border-border rounded-lg px-3 py-2 w-fit">
          <Sparkles size={12} className="text-accent" />
          <span><span className="font-bold text-text">{wordCount.toLocaleString('fr-FR')}</span> mots générés</span>
        </div>
      )}
      <div className="p-0.5 bg-background rounded-lg flex w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('px-4 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all',
              tab === t.id ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text')}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'meta' && (
        <div className="space-y-3">
          <div className="bg-background border border-border rounded-lg p-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-1">H1</p>
            <p className="text-sm font-semibold text-text">{h1}</p>
          </div>
          <div className="bg-background border border-border rounded-lg p-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-1">Title Tag</p>
            <p className="text-sm text-text">{metaTitle}</p>
          </div>
          <div className="bg-background border border-border rounded-lg p-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-1">Meta Description</p>
            <p className="text-sm text-text">{metaDesc}</p>
          </div>
        </div>
      )}
      {tab === 'outline' && (
        <pre className="text-[11px] font-mono text-text-muted/80 bg-background rounded-lg p-4 overflow-auto max-h-[500px] leading-relaxed whitespace-pre-wrap">
          {outline}
        </pre>
      )}
      {tab === 'html' && (
        <div className="space-y-4">
          {/* Corps seul — pour Webflow et CMS avec rich-text */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-[#1e1e1e]">
              <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Corps seul <span className="text-accent/60 normal-case font-normal tracking-normal">(sans FAQ ni schémas — compatible API Webflow)</span></p>
              <CopyButton text={htmlBody} />
            </div>
            <pre className="text-[11px] font-mono text-text-muted/70 bg-[#1e1e1e] p-4 overflow-auto max-h-[400px] leading-relaxed whitespace-pre-wrap break-words">
              {htmlBody || '(aucun contenu HTML)'}
            </pre>
          </div>
          {/* Version complète — corps + FAQ + schémas concaténés */}
          {htmlBodyFull && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-[#1e1e1e]">
                <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Version complète <span className="text-amber-400/70 normal-case font-normal tracking-normal">(corps + FAQ + schémas — copier-coller manuel)</span></p>
                <CopyButton text={htmlBodyFull} />
              </div>
              <pre className="text-[11px] font-mono text-text-muted/70 bg-[#1e1e1e] p-4 overflow-auto max-h-[400px] leading-relaxed whitespace-pre-wrap break-words">
                {htmlBodyFull}
              </pre>
            </div>
          )}
        </div>
      )}
      {tab === 'schema' && (
        <div className="space-y-4">
          {schemas.map((schema, i) => (
            <div key={i} className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-[#1e1e1e]">
                <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">
                  {schemas.length > 1 ? `Schéma ${i + 1}` : 'Schéma JSON-LD'}
                </p>
                <CopyButton text={schema} />
              </div>
              <pre className="text-[11px] font-mono text-green-300/80 bg-[#1e1e1e] p-4 overflow-auto max-h-72 whitespace-pre-wrap break-words leading-relaxed">
                {schema}
              </pre>
            </div>
          ))}
          {faqEmbed && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-[#1e1e1e]">
                <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">FAQ (HTML)</p>
                <CopyButton text={faqEmbed} />
              </div>
              <pre className="text-[11px] font-mono text-sky-300/80 bg-[#1e1e1e] p-4 overflow-auto max-h-72 whitespace-pre-wrap break-words leading-relaxed">
                {faqEmbed}
              </pre>
            </div>
          )}
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
                    <tr key={i} className={cn('border-b border-border/50 last:border-0', i % 2 === 0 ? 'bg-surface' : 'bg-background/30')}>
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
          <div className="bg-background border border-border rounded-lg p-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-1">Titre</p>
            <p className="text-sm font-semibold text-text">{title}</p>
          </div>
          <div className="bg-background border border-border rounded-lg p-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-1">Meta Title</p>
            <p className="text-sm text-text">{metaTitle}</p>
          </div>
          <div className="bg-background border border-border rounded-lg p-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-1">Meta Description</p>
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
      <div className="bg-background border border-border rounded-lg p-4 flex items-center gap-3">
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
      {/* Theme + description */}
      {theme && (
        <div className="bg-background border border-border rounded-lg p-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-1">Thème</p>
          <p className="text-sm font-bold text-text">{theme}</p>
          {description && <p className="text-xs text-text-muted mt-1 leading-relaxed">{description}</p>}
        </div>
      )}

      {/* Tone / language / audience */}
      <div className="grid grid-cols-2 gap-2.5">
        {tone && (
          <div className="bg-background border border-border rounded-lg p-2.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-0.5">Ton détecté</p>
            <p className="text-xs font-semibold text-text">{tone}</p>
          </div>
        )}
        {language && (
          <div className="bg-background border border-border rounded-lg p-2.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-0.5">Langue</p>
            <p className="text-xs font-semibold text-text uppercase">{language}</p>
          </div>
        )}
        {targetAudience && (
          <div className="bg-background border border-border rounded-lg p-2.5 col-span-2">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-0.5">Audience cible</p>
            <p className="text-xs text-text">{targetAudience}</p>
          </div>
        )}
      </div>

      {/* Writing style */}
      {writingStyle && (
        <div className="bg-background border border-border rounded-lg p-2.5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-0.5">Style rédactionnel</p>
          <p className="text-xs text-text-muted leading-relaxed">{writingStyle}</p>
        </div>
      )}

      {/* Recommended tone */}
      {recommendedTone && (
        <div className="bg-accent/5 border border-accent/15 rounded-lg p-2.5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-accent mb-0.5">Ton recommandé pour la génération</p>
          <p className="text-xs text-text-muted leading-relaxed">{recommendedTone}</p>
        </div>
      )}

      {/* Main topics */}
      {mainTopics.length > 0 && (
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-2">Sujets principaux</p>
          <div className="flex flex-wrap gap-1.5">
            {mainTopics.map((t, i) => (
              <span key={i} className="text-xs bg-cyan-500/5 border border-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full">{t}</span>
            ))}
          </div>
        </div>
      )}

      {/* Keywords */}
      {keywords.length > 0 && (
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-2">Mots-clés détectés</p>
          <div className="flex flex-wrap gap-1.5">
            {keywords.map((k, i) => (
              <span key={i} className="text-[10px] bg-background border border-border text-text-muted px-2 py-0.5 rounded font-mono">{k}</span>
            ))}
          </div>
        </div>
      )}

      {/* Existing titles */}
      {existingTitles.length > 0 && (
        <details className="border-t border-border pt-3">
          <summary className="text-[9px] font-bold uppercase tracking-widest text-amber-400/80 cursor-pointer select-none">
            Articles existants ({existingTitles.length}) — à ne pas dupliquer
          </summary>
          <div className="mt-2 space-y-0.5">
            {existingTitles.map((t, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-text-muted">
                <span className="text-amber-500/50 font-mono text-[9px] shrink-0 mt-0.5">{i + 1}.</span>
                <span>{t}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Content gaps */}
      {contentGaps.length > 0 && (
        <details className="border-t border-border pt-3">
          <summary className="text-[9px] font-bold uppercase tracking-widest text-green-400/80 cursor-pointer select-none">
            Gaps de contenu ({contentGaps.length}) — opportunités
          </summary>
          <div className="mt-2 space-y-1">
            {contentGaps.map((g, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-text-muted bg-green-500/5 border border-green-500/15 rounded px-2 py-1">
                <span className="text-green-400 font-bold shrink-0">{i + 1}.</span>
                <span>{g}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Sitemap URLs */}
      {sitemapUrls.length > 0 && (
        <details className="border-t border-border pt-3">
          <summary className="text-[9px] font-bold uppercase tracking-widest text-text-muted cursor-pointer select-none flex items-center gap-1.5">
            <LinkIcon size={9} />
            URLs sitemap ({sitemapUrls.length})
          </summary>
          <div className="mt-2 space-y-0.5 max-h-48 overflow-y-auto">
            {sitemapUrls.map((url, i) => (
              <div key={i} className="text-[10px] text-text-muted font-mono truncate px-1 py-0.5 hover:bg-border/30 rounded">{url}</div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function StepResult({ step, steps, token, runId, rating }: { step: RunStep; steps: RunStep[]; token: string | null; runId: string; rating?: number | null }) {
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

  switch (step.module_type) {
    case 'keyword-research':    return <KeywordResult data={data} />;
    case 'serp-analysis':       return <SerpResult data={data} />;
    case 'semantic-extraction': return <SemanticResult data={data} />;
    case 'blog-generation':     return <BlogGenerationResult data={data} semanticData={steps.find(s => s.module_type === 'semantic-extraction')?.result_json ?? undefined} runId={runId} rating={rating} token={token} />;
    case 'content-generation':  return <BlogGenerationResult data={data} semanticData={steps.find(s => s.module_type === 'semantic-extraction')?.result_json ?? undefined} runId={runId} rating={rating} token={token} />;
    case 'webflow-publish':     return <WebflowResult data={data} />;
    case 'website-scraper':     return <ScraperResult data={data} />;
    default:                    return <JsonViewer data={data} />;
  }
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

  return (
    <AppLayout>
      <div className="max-w-[1400px] mx-auto py-8 px-6">
        {/* Header */}
        <Link href="/runs" className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text mb-5 transition-colors">
          <ArrowLeft size={14} />
          Retour à l'historique
        </Link>
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-1">
              {run?.workflows?.name ?? 'Exécution'}
            </h1>
            <div className="flex items-center gap-3 text-sm text-text-muted">
              {run?.sites?.name && <span>{run.sites.name}</span>}
              {run?.sites?.name && <span>·</span>}
              <Clock size={13} />
              <span>{run ? new Date(run.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
              {run?.status && <span className={cn('font-semibold', statusColor)}>· {run.status === 'done' ? 'Terminé' : run.status === 'error' ? 'Erreur' : 'En cours'}</span>}
            </div>
          </div>
        </div>

        {steps.length === 0 ? (
          <div className="bg-surface border border-dashed border-border rounded-xl p-16 text-center">
            <p className="text-text-muted">Aucun module enregistré pour cette exécution.</p>
          </div>
        ) : (
          <div className="flex gap-6 items-start">
            {/* Module list */}
            <div className="w-64 shrink-0 bg-surface border border-border rounded-xl overflow-hidden sticky top-6">
              <div className="px-4 py-3 border-b border-border bg-background/50">
                <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Modules exécutés</p>
              </div>
              <div className="py-1">
                {steps.map((step) => {
                  const meta = getModuleMeta(step.module_type);
                  const Icon = meta.icon;
                  const isSelected = selectedStep?.id === step.id;
                  return (
                    <button
                      key={step.id}
                      onClick={() => selectStep(step)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                        isSelected ? 'bg-accent/10' : 'hover:bg-background/60'
                      )}
                    >
                      <Icon size={14} className={cn(meta.accent, 'shrink-0')} />
                      <span className={cn('flex-1 text-xs font-medium truncate', isSelected ? 'text-text' : 'text-text-muted')}>
                        {meta.label}
                      </span>
                      <StepStatusIcon status={step.status} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Result panel */}
            <div className="flex-1 min-w-0 bg-surface border border-border rounded-xl overflow-hidden">
              {selectedStep ? (
                <>
                  <div className="px-5 py-4 border-b border-border bg-background/50 flex items-center gap-3">
                    {(() => {
                      const meta = getModuleMeta(selectedStep.module_type);
                      const Icon = meta.icon;
                      return (
                        <>
                          <Icon size={16} className={meta.accent} />
                          <h2 className="font-bold text-text">{meta.label}</h2>
                          <StepStatusIcon status={selectedStep.status} />
                        </>
                      );
                    })()}
                  </div>
                  <div className="p-5">
                    <StepResult step={selectedStep} steps={steps} token={token} runId={id} rating={run?.rating} />
                  </div>
                </>
              ) : (
                <div className="p-10 text-center text-text-muted text-sm">
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
