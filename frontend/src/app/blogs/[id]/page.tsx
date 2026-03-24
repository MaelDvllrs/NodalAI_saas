'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import AppLayout from '../../components/AppLayout';
import Link from 'next/link';
import {
  ChevronLeft, ExternalLink, Calendar, Globe, Tag, FileText,
  Hash, BarChart2, Clock, Copy, CheckCircle2, Eye, Code2,
  Rocket, FileEdit, RefreshCw, Trash2, AlertTriangle, ChevronDown, ChevronUp,
  Search, Layers, Target, Star,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { Skeleton } from '../../components/UI';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface TermEntry {
  term: string;
  display?: string;
  score: number;
  tfidf: number;
  minCount?: number;
  maxCount?: number;
  target?: number;
}

interface SemanticCluster {
  clusterId: number;
  label: string;
  terms: { term: string; display: string; score: number }[];
  score: number;
  pageCount?: number;
}

interface SeoAnalysis {
  coverage?: {
    totalScore: number;
    bm25Score?: number;
    semanticScore?: number;
    topicCoverage: number;
    entityCoverage: number;
    wordScore: number;
    faqScore: number;
    intentScore: number;
  };
  semantic?: {
    pagesAnalyzed: number;
    primaryTerms: string[];
    secondaryTerms: string[];
    longTailVariants: string[];
    entities: string[];
    coOccurrences: string[];
    contentGaps: string[];
    intentTopTerms?: TermEntry[];
    tfidfTopTerms: { term: string; display?: string; score: number }[];
    termDistribution?: { term: string; display?: string; presences: boolean[]; counts?: number[]; minCount?: number; maxCount?: number; target?: number }[];
    clusters?: SemanticCluster[];
    pagesMeta?: { idx: number; url: string; domain: string; title: string; rank: number }[];
  };
  serpResults?: { rank: number; title: string; description: string; url: string; domain: string; pageType?: string }[];
  serpModel?: { intent: string; contentFormat: string; avgWordCount: number; dominantSubtopics: string[]; recurringEntities: string[] };
}

interface Blog {
  id: string;
  title: string;
  slug: string;
  h1: string;
  title_tag: string;
  meta_description: string;
  introduction: string;
  body: string;
  theme: string;
  tone: string;
  status: string;
  created_at: string;
  published_at: string | null;
  secondary_keywords_used: string[];
  webflow_item_id: string;
  webflow_collection_id: string;
  raw_content: string;
  schemas?: { position: string; code: string }[];
  faqEmbed?: string | null;
  seo_analysis?: SeoAnalysis | null;
  rating?: number | null;
  sites: { name: string; url: string; webflow_site_id: string; webflow_collection_name: string };
  keywords: { keyword: string; search_volume: number | null; competition_index: number | null } | null;
}

function CopyButton({ text, label = 'Copier' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={handleCopy}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all',
        copied
          ? 'bg-success/10 text-success border-success/20'
          : 'bg-background border-border text-text-muted hover:border-text/20 hover:text-text',
      )}
    >
      {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
      {copied ? 'Copié' : label}
    </button>
  );
}

function StarRating({ blogId, initialRating, token }: { blogId: string; initialRating?: number | null; token: string | null }) {
  const [rating, setRating] = useState<number>(initialRating ?? 0);
  const [hover, setHover] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleRate(value: number) {
    setRating(value);
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`${API_URL}/blogs/${blogId}/rate`, {
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            disabled={saving}
            onClick={() => handleRate(v)}
            onMouseEnter={() => setHover(v)}
            onMouseLeave={() => setHover(0)}
            className={cn(
              'transition-all disabled:opacity-50',
              v <= active ? 'text-yellow-400 scale-110' : 'text-border hover:text-yellow-300',
            )}
            aria-label={`${v} étoile${v > 1 ? 's' : ''}`}
          >
            <Star size={18} fill={v <= active ? 'currentColor' : 'none'} />
          </button>
        ))}
        <span className="text-[10px] text-text-muted ml-2 font-mono">
          {saved ? '✅ Enregistré' : rating ? `${rating}/5` : 'Non noté'}
        </span>
      </div>
      {rating >= 4 && (
        <p className="text-[9px] text-success font-medium">
          ⭐ Cet article sera utilisé comme référence pour les générations futures
        </p>
      )}
    </div>
  );
}

