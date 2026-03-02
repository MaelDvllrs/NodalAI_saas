'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedRoute from '../components/ProtectedRoute';
import Navbar from '../components/Navbar';
import { LogEvent } from '../components/ProgressLog';
import ProgressLog from '../components/ProgressLog';
import { Sparkles, Globe, Type, Settings2, FileEdit, Rocket, RefreshCw, ChevronLeft, Terminal } from 'lucide-react';
import { cn } from '../utils/cn';
import Link from 'next/link';

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
  const [tone, setTone] = useState('Expert et pédagogique');
  const [status, setStatus] = useState<'draft' | 'publish'>('draft');
  const [isLoading, setIsLoading] = useState(false);
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

    if (!theme) {
      alert('Veuillez entrer un thème');
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
          theme,
          tone,
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
      <div className="min-h-screen bg-background">
        <Navbar />

        <div className="max-w-7xl mx-auto py-12 px-6">
          <Link 
            href="/dashboard" 
            className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text mb-8 transition-colors group"
          >
            <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            Retour au Dashboard
          </Link>

          <div className="mb-12">
            <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
              Générer un article SEO
              <Sparkles className="text-accent" size={24} />
            </h1>
            <p className="text-text-muted">
              Configurez votre sujet et laissez l'IA optimiser votre contenu pour Webflow.
            </p>
          </div>

          {sites.length === 0 ? (
            <div className="bg-surface border border-border rounded-2xl p-12 text-center">
              <Globe className="mx-auto text-text-muted mb-4" size={48} />
              <p className="text-text-muted mb-8">Vous devez d'abord configurer un site Webflow.</p>
              <Link href="/dashboard" className="btn-primary">
                Ajouter un site
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
              {/* Left — Form */}
              <div className="bg-surface border border-border rounded-2xl p-8 sticky top-24">
                <form onSubmit={handleSubmit} className="space-y-8">
                  <div className="space-y-6">
                    {/* Site selection */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-2">
                        <Globe size={14} />
                        Projet Webflow
                      </label>
                      <select
                        value={selectedSiteId}
                        onChange={(e) => setSelectedSiteId(e.target.value)}
                        required
                        className="input-base cursor-pointer"
                      >
                        <option value="">Sélectionnez un projet</option>
                        {sites.map((site) => (
                          <option key={site.id} value={site.id}>
                            {site.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Theme */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-2">
                        <Type size={14} />
                        Sujet de l'article
                      </label>
                      <input
                        type="text"
                        placeholder="ex: Comment optimiser son SEO local en 2024"
                        value={theme}
                        onChange={(e) => setTheme(e.target.value)}
                        required
                        className="input-base"
                      />
                    </div>

                    {/* Tone */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-2">
                        <Settings2 size={14} />
                        Ton éditorial
                      </label>
                      <select
                        value={tone}
                        onChange={(e) => setTone(e.target.value)}
                        className="input-base cursor-pointer"
                      >
                        {TONE_OPTIONS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    {/* Status */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-text-muted">Mode de publication</label>
                      <div className="grid grid-cols-2 gap-3">
                        {(['draft', 'publish'] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setStatus(s)}
                            className={cn(
                              "flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-all",
                              status === s
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background border-border text-text-muted hover:border-text/20"
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
                    className="btn-primary w-full py-3 shadow-md shadow-primary/5 gap-2.5"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="animate-spin" size={18} />
                        Traitement intelligent...
                      </>
                    ) : (
                      <>
                        <Sparkles size={18} />
                        Générer l'article
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Right — Progress log */}
              <div className="bg-surface border border-border rounded-2xl p-8 min-h-[600px] flex flex-col">
                <div className="flex items-center justify-between mb-8 pb-4 border-b border-border">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-text-muted">Monitor de Progression</h3>
                  <div className="flex items-center gap-3">
                    {isLoading && (
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                        <span className="text-[10px] font-bold text-accent uppercase">Live</span>
                      </div>
                    )}
                    {events.length > 0 && !isLoading && (
                      <button
                        onClick={handleReset}
                        className="flex items-center gap-1.5 text-[10px] font-bold text-text-muted hover:text-text uppercase tracking-wider transition-colors"
                      >
                        <RefreshCw size={12} />
                        Effacer
                      </button>
                    )}
                  </div>
                </div>
                
                {events.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-text-muted opacity-50 italic">
                    <Terminal size={48} className="mb-4" />
                    <p className="text-sm">En attente de configuration...</p>
                  </div>
                ) : (
                  <ProgressLog events={events} />
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
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><span className="text-text-muted">Chargement...</span></div>}>
      <GeneratePageContent />
    </Suspense>
  );
}
