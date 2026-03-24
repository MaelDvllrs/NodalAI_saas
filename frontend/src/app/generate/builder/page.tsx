'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useProject } from '../../contexts/ProjectContext';
import AppLayout from '../../components/AppLayout';
import { LogEvent } from '../../components/ProgressLog';
import ProgressLog from '../../components/ProgressLog';
import { useTasks } from '../../contexts/TaskContext';
import { Globe, ArrowDownLeft, Save, Play, Download, RefreshCw, Loader2, ChevronLeft, Pencil, Check, X } from 'lucide-react';
import Link from 'next/link';
import { Skeleton } from '../../components/UI';
import WorkflowEditor, { CanvasBlock, SavedEdge } from '../../components/WorkflowEditor';
import type { WorkflowEditorActions } from '../../components/WorkflowEditor';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const STORAGE_KEY = 'blogauto_generation_job';

interface SavedWorkflow {
  id: string;
  name: string;
  workflow_json: {
    steps: { instanceId?: string; type: string; config: Record<string, unknown>; position?: { x: number; y: number } }[];
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
          position: s.position,
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
    const steps = blocks.map((b) => ({ instanceId: b.instanceId, type: b.type, config: b.config ?? {}, position: b.position }));
    await fetch(`${API_URL}/workflows/${workflowId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: workflow?.name, workflowJson: { steps, edges } }),
    });
  }

  async function handleRun(blocks: CanvasBlock[], edges: SavedEdge[]) {
    if (!selectedSite) {
      alert('Veuillez sélectionner un projet dans la barre latérale');
      return;
    }

    const UI_ONLY_TYPES = new Set(['trigger-manual']);
    const steps = blocks
      .filter(b => !UI_ONLY_TYPES.has(b.type))
      .map(b => ({ instanceId: b.instanceId, type: b.type, config: b.config ?? {} }));
    const stepIds = new Set(steps.map(s => s.instanceId));
    const filteredEdges = edges.filter(e => stepIds.has(e.source) && stepIds.has(e.target));

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
      siteUrl:  selectedSite!.url,
      dbSiteId: selectedSite!.id,
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
          edges: filteredEdges,
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

  const [isSaving, setIsSaving] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const isWorkflowLoading = !!workflowId && workflowLoading;
  const editorActionsRef = useRef<WorkflowEditorActions | null>(null);

  // Inline name editing
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  function startEditName() {
    setEditName(workflow?.name ?? '');
    setIsEditingName(true);
    setTimeout(() => nameInputRef.current?.select(), 0);
  }

  async function commitEditName() {
    const trimmed = editName.trim();
    if (!trimmed || !workflowId || !token) { setIsEditingName(false); return; }
    setIsEditingName(false);
    if (trimmed === workflow?.name) return;
    try {
      const state = editorActionsRef.current?.getState();
      await fetch(`${API_URL}/workflows/${workflowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: trimmed, workflowJson: state ? { steps: state.blocks, edges: state.edges } : workflow?.workflow_json }),
      });
      setWorkflow((prev) => prev ? { ...prev, name: trimmed } : prev);
    } catch { /* ignore */ }
  }

  function cancelEditName() {
    setIsEditingName(false);
  }

  function handleSaveClick() {
    if (isSaving) return;
    setIsSaving(true);
    editorActionsRef.current?.save?.();
    setTimeout(() => setIsSaving(false), 1200);
  }

  function handleExport() {
    const state = editorActionsRef.current?.getState();
    if (!state) return;
    const name = workflow?.name ?? 'workflow';
    const data = { name, workflowJson: { steps: state.blocks, edges: state.edges } };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppLayout>
      <div className="animate-fade-in h-full flex flex-col">
        <div className="w-full mx-auto flex flex-col flex-1 min-h-0">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 p-2 animate-slide-up border-b">
            <div className="flex items-center gap-3">
              <Link
                href="/generate"
                className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text transition-colors"
              >
                <ChevronLeft size={14} />
              </Link>
              {isEditingName ? (
                <div className="flex items-center gap-1">
                  <input
                    ref={nameInputRef}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={commitEditName}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitEditName(); if (e.key === 'Escape') cancelEditName(); }}
                    className="text-sm font-medium bg-background border border-accent rounded px-2 py-0.5 outline-none w-52"
                    autoFocus
                  />
                  <button onClick={commitEditName} className="text-green-400 hover:text-green-300 transition-colors"><Check size={13} /></button>
                  <button onClick={cancelEditName} className="text-text-muted hover:text-text transition-colors"><X size={13} /></button>
                </div>
              ) : (
                <button
                  onClick={workflowId ? startEditName : undefined}
                  className="group flex items-center gap-1.5 text-sm font-medium hover:text-text transition-colors"
                >
                  {workflow?.name ?? 'Workflow Builder'}
                  {workflowId && <Pencil size={11} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />}
                </button>
              )}
            </div>

            {!isWorkflowLoading && sites.length > 0 && (
              <div className="flex items-center gap-2">
                {events.length > 0 && (
                  <label className="flex items-center gap-1.5 cursor-pointer select-none group">
                    <div className="relative flex items-center">
                      <input type="checkbox" checked={showLogs} onChange={(e) => setShowLogs(e.target.checked)} className="sr-only" />
                      <div className={`w-7 h-4 rounded-full transition-colors duration-200 ${showLogs ? 'bg-accent' : 'bg-border'}`}>
                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-all duration-200 ${showLogs ? 'left-[15px]' : 'left-0.5'}`} />
                      </div>
                    </div>
                    <span className="text-[10px] text-text-muted group-hover:text-text transition-colors">Logs</span>
                  </label>
                )}
                {!isLoading && (
                  <button type="button" onClick={handleExport} className="btn-secondary gap-2 text-xs">
                    <Download size={13} />
                    Exporter
                  </button>
                )}
                {workflowId && !isLoading && (
                  <button type="button" onClick={handleSaveClick} disabled={isSaving} className="btn-secondary gap-2 text-xs disabled:opacity-40">
                    {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    Sauvegarder
                  </button>
                )}
                {!isLoading ? (
                  <button
                    type="button"
                    onClick={() => editorActionsRef.current?.run?.()}
                    className="btn-primary gap-2 text-xs"
                  >
                    <Play size={13} />
                    Lancer
                  </button>
                ) : (
                  <div className="px-3 py-1.5 flex items-center gap-2 rounded-xl bg-accent/5 border border-accent/20 text-accent text-xs font-semibold">
                    <Loader2 size={13} className="animate-spin" />
                    En cours...
                  </div>
                )}
                {events.length > 0 && !isLoading && (
                  <button type="button" onClick={handleReset} className="btn-secondary gap-2 text-xs">
                    <RefreshCw size={11} />
                    Réinitialiser
                  </button>
                )}
              </div>
            )}
          </div>

          {sitesLoading || isWorkflowLoading ? (
            <div className="flex gap-6 flex-1 min-h-0">
              <Skeleton className="w-72 rounded-xl shrink-0" />
              <Skeleton className="flex-1 rounded-xl" />
            </div>
          ) : sites.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-10 text-center animate-slide-up">
              <div className="w-16 h-16 bg-accent/5 rounded-full flex items-center justify-center mx-auto mb-5">
                <Globe className="text-accent" size={40} />
              </div>
              <h2 className="text-2xl font-bold mb-3">Aucun site configuré</h2>
              <p className="text-text-muted mb-6 max-w-sm mx-auto font-medium">Vous devez d'abord connecter un projet Webflow pour commencer à générer du contenu.</p>
              <Link href="/dashboard" className="btn-primary uppercase tracking-widest">
                Ajouter mon premier site
              </Link>
            </div>
          ) : (
            <div className="flex-1 min-h-0">
              <WorkflowEditor
                isRunning={isLoading}
                events={events}
                onRun={handleRun}
                onReset={handleReset}
                initialBlocks={initialBlocks}
                initialEdges={initialEdges}
                onSave={workflowId ? handleSave : undefined}
                onExport={handleExport}
                actionsRef={editorActionsRef}
                hideActions
                showLogs={showLogs}
                monitoring={events.length > 0 ? <ProgressLog events={events} /> : undefined}
              />
            </div>
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
