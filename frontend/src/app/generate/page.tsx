'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedRoute from '../components/ProtectedRoute';
import Navbar from '../components/Navbar';
import { LogEvent } from '../components/ProgressLog';
import ProgressLog from '../components/ProgressLog';
import { Sparkles, Globe, Type, Settings2, FileEdit, Rocket, RefreshCw, ChevronLeft, Terminal, Layout, FlaskConical, Search, ExternalLink, TrendingUp } from 'lucide-react';
import { cn } from '../utils/cn';
import Link from 'next/link';
import { Skeleton, Spinner } from '../components/UI';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const STORAGE_KEY = 'blogauto_generation_job';

interface Site {
  id: string;
  name: string;
  url: string;
  webflow_site_id: string;
  webflow_api_key: string;
  webflow_collection_name: string;
}

const TONE_OPTIONS = [
  'Expert et pédagogique',
  'Professionnel et concis',
  'Engageant et conversationnel',
  'Inspirant et motivant',
  'Technique et précis',
  'Accessible et grand public',
];

type SeoPreviewData = Extract<LogEvent, { type: 'seo-preview' }>['data'];

function SeoPreviewPanel({ data }: { data: SeoPreviewData }) {
  const { mainKeyword, kd, kwSearchVolume, serpResults, serpModel, semanticAnalysis } = data;
  const sem = semanticAnalysis;

  const chip = (label: string, color = 'bg-accent/10 text-accent') => (
    <span key={label} className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', color)}>{label}</span>
  );

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-500 overflow-y-auto max-h-[75vh] pr-1">

      {/* ── Keyword ─── */}
      <div className="bg-background border border-violet-500/30 rounded-xl p-4 space-y-3">
        <p className="text-[9px] font-bold uppercase tracking-widest text-violet-400 flex items-center gap-1.5"><TrendingUp size={11}/>Mot-clé retenu</p>
        <div className="flex items-end gap-3 flex-wrap">
          <span className="text-xl font-bold">{mainKeyword}</span>
          {kd !== null && <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', kd < 30 ? 'bg-green-500/10 text-green-400' : kd < 60 ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400')}>KD {kd}/100</span>}
          {kwSearchVolume !== null && kwSearchVolume !== undefined && <span className="text-xs text-text-muted">{kwSearchVolume.toLocaleString('fr-FR')} vol/mois</span>}
        </div>
      </div>

      {/* ── Analyse unifiée (SERP + Sémantique) ─── */}
      {sem && (
        <div className="bg-surface border border-border rounded-xl p-4 space-y-4">
          <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-1.5"><Search size={11}/>Analyse Complète — {sem.pagesAnalyzed} pages crawlées</p>

          {/* Stats SERP */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            {[
              ['Intention', sem.intent ?? serpModel?.intent ?? '—'],
              ['Format', sem.contentFormat ?? serpModel?.contentFormat ?? '—'],
              ['Mots cibles', `~${Math.round(((sem.avgWordCount ?? serpModel?.avgWordCount) || 1500) * 1.1).toLocaleString('fr-FR')}`],
            ].map(([l, v]) => (
              <div key={l} className="bg-background rounded-lg p-2.5 border border-border">
                <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1">{l}</p>
                <p className="font-semibold capitalize text-[11px]">{v}</p>
              </div>
            ))}
          </div>

          {(sem.dominantSubtopics?.length ?? 0) > 0 && (
            <div>
              <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1.5">Sous-thèmes à couvrir ({sem.dominantSubtopics!.length})</p>
              <div className="flex flex-wrap gap-1.5">{sem.dominantSubtopics!.map((t) => chip(t, 'bg-blue-500/10 text-blue-400'))}</div>
            </div>
          )}
          {sem.primaryTerms?.length > 0 && (
            <div><p className="text-[9px] text-text-muted uppercase tracking-wider mb-1.5">Termes principaux</p>
              <div className="flex flex-wrap gap-1.5">{sem.primaryTerms.map((t) => chip(t, 'bg-accent/10 text-accent'))}</div>
            </div>
          )}
          {sem.secondaryTerms?.length > 0 && (
            <div><p className="text-[9px] text-text-muted uppercase tracking-wider mb-1.5">Termes secondaires</p>
              <div className="flex flex-wrap gap-1.5">{sem.secondaryTerms.map((t) => chip(t, 'bg-border text-text-muted'))}</div>
            </div>
          )}
          {sem.longTailVariants?.length > 0 && (
            <div><p className="text-[9px] text-text-muted uppercase tracking-wider mb-1.5">Longues traînes</p>
              <div className="flex flex-wrap gap-1.5">{sem.longTailVariants.map((t) => chip(t, 'bg-green-500/10 text-green-400 font-mono'))}</div>
            </div>
          )}
          {sem.entities?.length > 0 && (
            <div><p className="text-[9px] text-text-muted uppercase tracking-wider mb-1.5">Entités</p>
              <div className="flex flex-wrap gap-1.5">{sem.entities.map((t) => chip(t, 'bg-purple-500/10 text-purple-400'))}</div>
            </div>
          )}
          {sem.contentGaps?.length > 0 && (
            <div><p className="text-[9px] text-text-muted uppercase tracking-wider mb-1.5">Gaps de contenu</p>
              <ul className="text-[11px] text-amber-400 space-y-1">{sem.contentGaps.map((g) => <li key={g} className="flex gap-1.5"><span>⚠</span>{g}</li>)}</ul>
            </div>
          )}
          {sem.coOccurrences?.length > 0 && (
            <div><p className="text-[9px] text-text-muted uppercase tracking-wider mb-1.5">Co-occurrences</p>
              <div className="flex flex-wrap gap-1.5">{sem.coOccurrences.map((t) => chip(t, 'bg-zinc-700/50 text-zinc-300'))}</div>
            </div>
          )}
          {(sem.faqQuestions?.length ?? 0) > 0 && (
            <div>
              <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1.5">Questions FAQ ({sem.faqQuestions!.length})</p>
              <ul className="text-[11px] text-text-muted space-y-1">{sem.faqQuestions!.map((q) => <li key={q} className="flex gap-1.5"><span className="text-accent">›</span>{q}</li>)}</ul>
            </div>
          )}
          {sem.intentTopTerms && sem.intentTopTerms.length > 0 && (
            <div>
              <p className="text-[9px] text-text-muted uppercase tracking-wider mb-2">
                Termes clés ({sem.intentTopTerms.length}) — triés par intention (BM25 + Embeddings)
              </p>
              <div className="overflow-y-auto max-h-[820px] pr-1">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                  {sem.intentTopTerms.map((t, i) => (
                    <div key={t.term} className="flex items-center gap-1.5 bg-background border border-border/50 rounded px-2 py-1">
                      <span className="text-[9px] text-text-muted/50 w-5 shrink-0 text-right font-mono">{i + 1}</span>
                      <span className="text-[10px] font-mono text-text truncate flex-1" title={t.display || t.term}>{t.display || t.term}</span>
                      <div className="w-10 h-1 bg-border rounded-full overflow-hidden shrink-0">
                        <div className="h-full bg-violet-500 rounded-full" style={{ width: `${Math.round(t.score * 100)}%` }} />
                      </div>
                      <span className="text-[9px] text-violet-400 font-bold w-7 text-right shrink-0">{(t.score * 100).toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {sem.relatedKws && sem.relatedKws.length > 0 && (
            <div>
              <p className="text-[9px] text-text-muted uppercase tracking-wider mb-2">Mots-clés connexes DataForSEO (top {sem.relatedKws.length})</p>
              <div className="flex flex-wrap gap-1.5">{sem.relatedKws.map((k) => (
                <span key={k.keyword} className="px-2 py-0.5 bg-background border border-border rounded-full text-[10px] text-text-muted">
                  {k.keyword} <span className="text-accent">{k.volume.toLocaleString('fr-FR')}</span>
                </span>
              ))}</div>
            </div>
          )}


        </div>
      )}

      {/* ── Term × Page distribution ─── */}
      {sem?.termDistribution && sem.termDistribution.length > 0 && sem.pagesMeta && sem.pagesMeta.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Distribution top-20 termes × pages SERP</p>
          <div className="overflow-x-auto">
            <table className="text-[9px]">
              <thead>
                <tr>
                  <th className="text-left py-1 pr-3 text-text-muted font-semibold w-28">Terme</th>
                  {sem.pagesMeta.map((p) => (
                    <th key={p.idx} className="px-1 py-1 text-center text-text-muted font-normal max-w-[36px]">
                      <div className="truncate max-w-[32px]" title={p.domain}>{p.domain.replace('www.', '').split('.')[0]}</div>
                    </th>
                  ))}
                  <th className="px-1 py-1 text-center text-text-muted font-semibold">n</th>
                  <th className="px-1 py-1 text-center text-text-muted font-semibold" title="Minimum / Maximum (pour 1000 mots)">min</th>
                  <th className="px-1 py-1 text-center text-text-muted font-semibold" title="Maximum (pour 1000 mots)">max</th>
                  <th className="px-1 py-1 text-center text-violet-400 font-bold" title="Cible recommandée (milieu de la plage)">cible</th>
                </tr>
              </thead>
              <tbody>
                {sem.termDistribution.map((row) => {
                  const count = row.presences.filter(Boolean).length;
                  return (
                    <tr key={row.term} className="border-t border-border/30">
                      <td className="py-0.5 pr-3 font-mono text-text truncate max-w-[112px]">{(row as { display?: string; term: string }).display || row.term}</td>
                      {(row.counts ?? row.presences).map((val: number | boolean, i: number) => {
                        const c = typeof val === 'number' ? val : (val ? 1 : 0);
                        return (
                          <td key={i} className="px-1 py-0.5 text-center">
                            <span className={cn('text-[10px] font-mono', c > 0 ? 'text-green-400' : 'text-border')}>
                              {c > 0 ? c : '·'}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-1 py-0.5 text-center">
                        <span className={cn('font-bold', count > sem.pagesMeta!.length * 0.6 ? 'text-green-400' : count > 2 ? 'text-amber-400' : 'text-text-muted')}>{count}</span>
                      </td>
                      <td className="px-1 py-0.5 text-center text-text-muted font-mono">{row.minCount ?? '—'}</td>
                      <td className="px-1 py-0.5 text-center text-text-muted font-mono">{row.maxCount ?? '—'}</td>
                      <td className="px-1 py-0.5 text-center font-bold text-violet-400 font-mono">~{row.target ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SERP Results ─── */}
      {serpResults && serpResults.length > 0 && (() => {
        const EXCLUDED = new Set(['forum', 'homepage', 'product_page']);
        const editorial = serpResults.filter((r) => !r.pageType || !EXCLUDED.has(r.pageType)).slice(0, 10);
        const excluded  = serpResults.filter((r) => r.pageType && EXCLUDED.has(r.pageType));
        return (
        <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Résultats SERP top {editorial.length}</p>
            {excluded.length > 0 && (
              <span className="text-[9px] text-text-muted/60">{excluded.length} exclu{excluded.length > 1 ? 's' : ''} (forum/accueil/produit)</span>
            )}
          </div>
          <div className="space-y-2">
            {editorial.map((r) => (
              <div key={r.rank} className="flex gap-3 items-start p-2.5 bg-background rounded-lg border border-border">
                <span className="text-[9px] font-bold text-text-muted w-4 shrink-0 mt-0.5">#{r.rank}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="text-[11px] font-semibold text-text leading-tight truncate">{r.title}</p>
                    {r.pageType && (() => {
                      const PAGE_TYPE_LABELS: Record<string, string> = {
                        blog_article:    'Article',
                        comparison_page: 'Comparatif',
                        category_page:   'Catégorie',
                        product_page:    'Produit',
                        homepage:        'Accueil',
                        forum:           'Forum',
                      };
                      const PAGE_TYPE_COLORS: Record<string, string> = {
                        blog_article:    'bg-green-500/15 text-green-400',
                        comparison_page: 'bg-blue-500/15 text-blue-400',
                        category_page:   'bg-orange-500/15 text-orange-400',
                        product_page:    'bg-red-500/15 text-red-400',
                        homepage:        'bg-border text-text-muted',
                        forum:           'bg-red-500/15 text-red-400',
                      };
                      const label = PAGE_TYPE_LABELS[r.pageType] ?? r.pageType;
                      const color = PAGE_TYPE_COLORS[r.pageType] ?? 'bg-border text-text-muted';
                      return <span className={cn('shrink-0 px-1.5 py-px rounded text-[9px] font-semibold', color)}>{label}</span>;
                    })()}
                  </div>
                  <p className="text-[9px] text-accent truncate">{r.domain}</p>
                  {r.description && <p className="text-[10px] text-text-muted mt-0.5 line-clamp-2">{r.description}</p>}
                </div>
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-accent shrink-0 mt-0.5">
                  <ExternalLink size={11} />
                </a>
              </div>
            ))}
          </div>
        </div>
        );
      })()}
    </div>
  );
}

function GeneratePageContent() {
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [theme, setTheme] = useState('');
  const [keywordMode, setKeywordMode] = useState<'theme' | 'keyword'>('theme');
  const [directKeyword, setDirectKeyword] = useState('');
  const [toneMode, setToneMode] = useState<'preset' | 'custom'>('preset');
  const [tone, setTone] = useState('Expert et pédagogique');
  const [customTone, setCustomTone] = useState('');
  const [status, setStatus] = useState<'draft' | 'publish'>('draft');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingSites, setIsFetchingSites] = useState(true);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [seoTestMode, setSeoTestMode] = useState(false);
  const [seoPreviewResult, setSeoPreviewResult] = useState<SeoPreviewData | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const jobIdRef = useRef<string | null>(null);

  // Restore previous job from localStorage on mount
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as { jobId: string; events: LogEvent[]; done: boolean };
      if (!saved.jobId || !saved.events?.length) return;

      jobIdRef.current = saved.jobId;
      setEvents(saved.events);
      if (saved.done) return; // Job finished — just show results

      // Job was still running — reconnect SSE
      setIsLoading(true);
      const skipCount = { value: saved.events.length };
      const es = new EventSource(`${API_URL}/stream/${saved.jobId}`);
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as LogEvent;
          // Skip events already stored in localStorage (backend replays from beginning)
          if (skipCount.value > 0) { skipCount.value--; return; }
          setEvents((prev) => {
            const next = [...prev, event];
            const done = event.type === 'done' || event.type === 'error';
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ jobId: saved.jobId, events: next, done }));
            return next;
          });
          if (event.type === 'done' || event.type === 'error') {
            es.close();
            setIsLoading(false);
          }
        } catch { /* ignore */ }
      };
      es.onerror = () => { es.close(); setIsLoading(false); };
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const siteIdFromUrl = searchParams.get('siteId');
    if (siteIdFromUrl) {
      setSelectedSiteId(siteIdFromUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    if (token) {
      fetchSites();
    }
  }, [token]);

  async function fetchSites() {
    setIsFetchingSites(true);
    try {
      const res = await fetch(`${API_URL}/sites`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSites(data.sites);
      }
    } catch (error) {
      console.error('Erreur récupération sites:', error);
    } finally {
      setIsFetchingSites(false);
    }
  }

  function handleReset() {
    esRef.current?.close();
    localStorage.removeItem(STORAGE_KEY);
    jobIdRef.current = null;
    setEvents([]);
    setSeoPreviewResult(null);
    setIsLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    const selectedSite = sites.find(s => s.id === selectedSiteId);
    if (!seoTestMode && !selectedSite) {
      alert('Veuillez sélectionner un site');
      return;
    }

    const themeOrKeyword = keywordMode === 'theme' ? theme : directKeyword;
    if (!themeOrKeyword) {
      alert(keywordMode === 'theme' ? 'Veuillez entrer un thème' : 'Veuillez entrer un mot-clé');
      return;
    }

    esRef.current?.close();
    setEvents([]);
    setSeoPreviewResult(null);
    jobIdRef.current = null;
    localStorage.removeItem(STORAGE_KEY);
    setIsLoading(true);

    try {
      const endpoint = seoTestMode ? `${API_URL}/seo-preview` : `${API_URL}/generate`;
      const body = seoTestMode
        ? JSON.stringify({
            theme: keywordMode === 'theme' ? themeOrKeyword : undefined,
            directKeyword: keywordMode === 'keyword' ? directKeyword : undefined,
          })
        : JSON.stringify({
            siteId: selectedSite!.webflow_site_id,
            apiKey: selectedSite!.webflow_api_key,
            collectionName: selectedSite!.webflow_collection_name,
            theme: themeOrKeyword,
            directKeyword: keywordMode === 'keyword' ? directKeyword : undefined,
            tone: toneMode === 'custom' ? customTone : tone,
            status,
            siteUrl: selectedSite!.url,
            dbSiteId: selectedSite!.id,
          });

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body,
      });

      if (!res.ok) {
        const err = await res.json();
        setEvents([{ type: 'error', message: err.error || 'Erreur serveur' }]);
        setIsLoading(false);
        return;
      }

      const { jobId } = await res.json();
      jobIdRef.current = jobId;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ jobId, events: [], done: false }));

      const es = new EventSource(`${API_URL}/stream/${jobId}`);
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as LogEvent;
          if (event.type === 'seo-preview') {
            setSeoPreviewResult(event.data);
          }
          setEvents((prev) => {
            const next = [...prev, event];
            const done = event.type === 'done' || event.type === 'error';
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ jobId, events: next, done }));
            return next;
          });
          if (event.type === 'done' || event.type === 'error') {
            es.close();
            setIsLoading(false);
          }
        } catch {
          // ignore
        }
      };

      es.onerror = () => {
        es.close();
        setIsLoading(false);
        setEvents((prev) => {
          const event: LogEvent = { type: 'error', message: 'Connexion au serveur perdue.' };
          const next = [...prev, event];
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ jobId, events: next, done: true }));
          return next;
        });
      };
    } catch (err) {
      setEvents([{ type: 'error', message: (err as Error).message }]);
      setIsLoading(false);
    }
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background animate-fade-in">
        <Navbar />

        <div className="max-w-7xl mx-auto py-12 px-6">
          <Link 
            href="/dashboard" 
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-text-muted hover:text-accent mb-8 transition-all group"
          >
            <ChevronLeft size={14} className="transition-transform" />
            Retour au Dashboard
          </Link>

          <div className="mb-12 animate-slide-up">
            <h1 className="text-4xl font-bold tracking-tight mb-3 flex items-center gap-4">
              Générer un article SEO
              <div className="p-2 bg-accent/10 rounded-xl">
                <Sparkles className="text-accent" size={28} />
              </div>
            </h1>
            <p className="text-md text-text-muted max-w-2xl ">
              Configurez votre sujet et laissez l'IA optimiser votre contenu pour Webflow avec une précision chirurgicale.
            </p>
          </div>

          {isFetchingSites ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <Skeleton className="h-[600px] rounded-2xl" />
              <Skeleton className="h-[600px] rounded-2xl" />
            </div>
          ) : sites.length === 0 ? (
            <div className="bg-surface border border-border rounded-3xl p-16 text-center animate-slide-up shadow-xl shadow-black/5">
              <div className="w-20 h-20 bg-accent/5 rounded-full flex items-center justify-center mx-auto mb-6">
                <Globe className="text-accent" size={40} />
              </div>
              <h2 className="text-2xl font-bold mb-3">Aucun site configuré</h2>
              <p className="text-text-muted mb-10 max-w-sm mx-auto font-medium">Vous devez d'abord connecter un projet Webflow pour commencer à générer du contenu.</p>
              <Link href="/dashboard" className="btn-accent px-6 py-2.5 text-sm font-semibold uppercase tracking-widest">
                Ajouter mon premier site
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
              {/* Left — Form */}
              <div className="bg-surface/50 border border-border rounded-xl p-6 sticky top-24 shadow-xl shadow-black/5 backdrop-blur-sm animate-slide-up">
                <form onSubmit={handleSubmit} className="space-y-10">
                  <div className="space-y-8">
                    {/* Site selection */}
                    <div className="space-y-3">
                      <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted flex items-center gap-2 px-1">
                        <Globe size={12} />
                        Projet Webflow
                      </label>
                      <div className="relative group">
                        <select
                          value={selectedSiteId}
                          onChange={(e) => setSelectedSiteId(e.target.value)}
                          required
                          className="input-base pr-10 appearance-none cursor-pointer"
                        >
                          <option value="">Sélectionnez un projet</option>
                          {sites.map((site) => (
                            <option key={site.id} value={site.id}>
                              {site.name}
                            </option>
                          ))}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted group-focus-within:text-accent transition-colors">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Theme / Direct keyword */}
                    <div className="space-y-4">
                      <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted flex items-center gap-2 px-1">
                        <Type size={12} />
                        Sujet de l'article
                      </label>
                      
                      {/* Mode toggle */}
                      <div className="p-1 bg-bg border border-border rounded-xl flex gap-1">
                        {(['theme', 'keyword'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setKeywordMode(m)}
                            className={cn(
                              'flex-1 py-2 px-4 rounded-lg text-[10px] font-semibold uppercase tracking-widest transition-all',
                              keywordMode === m
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'text-text-muted hover:text-text'
                            )}
                          >
                            {m === 'theme' ? '🎯 Thème' : '🔑 Mot-clé direct'}
                          </button>
                        ))}
                      </div>

                      <div className="space-y-2">
                        {keywordMode === 'theme' ? (
                          <>
                            <input
                              type="text"
                              placeholder="ex: marketing digital, intelligence artificielle..."
                              value={theme}
                              onChange={(e) => setTheme(e.target.value)}
                              required
                              className="input-base"
                            />
                            <div className="flex items-center gap-2 px-1">
                              <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                              <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Analyse intelligente DataForSEO incluse</p>
                            </div>
                          </>
                        ) : (
                          <>
                            <input
                              type="text"
                              placeholder="ex: meilleure mutuelle santé senior 2026"
                              value={directKeyword}
                              onChange={(e) => setDirectKeyword(e.target.value)}
                              required
                              className="input-base"
                            />
                            <div className="flex items-center gap-2 px-1">
                              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                              <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Utilisation directe du mot-clé</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Tone */}
                    <div className="space-y-4">
                      <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted flex items-center gap-2 px-1">
                        <Settings2 size={12} />
                        Ton éditorial
                      </label>

                      {/* Tone mode toggle */}
                      <div className="p-1 bg-bg border border-border rounded-xl flex gap-1">
                        {(['preset', 'custom'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setToneMode(m)}
                            className={cn(
                              'flex-1 py-2 px-4 rounded-lg text-[10px] font-semibold uppercase tracking-widest transition-all',
                              toneMode === m
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'text-text-muted hover:text-text'
                            )}
                          >
                            {m === 'preset' ? 'Prédéfini' : '✏️ Personnalisé'}
                          </button>
                        ))}
                      </div>

                      {toneMode === 'preset' ? (
                        <div className="relative group">
                          <select
                            value={tone}
                            onChange={(e) => setTone(e.target.value)}
                            className="input-base pr-10 appearance-none cursor-pointer"
                          >
                            {TONE_OPTIONS.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted group-focus-within:text-accent transition-colors">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        </div>
                      ) : (
                        <input
                          type="text"
                          placeholder="ex: Humoristique et décalé, Formel et académique..."
                          value={customTone}
                          onChange={(e) => setCustomTone(e.target.value)}
                          required={toneMode === 'custom'}
                          className="input-base"
                        />
                      )}
                    </div>

                    {/* Status */}
                    <div className="space-y-3">
                      <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted px-1">Mode de publication</label>
                      <div className="grid grid-cols-2 gap-4">
                        {(['draft', 'publish'] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setStatus(s)}
                            className={cn(
                              "flex items-center justify-center gap-2 py-3 rounded-2xl border-2 text-xs font-semibold uppercase tracking-widest transition-all active:scale-[0.98] shadow-sm",
                              status === s
                                ? "bg-accent/5 text-accent border-accent shadow-accent/10"
                                : "bg-bg border-border text-text-muted hover:border-text/20 hover:text-text"
                            )}
                          >
                            {s === 'draft' ? <FileEdit size={16} /> : <Rocket size={16} />}
                            {s === 'draft' ? 'Brouillon' : 'Publier'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* SEO Test Mode toggle */}
                  <div
                    onClick={() => setSeoTestMode((v) => !v)}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all select-none',
                      seoTestMode
                        ? 'border-violet-500/60 bg-violet-500/10 text-violet-400'
                        : 'border-border bg-bg text-text-muted hover:border-text/20'
                    )}
                  >
                    <FlaskConical size={16} className={seoTestMode ? 'text-violet-400' : 'text-text-muted'} />
                    <div className="flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest">Mode Test SEO</p>
                      <p className="text-[10px] opacity-60 mt-0.5">{seoTestMode ? 'Analyse uniquement — aucun article généré ni sauvegardé' : 'Activer pour tester SERP + analyse sémantique'}</p>
                    </div>
                    <div className={cn(
                      'w-8 h-4 rounded-full transition-all relative',
                      seoTestMode ? 'bg-violet-500' : 'bg-border'
                    )}>
                      <div className={cn(
                        'absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all',
                        seoTestMode ? 'left-4' : 'left-0.5'
                      )} />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className={cn(
                      'w-full py-2.5 text-sm font-semibold uppercase tracking-[0.1em] shadow-lg gap-3',
                      seoTestMode
                        ? 'btn-base bg-violet-600 text-white hover:bg-violet-500 shadow-violet-900/30'
                        : 'btn-accent shadow-accent/20'
                    )}
                  >
                    {isLoading ? (
                      <>
                        <Spinner className="w-5 h-5" />
                        <span>{seoTestMode ? 'Analyse SEO en cours...' : 'Traitement intelligent...'}</span>
                      </>
                    ) : seoTestMode ? (
                      <>
                        <FlaskConical size={20} />
                        <span>Analyser SEO uniquement</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={20} />
                        <span>Générer l'article</span>
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Right — Progress log */}
              <div className="bg-surface/50 border border-border rounded-xl p-6 min-h-[600px] flex flex-col shadow-xl shadow-black/5 backdrop-blur-sm animate-slide-up [animation-delay:100ms]">
                <div className="flex items-center justify-between mb-8 pb-6 border-b border-border">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-text/5 rounded-lg">
                      {seoTestMode ? <FlaskConical size={16} className="text-violet-400" /> : <Terminal size={16} />}
                    </div>
                    <h3 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                      {seoTestMode ? 'Analyse SEO — Mode Test' : 'Monitor de Progression'}
                    </h3>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    {isLoading && (
                      <div className="flex items-center gap-2 px-3 py-1 bg-accent/10 rounded-full">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                        <span className="text-[10px] font-semibold text-accent uppercase tracking-widest">Live</span>
                      </div>
                    )}
                    {events.length > 0 && !isLoading && (
                      <button
                        onClick={handleReset}
                        className="btn-base px-3 py-1.5 border border-border text-[10px] font-semibold text-text-muted hover:text-error hover:border-error/20 uppercase tracking-widest transition-all"
                      >
                        <RefreshCw size={12} className="mr-1.5" />
                        Réinitialiser
                      </button>
                    )}
                  </div>
                </div>

                {events.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-text-muted/40 italic text-center p-12">
                    <div className="w-24 h-24 bg-text/5 rounded-full flex items-center justify-center mb-8">
                      {seoTestMode
                        ? <FlaskConical size={40} className="opacity-20" />
                        : <Layout size={40} className="opacity-20" />}
                    </div>
                    <p className="text-sm font-semibold uppercase tracking-widest mb-2">
                      {seoTestMode ? 'Mode Test SEO actif' : 'Prêt pour la génération'}
                    </p>
                    <p className="text-[11px] not-italic max-w-[200px]">
                      {seoTestMode
                        ? 'Lance l\'analyse SERP + sémantique sans générer d\'article.'
                        : 'Remplissez le formulaire à gauche pour lancer le processus.'}
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-hidden flex flex-col space-y-6">
                    <ProgressLog events={events} />
                    {seoPreviewResult && <SeoPreviewPanel data={seoPreviewResult} />}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}



export default function GeneratePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background">
        <div className="h-16 border-b border-border px-6 flex items-center">
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="max-w-7xl mx-auto py-12 px-6">
          <Skeleton className="h-4 w-32 mb-8" />
          <div className="mb-12">
            <Skeleton className="h-10 w-64 mb-3" />
            <Skeleton className="h-6 w-96" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <Skeleton className="h-[600px] rounded-3xl" />
            <Skeleton className="h-[600px] rounded-3xl" />
          </div>
        </div>
      </div>
    }>
      <GeneratePageContent />
    </Suspense>
  );
}