function SeoCharBar({ value, max, warn, label }: { value: number; max: number; warn: number; label: string }) {
  const pct = Math.min((value / max) * 100, 100);
  const color = value > max ? 'bg-error' : value >= warn ? 'bg-success' : 'bg-accent';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-text-muted">
        <span>{label}</span>
        <span className={cn('font-bold', value > max ? 'text-error' : value >= warn ? 'text-success' : 'text-accent')}>
          {value} / {max} car.
        </span>
      </div>
      <div className="h-1 bg-border rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function BlogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const router = useRouter();
  const [blog, setBlog] = useState<Blog | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'seo' | 'content' | 'embeds' | 'analysis' | 'raw'>('seo');
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (token && id) fetchBlog();
  }, [token, id]);

  async function fetchBlog() {
    try {
      const res = await fetch(`${API_URL}/blogs/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBlog(data.blog);
      }
    } catch (error) {
      console.error('Erreur récupération blog:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      const res = await fetch(`${API_URL}/blogs/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) router.push('/blogs');
    } catch (error) {
      console.error('Erreur suppression:', error);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-7xl mx-auto py-12 px-6">
          <Skeleton className="h-4 w-32 mb-8" />
          <div className="flex justify-between items-start mb-10">
            <div className="space-y-3">
              <Skeleton className="h-4 w-24 rounded-full" />
              <Skeleton className="h-10 w-[600px]" />
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-10 w-24 rounded-xl" />
              <Skeleton className="h-10 w-32 rounded-xl" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-8">
            <div className="space-y-6">
              <Skeleton className="h-[300px] rounded-2xl" />
              <Skeleton className="h-[200px] rounded-2xl" />
              <Skeleton className="h-[250px] rounded-2xl" />
            </div>
            <div className="col-span-2 space-y-6">
              <Skeleton className="h-12 w-64 rounded-xl" />
              <Skeleton className="h-[600px] rounded-2xl" />
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!blog) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-32 text-text-muted">
          <FileText size={48} className="mb-4 opacity-20" />
          <p className="font-bold mb-2">Article introuvable</p>
          <Link href="/blogs" className="btn-primary mt-4">Retour à l&apos;historique</Link>
        </div>
      </AppLayout>
    );
  }

  const kd = blog.keywords?.competition_index;
  const kdColor = kd == null ? 'text-text-muted' : kd < 30 ? 'text-success' : kd < 60 ? 'text-accent' : 'text-error';

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto py-8 px-6">
          {/* Back + header */}
          <Link
            href="/blogs"
            className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text mb-8 transition-colors group"
          >
            <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            Retour à l&apos;historique
          </Link>

          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 mb-6">
            <div className="min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <span className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter',
                  blog.status === 'published'
                    ? 'bg-success/10 text-success'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-text-muted',
                )}>
                  {blog.status === 'published' ? <><Rocket size={10} /> Publié</> : <><FileEdit size={10} /> Brouillon</>}
                </span>
                <span className="text-[10px] text-text-muted font-mono">{blog.sites?.name}</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight truncate max-w-3xl">{blog.title}</h1>
              <p className="text-text-muted text-sm font-mono mt-1">/{blog.slug}</p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {blog.webflow_item_id && (
                <a
                  href={`https://webflow.com/dashboard/sites/${blog.sites?.webflow_site_id}/collections`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary py-2 px-4 text-xs gap-2"
                >
                  <ExternalLink size={14} />
                  Webflow
                </a>
              )}
              <button
                onClick={handleDelete}
                disabled={deleting}
              className={cn(
                  'flex items-center gap-2 py-1.5 px-3 rounded-md border text-xs font-bold transition-all',
                  confirmDelete
                    ? 'bg-error text-white border-error'
                    : 'bg-background border-border text-text-muted hover:border-error/40 hover:text-error',
                )}
              >
                {deleting ? <RefreshCw size={14} className="animate-spin" /> : confirmDelete ? <AlertTriangle size={14} /> : <Trash2 size={14} />}
                {confirmDelete ? 'Confirmer la suppression' : 'Supprimer'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* ── Left column: metadata ───────────────────────────── */}
            <div className="space-y-4">

              {/* SEO */}
              <div className="bg-card border border-border rounded-lg p-4 space-y-4">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                  <BarChart2 size={14} /> SEO
                </h2>

                <div className="space-y-3">
                  <SeoCharBar value={blog.title_tag?.length ?? 0} warn={50} max={65} label="Title tag" />
                  <SeoCharBar value={blog.meta_description?.length ?? 0} warn={120} max={160} label="Meta description" />
                </div>

                <div className="space-y-3 pt-3 border-t border-border">
                  <div>
                    <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-1">Title tag</p>
                    <p className="text-xs text-text leading-snug">{blog.title_tag || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-1">Meta description</p>
                    <p className="text-xs text-text leading-snug">{blog.meta_description || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-1">H1</p>
                    <p className="text-xs text-text leading-snug">{blog.h1 || '—'}</p>
                  </div>
                </div>
              </div>

              {/* Keyword */}
              <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                  <Hash size={14} /> Mots-clés
                </h2>
                {blog.keywords && (
                  <div className="p-3 bg-background border border-border rounded-xl space-y-2">
                    <p className="text-sm font-bold">{blog.keywords.keyword}</p>
                    <div className="flex gap-4 text-[10px] text-text-muted">
                      {blog.keywords.search_volume != null && (
                        <span><span className="font-bold text-text">{blog.keywords.search_volume.toLocaleString()}</span> recherches/mois</span>
                      )}
                      {kd != null && (
                        <span>KD <span className={cn('font-bold', kdColor)}>{kd}/100</span></span>
                      )}
                    </div>
                  </div>
                )}
                {blog.secondary_keywords_used?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border">
                    {blog.secondary_keywords_used.map((kw, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-background border border-border text-[10px] text-text-muted">
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Infos */}
              <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                  <Tag size={14} /> Infos
                </h2>
                <div className="space-y-3 text-xs">
                  {[
                    { label: 'Site', value: blog.sites?.name },
                    { label: 'Thème', value: blog.theme },
                    { label: 'Ton', value: blog.tone },
                    { label: 'Collection', value: blog.sites?.webflow_collection_name },
                    { label: 'Créé le', value: new Date(blog.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) },
                    ...(blog.published_at ? [{ label: 'Publié le', value: new Date(blog.published_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) }] : []),
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between gap-4">
                      <span className="text-text-muted shrink-0">{label}</span>
                      <span className="font-medium text-right truncate max-w-[180px]">{value || '—'}</span>
                    </div>
                  ))}
                </div>

                {blog.webflow_item_id && (
                  <div className="pt-3 border-t border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Webflow Item ID</span>
                      <CopyButton text={blog.webflow_item_id} />
                    </div>
                    <p className="text-[10px] font-mono text-text-muted truncate">{blog.webflow_item_id}</p>
                  </div>
                )}

                {blog.sites?.url && (
                  <div className="pt-2">
                    <a
                      href={`${blog.sites.url}/${blog.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-[10px] font-bold text-accent hover:underline"
                    >
                      <Globe size={12} />
                      Voir sur le site
                    </a>
                  </div>
                )}
              </div>
              {/* Notation */}
              <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                  <Star size={14} /> Notation
                </h2>
                <p className="text-[10px] text-text-muted leading-snug">
                  Évalue la qualité de cet article. Les articles ≥ 4 ★ seront utilisés comme référence lors des prochaines générations.
                </p>
                <StarRating blogId={blog.id} initialRating={blog.rating} token={token} />
              </div>

            </div>

            {/* ── Right column: content ───────────────────────────── */}
            <div className="lg:col-span-2 space-y-4">

              {/* Tabs */}
              <div className="flex gap-0.5 bg-card border border-border rounded-md p-0.5 w-fit">
                {([
                  { key: 'seo', label: 'Aperçu SEO', icon: Eye },
                  { key: 'content', label: 'Article HTML', icon: FileText },
                  { key: 'embeds', label: 'Embeds', icon: Code2 },
                  { key: 'analysis', label: 'Analyse SEO', icon: Search },
                  { key: 'raw', label: 'Brut Claude', icon: Code2 },
                ] as const).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all',
                      tab === key
                        ? 'bg-background border border-border text-text'
                        : 'text-text-muted hover:text-text',
                    )}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>

              {/* Tab: Aperçu SEO (Google preview + introduction) */}
              {tab === 'seo' && (
                <div className="space-y-4">
                  <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                      <Eye size={14} /> Aperçu Google
                    </h3>
                    <div className="p-4 bg-white dark:bg-zinc-900 rounded-xl border border-border space-y-1">
                      <p className="text-xs text-text-muted">{blog.sites?.url || 'https://votresite.com'}/{blog.slug}</p>
                      <p className="text-[#1a0dab] dark:text-[#8ab4f8] text-lg font-medium hover:underline cursor-pointer line-clamp-1">
                        {blog.title_tag || blog.h1}
                      </p>
                      <p className="text-[#4d5156] dark:text-[#bdc1c6] text-sm leading-relaxed line-clamp-2">
                        {blog.meta_description}
                      </p>
                    </div>
                  </div>

                  <div className="bg-card border border-border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                        <FileText size={14} /> Introduction
                      </h3>
                      {blog.introduction && <CopyButton text={blog.introduction} />}
                    </div>
                    <p className="text-sm text-text leading-relaxed whitespace-pre-line">{blog.introduction || '—'}</p>
                  </div>
                </div>
              )}

              {/* Tab: Article HTML */}
              {tab === 'content' && (
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                      <FileText size={14} /> Corps de l&apos;article
                      <span className="text-text-muted font-mono">({blog.body?.length?.toLocaleString() ?? 0} car.)</span>
                    </h3>
                    {blog.body && <CopyButton text={blog.body} label="Copier HTML" />}
                  </div>
                  <div
                    className="p-8 prose prose-sm dark:prose-invert max-w-none overflow-y-auto max-h-[800px]
                      prose-headings:font-bold prose-h2:text-xl prose-h3:text-base
                      prose-p:text-text-muted prose-p:leading-relaxed
                      prose-a:text-accent prose-a:no-underline hover:prose-a:underline
                      prose-li:text-text-muted"
                    dangerouslySetInnerHTML={{ __html: blog.body || '<p class="text-text-muted italic">Aucun contenu.</p>' }}
                  />
                </div>
              )}

              {/* Tab: Embeds (FAQ + Schémas) */}
              {tab === 'embeds' && (
                <EmbedsDetailPanel faqEmbed={blog.faqEmbed ?? null} schemas={blog.schemas} />
              )}

              {/* Tab: Analyse SEO */}
              {tab === 'analysis' && (
                <SeoAnalysisPanel
                  seoAnalysis={blog.seo_analysis}
                  articleText={[blog.title_tag, blog.h1, blog.introduction, blog.body, blog.faqEmbed].filter(Boolean).join(' ')}
                />
              )}

              {/* Tab: Raw Claude output */}
              {tab === 'raw' && (
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-zinc-900/50">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                      <Code2 size={14} /> Sortie brute Claude
                    </h3>
                    {blog.raw_content && <CopyButton text={blog.raw_content} label="Copier" />}
                  </div>
                  <pre className="p-6 text-[11px] font-mono text-zinc-300 bg-black/90 leading-relaxed overflow-auto max-h-[800px] whitespace-pre-wrap">
                    {blog.raw_content || '— Non disponible'}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
    </AppLayout>
  );
}

// ── Embeds panel (FAQ + schémas) ─────────────────────────────────────────────

function EmbedBlock({ label, hint, code }: { label: string; hint: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-6 space-y-3 border-b border-border last:border-b-0 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-text uppercase tracking-tight">{label}</p>
          {hint && <p className="text-[10px] text-text-muted mt-0.5 italic">{hint}</p>}
        </div>
        <button
          onClick={handleCopy}
          className={cn(
            'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border',
            copied
              ? 'bg-success/10 text-success border-success/20'
              : 'bg-background border-border text-text-muted hover:border-text/20 hover:text-text',
          )}
        >
          {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
          {copied ? 'Copié !' : 'Copier le code'}
        </button>
      </div>
      <div className="relative">
        <pre className={cn(
          'text-[10px] font-mono bg-black/90 text-zinc-300 border border-border rounded-lg p-4 overflow-x-auto leading-relaxed',
          !expanded && 'max-h-32 overflow-hidden',
        )}>
          {code}
        </pre>
        {code.length > 300 && (
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

function EmbedsDetailPanel({ faqEmbed, schemas = [] }: { faqEmbed: string | null; schemas?: { position: string; code: string }[] }) {
  const blocks: { label: string; hint: string; code: string }[] = [];

  if (faqEmbed) {
    blocks.push({
      label: 'FAQ — Accordéon HTML',
      hint: 'À insérer en fin d\'article via un bloc Embed dans Webflow',
      code: faqEmbed,
    });
  }

  schemas.forEach((s, i) => {
    blocks.push({
      label: `Schéma visuel ${i + 1}`,
      hint: s.position ? `À placer après : ${s.position}` : `Schéma ${i + 1}`,
      code: s.code,
    });
  });

  if (blocks.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-12 flex flex-col items-center justify-center text-center gap-3">
        <Code2 size={36} className="text-text-muted opacity-20" />
        <p className="text-sm font-bold text-text-muted">Aucun embed disponible</p>
        <p className="text-xs text-text-muted">Les schémas et la FAQ ne sont pas présents dans cet article.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-accent/5 border border-accent/20 rounded-xl px-5 py-3 flex items-center gap-3">
        <Code2 size={16} className="text-accent shrink-0" />
        <p className="text-xs text-text-muted">
          <span className="font-bold text-text">L'API Webflow ne supporte pas les embeds HTML.</span>{' '}
          Copiez chaque bloc et collez-le manuellement dans Webflow via <em>Add block → Embed</em>.
        </p>
      </div>
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {blocks.map((block, i) => (
          <EmbedBlock key={i} {...block} />
        ))}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Normalise un token comme le fait le backend (minuscule, sans accents, alphanum) */
function normalizeToken(t: string): string {
  return t.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Lemmatiseur léger (miroir exact du backend semantic.service.js).
 * Entrée : token déjà normalisé (minuscule, sans accents).
 */
function lemmatizeToken(t: string): string {
  if (t.length <= 4) return t;
  if (t.endsWith('eaux') && t.length > 6) return t.slice(0, -1);   // reseaux → reseau
  if (t.endsWith('aux')  && t.length > 5) return t.slice(0, -3) + 'al'; // sociaux → social
  if (t.endsWith('eurs') && t.length > 6) return t.slice(0, -1);   // createurs → createur
  if (t.endsWith('ements') && t.length > 8) return t.slice(0, -1); // hebergements → hebergement
  if (t.endsWith('ing')) return t;                                   // hosting, marketing…
  if (t.endsWith('s')   && t.length > 4) return t.slice(0, -1);    // logiciels → logiciel
  return t;
}

/**
 * Compte les unigrams (lemmatisés) et retourne aussi le texte normalisé sans accents
 * pour la recherche de n-grams par sous-chaîne (miroir de scoreTermsInRange backend).
 */
function buildArticleTermCounts(text: string): { raw: Map<string, number>; total: number; normalized: string } {
  // Tokens lemmatisés pour les unigrams
  const tokens = text
    .split(/[^a-zA-Z\u00C0-\u00FF0-9]+/)
    .map((w) => lemmatizeToken(normalizeToken(w)))
    .filter((t) => t.length >= 3);
  const raw = new Map<string, number>();
  for (const t of tokens) raw.set(t, (raw.get(t) ?? 0) + 1);

  // Texte normalisé sans accents pour la recherche de n-grams par sous-chaîne
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  return { raw, total: tokens.length, normalized };
}

// ── SEO Analysis Panel ────────────────────────────────────────────────────────

function SeoAnalysisPanel({ seoAnalysis, articleText = '' }: { seoAnalysis?: SeoAnalysis | null; articleText?: string }) {
  const [termFilter, setTermFilter] = useState<'all' | 'in' | 'out' | 'absent'>('all');
  const [termSearch, setTermSearch]   = useState('');

  if (!seoAnalysis) {
    return (
      <div className="bg-card border border-border rounded-2xl p-12 flex flex-col items-center justify-center text-center gap-3">
        <Search size={36} className="text-text-muted opacity-20" />
        <p className="text-sm font-bold text-text-muted">Aucune analyse SEO disponible</p>
        <p className="text-xs text-text-muted">
          L&apos;analyse sémantique est effectuée lors de la génération. Les articles créés avant cette mise à jour n&apos;ont pas de données SEO.
        </p>
      </div>
    );
  }

  const { coverage, semantic, serpResults = [], serpModel } = seoAnalysis;

  // Build article token counts once
  const { raw: articleRaw, total: articleTokens, normalized: articleNormalized } = buildArticleTermCounts(articleText);

  // All 300 terms from intentTopTerms, fallback to tfidfTopTerms
  const allTerms: TermEntry[] = (
    semantic?.intentTopTerms && semantic.intentTopTerms.length > 0
      ? semantic.intentTopTerms
      : (semantic?.tfidfTopTerms ?? []).map((t) => ({ ...t, tfidf: t.score }))
  );

  // Helper : compte les occurrences d'une sous-chaîne dans une chaîne
  function countSubstring(haystack: string, needle: string): number {
    if (!needle) return 0;
    let count = 0, pos = 0;
    while ((pos = haystack.indexOf(needle, pos)) !== -1) { count++; pos += needle.length; }
    return count;
  }

  // Enrich with article counts (normalized /1000 tokens)
  type EnrichedTerm = TermEntry & { articleCount: number; articleNorm: number; status: 'in' | 'out' | 'absent' | 'nodata' };
  const enriched: EnrichedTerm[] = allTerms.map((t) => {
    let raw: number;
    if (t.term.includes(' ')) {
      // N-gram : recherche par sous-chaîne dans le texte normalisé (insensible aux accents)
      // Miroir exact de scoreTermsInRange côté backend
      raw = countSubstring(articleNormalized, t.term);
    } else {
      // Unigram : lookup dans les tokens lemmatisés
      raw = articleRaw.get(t.term) ?? 0;
    }
    const norm       = articleTokens > 0 ? Math.round((raw / articleTokens) * 1000) : 0;
    const hasData    = t.minCount != null && t.maxCount != null && t.target != null;
    let status: EnrichedTerm['status'] = 'nodata';
    if (hasData) {
      if (raw === 0) status = 'absent';
      else if (norm >= t.minCount! && norm <= t.maxCount!) status = 'in';
      else status = 'out';
    }
    return { ...t, articleCount: raw, articleNorm: norm, status };
  });

  const filtered = enriched
    .filter((t) => termFilter === 'all' || t.status === termFilter)
    .filter((t) => {
      if (!termSearch) return true;
      const q = termSearch.toLowerCase().trim();
      return (t.display || t.term).includes(q) || t.term.includes(q);
    });

  const counts = {
    in:     enriched.filter((t) => t.status === 'in').length,
    out:    enriched.filter((t) => t.status === 'out').length,
    absent: enriched.filter((t) => t.status === 'absent').length,
  };

  return (
    <div className="space-y-6">

      {/* ── 1. Coverage Score ─────────────────────────────────────── */}
      {coverage && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
              <BarChart2 size={14} /> Score Couverture SEO
            </h3>
            <span className={cn(
              'text-3xl font-bold tabular-nums',
              coverage.totalScore >= 80 ? 'text-green-500' :
              coverage.totalScore >= 60 ? 'text-amber-500' : 'text-error'
            )}>
              {coverage.totalScore}<span className="text-sm font-normal text-text-muted">/100</span>
            </span>
          </div>
          <div className="space-y-3">
            {/* BM25 + Embeddings sub-scores */}
            {(coverage.bm25Score != null || coverage.semanticScore != null) && (
              <div className="grid grid-cols-2 gap-3 pb-3 border-b border-border">
                {coverage.bm25Score != null && (
                  <div className="bg-background rounded-lg p-3 border border-border">
                    <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1">Score Lexical BM25</p>
                    <p className={cn('text-xl font-bold tabular-nums',
                      coverage.bm25Score >= 70 ? 'text-green-500' :
                      coverage.bm25Score >= 45 ? 'text-amber-500' : 'text-error'
                    )}>{coverage.bm25Score}<span className="text-xs font-normal text-text-muted">/100</span></p>
                    <p className="text-[9px] text-text-muted mt-0.5">Couverture des termes SERP (×40%)</p>
                  </div>
                )}
                {coverage.semanticScore != null && (
                  <div className="bg-background rounded-lg p-3 border border-border">
                    <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1">Score Sémantique Embeddings</p>
                    <p className={cn('text-xl font-bold tabular-nums',
                      coverage.semanticScore >= 70 ? 'text-green-500' :
                      coverage.semanticScore >= 45 ? 'text-amber-500' : 'text-error'
                    )}>{coverage.semanticScore}<span className="text-xs font-normal text-text-muted">/100</span></p>
                    <p className="text-[9px] text-text-muted mt-0.5">Similarité cosinus top-3 SERP (×60%)</p>
                  </div>
                )}
              </div>
            )}
            {([
              { label: 'Sous-thèmes SERP couverts', value: coverage.topicCoverage, weight: '35%' },
              { label: 'Entités intégrées', value: coverage.entityCoverage, weight: '20%' },
              { label: 'Volume de contenu', value: coverage.wordScore, weight: '20%' },
              { label: 'Section FAQ', value: coverage.faqScore, weight: '15%' },
              { label: 'Alignement intention', value: coverage.intentScore, weight: '10%' },
            ] as const).map((row) => (
              <div key={row.label} className="space-y-1">
                <div className="flex justify-between text-[10px] text-text-muted">
                  <span>{row.label} <span className="opacity-40">({row.weight})</span></span>
                  <span className="font-bold">{row.value}%</span>
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
          {serpModel && (
            <div className="pt-3 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-background rounded-lg p-3 border border-border">
                <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1">Intention</p>
                <p className="font-semibold capitalize">{serpModel.intent}</p>
              </div>
              <div className="bg-background rounded-lg p-3 border border-border">
                <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1">Format</p>
                <p className="font-semibold capitalize">{serpModel.contentFormat}</p>
              </div>
              <div className="bg-background rounded-lg p-3 border border-border">
                <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1">Mots cibles</p>
                <p className="font-semibold">{Math.round((serpModel.avgWordCount || 0) * 1.1).toLocaleString('fr-FR')}</p>
              </div>
              <div className="bg-background rounded-lg p-3 border border-border">
                <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1">Sous-thèmes</p>
                <p className="font-semibold">{serpModel.dominantSubtopics?.length ?? 0} détectés</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 2. Semantic Terms ─────────────────────────────────────── */}
      {semantic && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
            <Search size={14} /> Termes Sémantiques
            <span className="font-normal text-text-muted/50">({semantic.pagesAnalyzed} pages analysées)</span>
          </h3>

          {semantic.primaryTerms.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-accent uppercase tracking-wider mb-2">Termes principaux</p>
              <div className="flex flex-wrap gap-1.5">
                {semantic.primaryTerms.map((t, i) => (
                  <span key={i} className="px-2.5 py-0.5 rounded-full bg-accent/10 text-accent text-[11px] font-semibold border border-accent/20">{t}</span>
                ))}
              </div>
            </div>
          )}

          {semantic.secondaryTerms.length > 0 && (
            <div className="border-t border-border pt-4">
              <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">Termes secondaires</p>
              <div className="flex flex-wrap gap-1.5">
                {semantic.secondaryTerms.map((t, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-text-muted text-[11px] border border-border">{t}</span>
                ))}
              </div>
            </div>
          )}

          {semantic.longTailVariants.length > 0 && (
            <div className="border-t border-border pt-4">
              <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">Longues traînes</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {semantic.longTailVariants.map((t, i) => (
                  <span key={i} className="text-[11px] text-text-muted bg-background px-2.5 py-1 rounded border border-border font-mono truncate">{t}</span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
            {semantic.entities.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">Entités</p>
                <div className="flex flex-wrap gap-1">
                  {semantic.entities.map((e, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-[10px] font-medium border border-purple-200 dark:border-purple-700/40">{e}</span>
                  ))}
                </div>
              </div>
            )}
            {semantic.coOccurrences.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">Co-occurrences</p>
                <div className="flex flex-col gap-0.5">
                  {semantic.coOccurrences.slice(0, 8).map((c, i) => (
                    <span key={i} className="text-[10px] text-text-muted font-mono">{c}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {semantic.contentGaps.length > 0 && (
            <div className="border-t border-border pt-4">
              <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Layers size={11} className="text-amber-500" /> Gaps de contenu identifiés
              </p>
              <div className="space-y-1.5">
                {semantic.contentGaps.map((g, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11px] text-text-muted bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/30 rounded px-3 py-2">
                    <span className="text-amber-500 font-bold shrink-0">{i + 1}.</span>
                    <span>{g}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 2b. Clusters sémantiques ──────────────────────────────── */}
      {semantic?.clusters && semantic.clusters.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
            <Layers size={14} /> Expressions Clés des SERP
            <span className="font-normal text-text-muted/50">({semantic.clusters.length} expressions)</span>
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            {semantic.clusters.map((cluster, ci) => {
              const palettes = [
                'border-blue-200   dark:border-blue-700/40   bg-blue-50   dark:bg-blue-900/10   text-blue-700   dark:text-blue-300',
                'border-violet-200 dark:border-violet-700/40 bg-violet-50 dark:bg-violet-900/10 text-violet-700 dark:text-violet-300',
                'border-emerald-200 dark:border-emerald-700/40 bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-300',
                'border-amber-200  dark:border-amber-700/40  bg-amber-50  dark:bg-amber-900/10  text-amber-700  dark:text-amber-300',
                'border-rose-200   dark:border-rose-700/40   bg-rose-50   dark:bg-rose-900/10   text-rose-700   dark:text-rose-300',
                'border-cyan-200   dark:border-cyan-700/40   bg-cyan-50   dark:bg-cyan-900/10   text-cyan-700   dark:text-cyan-300',
                'border-fuchsia-200 dark:border-fuchsia-700/40 bg-fuchsia-50 dark:bg-fuchsia-900/10 text-fuchsia-700 dark:text-fuchsia-300',
                'border-lime-200   dark:border-lime-700/40   bg-lime-50   dark:bg-lime-900/10   text-lime-700   dark:text-lime-300',
              ];
              const palette = palettes[ci % palettes.length];
              return (
                <div key={cluster.clusterId} className={`border rounded-xl p-3 flex flex-col gap-1 ${palette}`}>
                  <span className="text-[11px] font-bold leading-tight">{cluster.label}</span>
                  <div className="flex items-center justify-between mt-auto pt-1.5">
                    {cluster.pageCount != null && (
                      <span className="text-[10px] opacity-60">{cluster.pageCount} page{cluster.pageCount > 1 ? 's' : ''} SERP</span>
                    )}
                    <span className="text-[10px] font-mono opacity-40 ml-auto">{cluster.score.toFixed(3)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 3. Competitors table ──────────────────────────────────── */}
      {serpResults.length > 0 && (() => {
        const EXCL = new Set(['forum', 'homepage', 'product_page']);
        const PT_LABELS: Record<string, string> = {
          blog_article:    'Article',
          comparison_page: 'Comparatif',
          category_page:   'Catégorie',
          product_page:    'Produit',
          forum:           'Forum',
          homepage:        'Accueil',
        };
        const PT_COLORS: Record<string, string> = {
          blog_article:    'bg-green-500/15 text-green-400',
          comparison_page: 'bg-blue-500/15 text-blue-400',
          category_page:   'bg-orange-500/15 text-orange-400',
          product_page:    'bg-red-500/15 text-red-400',
          forum:           'bg-red-500/15 text-red-400',
          homepage:        'bg-zinc-500/15 text-zinc-400',
        };
        const editorial = serpResults.filter((r) => !r.pageType || !EXCL.has(r.pageType));
        const excluded  = serpResults.filter((r) => r.pageType && EXCL.has(r.pageType));
        return (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Target size={14} className="text-text-muted" />
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                  Concurrents SERP — {editorial.length} éditoriaux utilisés
                </h3>
              </div>
              {excluded.length > 0 && (
                <span className="text-[10px] text-text-muted/60 bg-background border border-border rounded-full px-2 py-0.5">
                  {excluded.length} exclus (forum / accueil / produit)
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-background/50">
                    <th className="text-left px-4 py-3 text-[10px] font-bold text-text-muted uppercase tracking-wider w-8">#</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold text-text-muted uppercase tracking-wider">Type</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold text-text-muted uppercase tracking-wider w-36">Domaine</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold text-text-muted uppercase tracking-wider">Titre</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold text-text-muted uppercase tracking-wider hidden lg:table-cell">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {serpResults.map((r, i) => {
                    const isExcluded = r.pageType && EXCL.has(r.pageType);
                    return (
                      <tr key={i} className={cn(
                        'border-b border-border/50 transition-colors',
                        isExcluded ? 'opacity-40' : 'hover:bg-accent-hover',
                      )}>
                        <td className="px-4 py-3 text-text-muted font-mono text-[10px]">{r.rank}</td>
                        <td className="px-4 py-3">
                          {r.pageType ? (
                            <span className={cn('text-[9px] font-bold px-2 py-0.5 rounded-full', PT_COLORS[r.pageType] ?? 'bg-border text-text-muted')}>
                              {PT_LABELS[r.pageType] ?? r.pageType}
                            </span>
                          ) : <span className="text-text-muted/30 text-[9px]">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:underline text-[11px] font-medium truncate flex items-center gap-1 max-w-[130px]"
                          >
                            <ExternalLink size={10} className="shrink-0" />
                            <span className="truncate">{r.domain || new URL(r.url || 'https://x.com').hostname}</span>
                          </a>
                        </td>
                        <td className="px-4 py-3 text-text text-[11px] max-w-[280px]">
                          <p className="line-clamp-2">{r.title || '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-text-muted text-[10px] max-w-[320px] hidden lg:table-cell">
                          <p className="line-clamp-2">{r.description || '—'}</p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ── 4. 300 Key Terms Table ─────────────────────────────────── */}
      {allTerms.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border space-y-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                <BarChart2 size={14} /> Termes clés ({allTerms.length}) — min · max · cible vs article
              </h3>
              <input
                type="text"
                placeholder="Rechercher un terme…"
                value={termSearch}
                onChange={(e) => setTermSearch(e.target.value)}
                className="text-[11px] bg-background border border-border rounded-lg px-3 py-1.5 text-text placeholder:text-text-muted/50 focus:outline-none focus:border-accent w-44"
              />
            </div>
            {/* Filter tabs */}
            <div className="flex gap-1.5 flex-wrap">
              {([
                { key: 'all',    label: `Tous (${allTerms.length})`,       color: 'text-text-muted' },
                { key: 'in',     label: `✓ Dans la plage (${counts.in})`,  color: 'text-green-500' },
                { key: 'out',    label: `⚠ Hors plage (${counts.out})`,   color: 'text-amber-500' },
                { key: 'absent', label: `✗ Absents (${counts.absent})`,    color: 'text-red-500' },
              ] as const).map((f) => (
                <button
                  key={f.key}
                  onClick={() => setTermFilter(f.key)}
                  className={cn(
                    'px-3 py-1 rounded-full text-[10px] font-bold border transition-all',
                    termFilter === f.key
                      ? 'bg-accent text-white border-accent'
                      : `border-border ${f.color} hover:border-text/30`
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-text-muted">
              Fréquences normalisées pour <strong>1 000 tokens</strong>. Min/Max = plage observée chez les concurrents. Cible = milieu de plage. Utilisé = compte normalisé dans cet article.
            </p>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-background/50 text-[9px] font-bold text-text-muted uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5 sticky left-0 bg-background/90 backdrop-blur min-w-[180px]">#  Terme</th>
                  <th className="px-3 py-2.5 text-center w-16">Min</th>
                  <th className="px-3 py-2.5 text-center w-16">Max</th>
                  <th className="px-3 py-2.5 text-center w-16 text-violet-400">Cible</th>
                  <th className="px-3 py-2.5 text-center w-20">Utilisé</th>
                  <th className="px-3 py-2.5 text-center w-24">Statut</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => {
                  const hasData = t.minCount != null && t.maxCount != null;
                  const statusCfg = {
                    in:     { label: '✓ OK',    bg: 'bg-green-500/10 text-green-400 border-green-500/20' },
                    out:    { label: '⚠ Hors',  bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
                    absent: { label: '✗ Absent', bg: 'bg-red-500/10 text-red-400 border-red-500/20' },
                    nodata: { label: '— ',       bg: 'bg-border/30 text-text-muted border-border/20' },
                  }[t.status];

                  // Article count bar width relative to max*2 so it's visible even far out
                  const barMax   = hasData ? Math.max((t.maxCount ?? 1) * 2, t.articleNorm + 1, 1) : Math.max(t.articleNorm + 1, 1);
                  const barPct   = Math.min(100, (t.articleNorm / barMax) * 100);
                  const inRange  = hasData && t.articleNorm >= t.minCount! && t.articleNorm <= t.maxCount!;
                  const aboveMax = hasData && t.articleNorm > t.maxCount!;

                  return (
                    <tr
                      key={t.term}
                      className={cn(
                        'border-b border-border/40 transition-colors',
                        t.status === 'in'     ? 'hover:bg-green-500/5' :
                        t.status === 'out'    ? 'hover:bg-amber-500/5' :
                        t.status === 'absent' ? 'hover:bg-red-500/5' :
                        'hover:bg-accent-hover'
                      )}
                    >
                      {/* Term */}
                      <td className="px-4 py-2 sticky left-0 bg-card backdrop-blur">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-text-muted/40 font-mono w-6 shrink-0">{i + 1}</span>
                          <span className="font-mono text-[11px] text-text font-medium">{t.display || t.term}</span>
                          {/* score bar */}
                          <div className="w-10 h-1 bg-border rounded-full overflow-hidden shrink-0 hidden sm:block">
                            <div className="h-full bg-violet-500/60 rounded-full" style={{ width: `${Math.round((t.score ?? 0) * 100)}%` }} />
                          </div>
                        </div>
                      </td>
                      {/* Min */}
                      <td className="px-3 py-2 text-center font-mono text-[10px] text-text-muted">
                        {hasData ? t.minCount : '—'}
                      </td>
                      {/* Max */}
                      <td className="px-3 py-2 text-center font-mono text-[10px] text-text-muted">
                        {hasData ? t.maxCount : '—'}
                      </td>
                      {/* Target */}
                      <td className="px-3 py-2 text-center font-mono text-[10px] font-bold text-violet-400">
                        {hasData ? `~${t.target}` : '—'}
                      </td>
                      {/* Used in article — bar + value */}
                      <td className="px-3 py-2 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={cn(
                            'font-mono text-[10px] font-bold',
                            t.articleCount === 0 ? 'text-text-muted/40' :
                            inRange   ? 'text-green-400' :
                            aboveMax  ? 'text-amber-400' : 'text-red-400'
                          )}>
                            {t.articleCount > 0 ? `${t.articleNorm}` : '0'}
                          </span>
                          {/* usage bar */}
                          <div className="relative w-12 h-1 bg-border rounded-full overflow-hidden">
                            {/* min marker zone */}
                            {hasData && (
                              <>
                                {/* green zone: min→max */}
                                <div
                                  className="h-full absolute"
                                  style={{
                                    left: `${Math.min(100, ((t.minCount ?? 0) / barMax) * 100)}%`,
                                    width: `${Math.min(100, (((t.maxCount ?? 0) - (t.minCount ?? 0)) / barMax) * 100)}%`,
                                    background: 'rgba(34,197,94,0.25)',
                                  }}
                                />
                              </>
                            )}
                            <div
                              className={cn(
                                'h-full rounded-full transition-all',
                                inRange  ? 'bg-green-500' :
                                aboveMax ? 'bg-amber-500' :
                                t.articleCount > 0 ? 'bg-red-500' : 'bg-border'
                              )}
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      {/* Status badge */}
                      <td className="px-3 py-2 text-center">
                        <span className={cn('text-[9px] font-bold px-2 py-0.5 rounded-full border', statusCfg.bg)}>
                          {statusCfg.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <p className="text-center text-[11px] text-text-muted py-8">Aucun terme correspondant au filtre.</p>
          )}
        </div>
      )}

      {/* empty state — neither coverage nor semantic */}
      {!coverage && !semantic && serpResults.length === 0 && (
        <div className="bg-card border border-border rounded-2xl p-12 flex flex-col items-center justify-center text-center gap-3">
          <Search size={36} className="text-text-muted opacity-20" />
          <p className="text-sm font-bold text-text-muted">Données d&apos;analyse absentes</p>
          <p className="text-xs text-text-muted">Les données SEO seront disponibles pour les prochains articles générés.</p>
        </div>
      )}
    </div>
  );
}
