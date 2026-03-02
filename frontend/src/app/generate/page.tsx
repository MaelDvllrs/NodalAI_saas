'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedRoute from '../components/ProtectedRoute';
import Navbar from '../components/Navbar';
import { LogEvent } from '../components/ProgressLog';
import ProgressLog from '../components/ProgressLog';
import { Sparkles, Globe, Type, Settings2, FileEdit, Rocket, RefreshCw, ChevronLeft, Terminal, Layout } from 'lucide-react';
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
    setIsLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    const selectedSite = sites.find(s => s.id === selectedSiteId);
    if (!selectedSite) {
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
    jobIdRef.current = null;
    localStorage.removeItem(STORAGE_KEY);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_URL}/generate`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          siteId: selectedSite.webflow_site_id,
          apiKey: selectedSite.webflow_api_key,
          collectionName: selectedSite.webflow_collection_name,
          theme: themeOrKeyword,
          directKeyword: keywordMode === 'keyword' ? directKeyword : undefined,
          tone: toneMode === 'custom' ? customTone : tone,
          status,
          siteUrl: selectedSite.url,
          dbSiteId: selectedSite.id,
        }),
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

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="btn-accent w-full py-2.5 text-sm font-semibold uppercase tracking-[0.1em] shadow-lg shadow-accent/20 gap-3"
                  >
                    {isLoading ? (
                      <>
                        <Spinner className="w-5 h-5" />
                        <span>Traitement intelligent...</span>
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
                      <Terminal size={16} />
                    </div>
                    <h3 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">Monitor de Progression</h3>
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
                      <Layout size={40} className="opacity-20" />
                    </div>
                    <p className="text-sm font-semibold uppercase tracking-widest mb-2">Prêt pour la génération</p>
                    <p className="text-[11px] not-italic max-w-[200px]">Remplissez le formulaire à gauche pour lancer le processus.</p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-hidden flex flex-col">
                    <ProgressLog events={events} />
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
