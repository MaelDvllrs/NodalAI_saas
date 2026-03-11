'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useProject } from '../../contexts/ProjectContext';
import AppLayout from '../../components/AppLayout';
import { LogEvent } from '../../components/ProgressLog';
import ProgressLog from '../../components/ProgressLog';
import { useTasks } from '../../contexts/TaskContext';
import { Sparkles, Globe, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Skeleton } from '../../components/UI';
import WorkflowEditor, { CanvasBlock, SavedEdge } from '../../components/WorkflowEditor';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const STORAGE_KEY = 'blogauto_generation_job';

interface SavedWorkflow {
  id: string;
  name: string;
  workflow_json: {
    steps: { instanceId?: string; type: string; config: Record<string, unknown> }[];
    edges?: SavedEdge[];
  };
}

function BuilderPageContent() {
  const { token } = useAuth();
  const { selectedSite, sites, loading: sitesLoading } = useProject();
  const searchParams = useSearchParams();
  const workflowId = searchParams.get('workflowId');

  // Workflow loading
  const [workflow, setWorkflow] = useState<SavedWorkflow | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState(!!workflowId);

  useEffect(() => {
    if (!workflowId || !token) return;
    setWorkflowLoading(true);
    fetch(`${API_URL}/workflows/${workflowId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setWorkflow(data))
      .catch(() => {})
      .finally(() => setWorkflowLoading(false));
  }, [workflowId, token]);

  // Convert saved steps → CanvasBlocks (undefined = use default pipeline)
  const initialBlocks: CanvasBlock[] | undefined = workflowId
    ? workflowLoading
      ? undefined // still loading — don't mount editor yet
      : (workflow?.workflow_json?.steps ?? []).map((s, i) => ({
          instanceId: s.instanceId ?? `loaded-${s.type}-${i}`,
          type: s.type,
          config: s.config,
        }))
    : undefined; // no workflowId — use default pipeline

  // Restore saved edges (undefined = auto-wire from node order)
  const initialEdges: SavedEdge[] | undefined = workflowId
    ? workflowLoading
      ? undefined
      : (workflow?.workflow_json?.edges ?? undefined)
    : undefined;

  // Job / SSE state
  const [isLoading, setIsLoading] = useState(false);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const taskIdRef = useRef<number | null>(null);
  const { addTask, appendEvent } = useTasks();

  // Restore previous job from localStorage on mount
  useEffect(() => {
    // Opening a saved workflow → start fresh, don't reconnect to an old job
    if (workflowId) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as { jobId: string; events: LogEvent[]; done: boolean; projectName?: string; mode?: 'generate' | 'seo-test' };
      if (!saved.jobId || !saved.events?.length) return;

      jobIdRef.current = saved.jobId;
      setEvents(saved.events);
      if (saved.done) return;

      setIsLoading(true);
      taskIdRef.current = addTask(saved.jobId, saved.projectName ?? 'Restauré', saved.mode ?? 'generate', {
        initialEvents: saved.events,
        initialStatus: 'running',
      });
      const skipCount = { value: saved.events.length };
      const es = new EventSource(`${API_URL}/stream/${saved.jobId}`);
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as LogEvent;
          if (skipCount.value > 0) { skipCount.value--; return; }
          if (taskIdRef.current !== null) appendEvent(taskIdRef.current, event);
          setEvents((prev) => {
            const next = [...prev, event];
            const done = event.type === 'done' || event.type === 'error';
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ jobId: saved.jobId, events: next, done, projectName: saved.projectName, mode: saved.mode }));
            return next;
          });
          if (event.type === 'done' || event.type === 'error') {
            es.close();
            setIsLoading(false);
          }
        } catch { /* ignore */ }
      };
      es.onerror = () => {
        es.close();
        setIsLoading(false);
        if (taskIdRef.current !== null) appendEvent(taskIdRef.current, { type: 'error', message: 'Connexion perdue.' });
      };
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleReset() {
    esRef.current?.close();
    localStorage.removeItem(STORAGE_KEY);
    jobIdRef.current = null;
    taskIdRef.current = null;
    setEvents([]);
    setIsLoading(false);
  }

  async function handleSave(blocks: CanvasBlock[], edges: SavedEdge[]) {
    if (!workflowId) return;
    const UI_ONLY_TYPES = new Set(['trigger-manual']);
    const steps = blocks
      .filter((b) => !UI_ONLY_TYPES.has(b.type))
      .map((b) => ({ instanceId: b.instanceId, type: b.type, config: b.config ?? {} }));
    // Only keep edges between non-UI nodes
    const stepIds = new Set(steps.map(s => s.instanceId));
    const filteredEdges = edges.filter(e => stepIds.has(e.source) && stepIds.has(e.target));
    await fetch(`${API_URL}/workflows/${workflowId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: workflow?.name, workflowJson: { steps, edges: filteredEdges } }),
    });
  }

  async function handleRun(blocks: CanvasBlock[]) {
    if (!selectedSite) {
      alert('Veuillez sélectionner un projet dans la barre latérale');
      return;
    }

    const UI_ONLY_TYPES = new Set(['trigger-manual']);
    const steps = blocks
      .filter(b => !UI_ONLY_TYPES.has(b.type))
      .map(b => ({ type: b.type, config: b.config ?? {} }));

    if (steps.length === 0) {
      alert('Ajoutez au moins un module au workflow avant de le lancer.');
      return;
    }

    const textInputBlocks = blocks.filter(b => b.type === 'text-input');
    const contentBlock    = blocks.find(b => b.type === 'content-generation');

    const theme         = textInputBlocks.find(b => b.config.outputKey === 'theme')?.config.value as string | undefined;
    const directKeyword = textInputBlocks.find(b => b.config.outputKey === 'directKeyword')?.config.value as string | undefined;
    const mainKeyword   = textInputBlocks.find(b => b.config.outputKey === 'mainKeyword')?.config.value as string | undefined;
    const tone          = (contentBlock?.config.tone as string) ?? 'Expert et pédagogique';

    const hasKeywordResearch = blocks.some(b => b.type === 'keyword-research');
    const hasSerpAnalysis    = blocks.some(b => b.type === 'serp-analysis');

    if (hasKeywordResearch && !theme && !directKeyword) {
      alert('Ajoutez un bloc "Entrée texte" avec un thème ou mot-clé direct en amont du module Recherche de mots-clés.');
      return;
    }
    if (!hasKeywordResearch && hasSerpAnalysis && !mainKeyword && !directKeyword) {
      alert('Ajoutez un bloc "Entrée texte" avec un mot-clé principal en amont du module Analyse SERP.');
      return;
    }

    const input = {
      siteId:         selectedSite!.webflow_site_id,
      apiKey:         selectedSite!.webflow_api_key,
      collectionName: selectedSite!.webflow_collection_name,
      siteUrl:        selectedSite!.url,
      dbSiteId:       selectedSite!.id,
      ...(theme         ? { theme }         : {}),
      ...(directKeyword ? { directKeyword } : {}),
      ...(mainKeyword   ? { mainKeyword }   : {}),
      tone,
    };

    esRef.current?.close();
    setEvents([]);
    jobIdRef.current = null;
    localStorage.removeItem(STORAGE_KEY);
    setIsLoading(true);

    try {
      const _projectName = selectedSite?.name ?? 'Projet';
      const res = await fetch(`${API_URL}/workflow/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          steps,
          input,
          projectId: selectedSite!.id,
          ...(workflowId ? { workflowId } : {}),
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
      const projectName = _projectName;
      const jobMode = 'generate' as const;
      taskIdRef.current = addTask(jobId, projectName, jobMode);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ jobId, events: [], done: false, projectName, mode: jobMode }));

      const es = new EventSource(`${API_URL}/stream/${jobId}`);
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as LogEvent;
          console.log('[Builder SSE] received event:', event.type, event);
          if (taskIdRef.current !== null) appendEvent(taskIdRef.current, event);
          setEvents((prev) => {
            const next = [...prev, event];
            const done = event.type === 'done' || event.type === 'error';
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ jobId, events: next, done, projectName, mode: jobMode }));
            return next;
          });
          if (event.type === 'done' || event.type === 'error') {
            es.close();
            setIsLoading(false);
          }
        } catch { /* ignore */ }
      };

      es.onerror = () => {
        es.close();
        setIsLoading(false);
        const errEvent: LogEvent = { type: 'error', message: 'Connexion au serveur perdue.' };
        if (taskIdRef.current !== null) appendEvent(taskIdRef.current, errEvent);
        setEvents((prev) => {
          const next = [...prev, errEvent];
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ jobId, events: next, done: true, projectName, mode: jobMode }));
          return next;
        });
      };
    } catch (err) {
      setEvents([{ type: 'error', message: (err as Error).message }]);
      setIsLoading(false);
    }
  }

  const isWorkflowLoading = !!workflowId && workflowLoading;

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="max-w-[1400px] mx-auto py-8 px-6">
          <div className="mb-8 animate-slide-up">
            <Link href="/generate" className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text mb-4 transition-colors">
              <ArrowLeft size={14} />
              Retour aux workflows
            </Link>
            <h1 className="text-4xl font-bold tracking-tight mb-3 flex items-center gap-4">
              {workflow?.name ?? 'Workflow Builder'}
              <div className="p-2 bg-accent/10 rounded-md">
                <Sparkles className="text-accent" size={28} />
              </div>
            </h1>
            <p className="text-md text-text-muted max-w-2xl">
              Assemblez des modules pour créer votre pipeline de génération de contenu SEO sur mesure.
            </p>
          </div>

          {sitesLoading || isWorkflowLoading ? (
            <div className="flex gap-6">
              <Skeleton className="w-72 h-[600px] rounded-xl shrink-0" />
              <Skeleton className="flex-1 h-[600px] rounded-xl" />
            </div>
          ) : sites.length === 0 ? (
            <div className="bg-surface border border-border rounded-lg p-10 text-center animate-slide-up">
              <div className="w-16 h-16 bg-accent/5 rounded-full flex items-center justify-center mx-auto mb-5">
                <Globe className="text-accent" size={40} />
              </div>
              <h2 className="text-2xl font-bold mb-3">Aucun site configuré</h2>
              <p className="text-text-muted mb-6 max-w-sm mx-auto font-medium">Vous devez d'abord connecter un projet Webflow pour commencer à générer du contenu.</p>
              <Link href="/dashboard" className="btn-accent uppercase tracking-widest">
                Ajouter mon premier site
              </Link>
            </div>
          ) : (
            <WorkflowEditor
              isRunning={isLoading}
              events={events}
              onRun={handleRun}
              onReset={handleReset}
              initialBlocks={initialBlocks}
              initialEdges={initialEdges}
              onSave={workflowId ? handleSave : undefined}
              monitoring={events.length > 0 ? <ProgressLog events={events} /> : undefined}
            />
          )}
        </div>
      </div>
    </AppLayout>
  );
}

export default function BuilderPage() {
  return (
    <Suspense fallback={
      <AppLayout>
        <div className="max-w-7xl mx-auto py-8 px-6">
          <div className="mb-8">
            <Skeleton className="h-4 w-40 mb-4" />
            <Skeleton className="h-10 w-64 mb-3" />
            <Skeleton className="h-6 w-96" />
          </div>
          <div className="flex gap-6">
            <Skeleton className="w-72 h-[600px] rounded-xl shrink-0" />
            <Skeleton className="flex-1 h-[600px] rounded-xl" />
          </div>
        </div>
      </AppLayout>
    }>
      <BuilderPageContent />
    </Suspense>
  );
}
