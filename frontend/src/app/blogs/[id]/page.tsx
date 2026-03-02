'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import ProtectedRoute from '../../components/ProtectedRoute';
import Navbar from '../../components/Navbar';
import Link from 'next/link';
import {
  ChevronLeft, ExternalLink, Calendar, Globe, Tag, FileText,
  Hash, BarChart2, Clock, Copy, CheckCircle2, Eye, Code2,
  Rocket, FileEdit, RefreshCw, Trash2, AlertTriangle,
} from 'lucide-react';
import { cn } from '../../utils/cn';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

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
  const [tab, setTab] = useState<'seo' | 'content' | 'raw'>('seo');
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
      <ProtectedRoute>
        <div className="min-h-screen bg-background">
          <Navbar />
          <div className="flex items-center justify-center py-32 text-text-muted">
            <RefreshCw className="animate-spin mr-3" size={24} />
            <span className="text-sm font-medium">Chargement de l&apos;article...</span>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!blog) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-background">
          <Navbar />
          <div className="flex flex-col items-center justify-center py-32 text-text-muted">
            <FileText size={48} className="mb-4 opacity-20" />
            <p className="font-bold mb-2">Article introuvable</p>
            <Link href="/blogs" className="btn-primary mt-4">Retour à l&apos;historique</Link>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  const kd = blog.keywords?.competition_index;
  const kdColor = kd == null ? 'text-text-muted' : kd < 30 ? 'text-success' : kd < 60 ? 'text-accent' : 'text-error';

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        <Navbar />

        <div className="max-w-7xl mx-auto py-12 px-6">
          {/* Back + header */}
          <Link
            href="/blogs"
            className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text mb-8 transition-colors group"
          >
            <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            Retour à l&apos;historique
          </Link>

          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 mb-10">
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
                  'flex items-center gap-2 py-2 px-4 rounded-xl border text-xs font-bold transition-all',
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* ── Left column: metadata ───────────────────────────── */}
            <div className="space-y-6">

              {/* SEO */}
              <div className="bg-surface border border-border rounded-2xl p-6 space-y-5">
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
              <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
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
              <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
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
            </div>

            {/* ── Right column: content ───────────────────────────── */}
            <div className="lg:col-span-2 space-y-6">

              {/* Tabs */}
              <div className="flex gap-1 bg-surface border border-border rounded-xl p-1 w-fit">
                {([
                  { key: 'seo', label: 'Aperçu SEO', icon: Eye },
                  { key: 'content', label: 'Article HTML', icon: FileText },
                  { key: 'raw', label: 'Brut Claude', icon: Code2 },
                ] as const).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all',
                      tab === key
                        ? 'bg-background border border-border text-text shadow-sm'
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
                <div className="space-y-6">
                  <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
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

                  <div className="bg-surface border border-border rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
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
                <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-border">
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

              {/* Tab: Raw Claude output */}
              {tab === 'raw' && (
                <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-zinc-900/50">
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
      </div>
    </ProtectedRoute>
  );
}
