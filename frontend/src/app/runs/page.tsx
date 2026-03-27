'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppLayout from '../components/AppLayout';
import {
  Layers, CheckCircle2, AlertCircle, Loader2, Clock, Timer,
  ChevronRight, Eye, ArrowDown, ArrowUp, Search, X,
} from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '../contexts/AuthContext';
import { useProject } from '../contexts/ProjectContext';
import { useTasks } from '../contexts/TaskContext';
import { computeProgress } from '../utils/taskProgress';
import { Skeleton, SelectMenu } from '../components/UI';
import { cn } from '../utils/cn';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const LS_KEY  = 'runs_filters';

type SortDir = 'asc' | 'desc';
type Filters = { workflowId: string; status: string; search: string; sort: SortDir };
const DEFAULT_FILTERS: Filters = { workflowId: '', status: '', search: '', sort: 'desc' };

function loadFilters(): Filters {
  if (typeof window === 'undefined') return DEFAULT_FILTERS;
  try { return { ...DEFAULT_FILTERS, ...JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') }; }
  catch { return DEFAULT_FILTERS; }
}
function saveFilters(f: Filters) { localStorage.setItem(LS_KEY, JSON.stringify(f)); }

interface WorkflowRun {
  id: string;
  user_id: string;
  workflow_id: string | null;
  project_id: string | null;
  status: 'running' | 'done' | 'error';
  created_at: string;
  updated_at: string;
  workflows: { name: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(startIso: string, endIso?: string, now?: Date): string {
  const ms = (endIso ? new Date(endIso) : (now ?? new Date())).getTime() - new Date(startIso).getTime();
  if (ms < 1000) return '< 1s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: WorkflowRun['status'] }) {
  if (status === 'done') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tight bg-green-500/10 text-green-400">
      <CheckCircle2 size={10} /> Terminé
    </span>
  );
  if (status === 'error') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tight bg-red-500/10 text-red-400">
      <AlertCircle size={10} /> Erreur
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tight bg-accent/10 text-accent">
      <Loader2 size={10} className="animate-spin" /> En cours
    </span>
  );
}

const AVATAR_COLORS = [
  ['#7c3aed', '#ffffff'], ['#2563eb', '#ffffff'], ['#059669', '#ffffff'],
  ['#d97706', '#ffffff'], ['#dc2626', '#ffffff'], ['#0891b2', '#ffffff'],
];
function UserAvatar({ label }: { label: string }) {
  const initials = label.slice(0, 2).toUpperCase();
  const seed = label.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const [bg, fg] = AVATAR_COLORS[seed % AVATAR_COLORS.length];
  return (
    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold"
      style={{ backgroundColor: bg, color: fg }} title={label}>
      {initials}
    </div>
  );
}

// ── Main content ──────────────────────────────────────────────────────────────

function TasksContent() {
  const { token, user } = useAuth();
  const { selectedSiteId } = useProject();
  const { getTaskByJobId } = useTasks();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [runs, setRuns]       = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow]         = useState(() => new Date());
  const [filters, setFilters] = useState<Filters>(() => loadFilters());

  // On mount: if URL has workflowId, apply it
  useEffect(() => {
    const urlWorkflowId = searchParams.get('workflowId');
    if (urlWorkflowId) {
      const f = { ...loadFilters(), workflowId: urlWorkflowId };
      setFilters(f); saveFilters(f);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters(prev => { const next = { ...prev, [key]: value }; saveFilters(next); return next; });
  }

  // Tick for live durations
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Fetch runs
  const fetchRuns = useCallback(() => {
    if (!token) return;
    const params = selectedSiteId ? `?projectId=${selectedSiteId}` : '';
    fetch(`${API_URL}/workflow/runs${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setRuns(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, selectedSiteId]);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  // Poll every 5s while running tasks exist
  useEffect(() => {
    if (!runs.some(r => r.status === 'running')) return;
    const id = setInterval(fetchRuns, 5000);
    return () => clearInterval(id);
  }, [runs, fetchRuns]);

  // Workflow filter options
  const workflowOptions = useMemo(() => {
    const seen = new Map<string, string>();
    runs.forEach(r => { if (r.workflow_id && r.workflows?.name) seen.set(r.workflow_id, r.workflows.name); });
    return Array.from(seen.entries()).map(([id, name]) => ({ value: id, label: name }));
  }, [runs]);

  // Filter + sort
  const filtered = useMemo(() => {
    let list = [...runs];
    if (filters.workflowId) list = list.filter(r => r.workflow_id === filters.workflowId);
    if (filters.status)     list = list.filter(r => r.status === filters.status);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(r =>
        (r.workflows?.name ?? '').toLowerCase().includes(q) || r.id.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return filters.sort === 'asc' ? diff : -diff;
    });
    return list;
  }, [runs, filters]);

  const hasFilters = !!(filters.workflowId || filters.status || filters.search || filters.sort !== 'desc');

  // Progress for a run: cross-reference TaskContext for running tasks
  function getProgress(run: WorkflowRun): number {
    if (run.status === 'done')  return 100;
    if (run.status === 'error') return 0;
    const task = getTaskByJobId(run.id);
    return task ? computeProgress(task) : -1; // -1 = indeterminate
  }

  const userLabel = user?.name || user?.email || 'Utilisateur';

  return (
    <AppLayout>
      <div className="h-full flex flex-col">

        {/* ── Filter bar ── */}
        {!loading && runs.length > 0 && (
          <div className="shrink-0 flex items-center gap-3 p-4 animate-slide-up">

            <div className="relative">
              <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted/50" />
              <input
                type="text"
                value={filters.search}
                onChange={e => setFilter('search', e.target.value)}
                placeholder="Rechercher…"
                className={cn('input-base text-xs py-1.5 pl-7 pr-7 w-40 transition-all focus:w-52', filters.search && 'border-accent/50')}
              />
              {filters.search && (
                <button type="button" onClick={() => setFilter('search', '')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted/50 hover:text-text-muted">
                  <X size={11} />
                </button>
              )}
            </div>

            <button
              onClick={() => setFilter('sort', filters.sort === 'desc' ? 'asc' : 'desc')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors shrink-0',
                filters.sort !== 'desc'
                  ? 'border-accent/50 text-accent bg-accent/5'
                  : 'border-border text-text-muted hover:text-text bg-card',
              )}
            >
              {filters.sort === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
              Date
            </button>

            <SelectMenu
              value={filters.status}
              onChange={v => setFilter('status', v)}
              placeholder="Tous les statuts"
              active={!!filters.status}
              options={[
                { value: '', label: 'Tous les statuts' },
                { value: 'running', label: 'En cours' },
                { value: 'done',    label: 'Terminé' },
                { value: 'error',   label: 'Erreur' },
              ]}
            />

            {workflowOptions.length > 1 && (
              <SelectMenu
                value={filters.workflowId}
                onChange={v => setFilter('workflowId', v)}
                placeholder="Tous les workflows"
                active={!!filters.workflowId}
                options={[{ value: '', label: 'Tous les workflows' }, ...workflowOptions]}
              />
            )}

            <button
              onClick={() => { setFilters(DEFAULT_FILTERS); saveFilters(DEFAULT_FILTERS); }}
              disabled={!hasFilters}
              className={cn(
                'text-xs underline-offset-2 shrink-0 transition-colors px-1',
                hasFilters ? 'text-text hover:text-text/70' : 'text-text-muted cursor-default',
              )}
            >
              Réinitialiser
            </button>

            <span className="ml-auto text-xs text-text-muted shrink-0">
              {filtered.length} résultat{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* ── Table ── */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
          {loading ? (
            <div className="px-4 space-y-3 pt-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-2">
                  <Skeleton className="w-9 h-9 rounded-lg" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-2 w-32 rounded-full" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-7 w-16 rounded-md" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Layers className="text-text-muted mb-4 opacity-20" size={48} />
              <h3 className="text-lg font-bold mb-1">
                {runs.length === 0 ? 'Aucune tâche' : 'Aucun résultat'}
              </h3>
              <p className="text-text-muted text-sm mb-6">
                {runs.length === 0
                  ? 'Lancez un workflow pour voir vos tâches ici.'
                  : 'Essayez de modifier les filtres.'}
              </p>
              {runs.length === 0 && (
                <Link href="/generate" className="btn-primary text-sm">Lancer un workflow</Link>
              )}
            </div>
          ) : (
            <table className="w-full text-left border-separate border-spacing-0">
              <thead className="sticky bg-surface top-0 z-10 [box-shadow:0_1px_0_var(--border),inset_1px_1px_0_var(--border)]">
                <tr>
                  <th className="px-4 py-3 text-[10px] font-bold text-text-muted uppercase tracking-widest">Workflow</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-text-muted uppercase tracking-widest">Progression</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-text-muted uppercase tracking-widest">Statut</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-text-muted uppercase tracking-widest">Par</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-text-muted uppercase tracking-widest">
                    <button
                      onClick={() => setFilter('sort', filters.sort === 'desc' ? 'asc' : 'desc')}
                      className="inline-flex items-center gap-1 hover:text-text transition-colors uppercase"
                    >
                      Date
                      {filters.sort === 'desc' ? <ArrowDown size={10} /> : <ArrowUp size={10} />}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-[10px] font-bold text-text-muted uppercase tracking-widest">Durée</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-text-muted uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(run => {
                  const progress = getProgress(run);
                  const isRunning = run.status === 'running';

                  return (
                    <tr key={run.id} className="group hover:bg-accent-hover transition-colors">

                      {/* Workflow */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-accent/10 rounded-lg shrink-0">
                            <Layers className="text-accent" size={14} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-text truncate max-w-[220px]">
                              {run.workflows?.name ?? 'Workflow ad-hoc'}
                            </p>
                            <p className="text-[10px] text-text-muted font-mono mt-0.5">{run.id.slice(0, 8)}…</p>
                          </div>
                        </div>
                      </td>

                      {/* Progression */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-[140px]">
                          <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                            {progress === -1 ? (
                              <div className="h-full w-1/2 rounded-full bg-accent animate-pulse" />
                            ) : (
                              <div
                                className={cn(
                                  'h-full rounded-full transition-all duration-700 ease-out',
                                  run.status === 'error' ? 'bg-red-500' :
                                  run.status === 'done'  ? 'bg-green-500' : 'bg-accent',
                                )}
                                style={{ width: `${progress}%` }}
                              />
                            )}
                          </div>
                          <span className="text-[10px] text-text-muted font-mono shrink-0 w-8 text-right">
                            {progress === -1 ? '…' : `${progress}%`}
                          </span>
                        </div>
                      </td>

                      {/* Statut */}
                      <td className="px-4 py-3">
                        <StatusBadge status={run.status} />
                      </td>

                      {/* Exécuté par */}
                      <td className="px-4 py-3">
                        <UserAvatar label={userLabel} />
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-text-muted">
                          <Clock size={12} />
                          <span className="text-xs">
                            {new Date(run.created_at).toLocaleDateString('fr-FR', {
                              day: '2-digit', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </td>

                      {/* Durée */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-text-muted">
                          <Timer size={12} />
                          <span className="text-xs font-mono">
                            {isRunning
                              ? formatDuration(run.created_at, undefined, now)
                              : formatDuration(run.created_at, run.updated_at)}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {isRunning && (
                            <button
                              onClick={() => router.push(`/generate/builder?resume=${run.id}`)}
                              className="inline-flex items-center justify-center p-1.5 bg-background border border-border rounded-md hover:border-accent/40 hover:text-accent transition-all text-text-muted"
                              title="Voir l'exécution en cours"
                            >
                              <Eye size={13} />
                            </button>
                          )}
                          <Link
                            href={`/runs/${run.id}`}
                            className="inline-flex items-center justify-center p-1.5 bg-background border border-border rounded-md hover:border-accent/40 hover:text-accent transition-all text-text-muted"
                            title="Voir le détail"
                          >
                            <ChevronRight size={14} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={
      <AppLayout>
        <div className="px-6 py-8 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
        </div>
      </AppLayout>
    }>
      <TasksContent />
    </Suspense>
  );
}
