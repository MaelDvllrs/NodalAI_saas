'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const LS_KEY = 'runs_filters';
type Filters = { workflowId: string; status: string; userId: string; search: string; sort: 'asc' | 'desc' };
const DEFAULT_FILTERS: Filters = { workflowId: '', status: '', userId: '', search: '', sort: 'desc' };

function loadFilters(): Filters {
  if (typeof window === 'undefined') return DEFAULT_FILTERS;
  try { return { ...DEFAULT_FILTERS, ...JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') }; }
  catch { return DEFAULT_FILTERS; }
}
function saveFilters(f: Filters) {
  localStorage.setItem(LS_KEY, JSON.stringify(f));
}
import { useAuth } from '../contexts/AuthContext';
import { useProject } from '../contexts/ProjectContext';
import AppLayout from '../components/AppLayout';
import { History, CheckCircle2, AlertCircle, Loader2, Clock, ChevronRight, Layers, ArrowDownUp, ArrowDown, ArrowUp, Search, X } from 'lucide-react';
import Link from 'next/link';
import { Skeleton, SelectMenu } from '../components/UI';
import { cn } from '../utils/cn';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface WorkflowRun {
  id: string;
  user_id: string;
  workflow_id: string | null;
  project_id: string | null;
  status: 'running' | 'done' | 'error';
  created_at: string;
  updated_at: string;
  workflows: { name: string } | null;
  sites: { name: string } | null;
}

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

function UserAvatar({ name, email }: { name?: string; email: string }) {
  const initials = (name?.trim() || email).slice(0, 2).toUpperCase();
  return (
    <div className="w-7 h-7 rounded-full bg-accent/15 flex items-center justify-center shrink-0" title={name || email}>
      <span className="text-[10px] font-bold text-accent leading-none">{initials}</span>
    </div>
  );
}

function RunsListContent() {
  const { token, user } = useAuth();
  const { selectedSiteId } = useProject();
  const searchParams = useSearchParams();
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(() => loadFilters());

  // On mount: if URL has workflowId (coming from generate page), use it; otherwise load from localStorage
  useEffect(() => {
    const urlWorkflowId = searchParams.get('workflowId');
    if (urlWorkflowId) {
      const f = { ...loadFilters(), workflowId: urlWorkflowId };
      setFilters(f);
      saveFilters(f);
    } else {
      setFilters(loadFilters());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filterWorkflow = filters.workflowId;
  const filterStatus   = filters.status;
  const filterUserId   = filters.userId;
  const filterSearch   = filters.search;
  const sortDir        = filters.sort;

  function setFilter(key: keyof Filters, value: string) {
    setFilters(prev => {
      const next = { ...prev, [key]: value } as Filters;
      saveFilters(next);
      return next;
    });
  }

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const params = selectedSiteId ? `?projectId=${selectedSiteId}` : '';
    fetch(`${API_URL}/workflow/runs${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setRuns(Array.isArray(data) ? data : []))
      .catch(() => setRuns([]))
      .finally(() => setLoading(false));
  }, [token, selectedSiteId]);

  // Unique workflows derived from runs data
  const workflowOptions = useMemo(() => {
    const seen = new Map<string, string>();
    runs.forEach(r => {
      if (r.workflow_id && r.workflows?.name) seen.set(r.workflow_id, r.workflows.name);
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [runs]);

  // Unique users derived from runs + current user info
  const userOptions = useMemo(() => {
    const seen = new Set<string>();
    runs.forEach(r => { if (r.user_id) seen.add(r.user_id); });
    return Array.from(seen).map(uid => ({
      value: uid,
      label: uid === user?.id ? (user?.name || user?.email || uid.slice(0, 8)) : uid.slice(0, 8),
    }));
  }, [runs, user]);

  // Client-side filter + sort
  const filtered = useMemo(() => {
    let list = [...runs];
    if (filterWorkflow) list = list.filter(r => r.workflow_id === filterWorkflow);
    if (filterStatus)   list = list.filter(r => r.status === filterStatus);
    if (filterUserId)   list = list.filter(r => r.user_id === filterUserId);
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      list = list.filter(r =>
        (r.workflows?.name ?? '').toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortDir === 'asc' ? diff : -diff;
    });
    return list;
  }, [runs, filterWorkflow, filterStatus, filterUserId, sortDir]);

  const hasFilters = !!(filterWorkflow || filterStatus || filterUserId || filterSearch || sortDir !== 'desc');
  void searchParams; // used only on mount via useEffect

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto py-8 px-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 animate-slide-up">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted mb-1">Exécutions</p>
            <h1 className="text-2xl font-bold tracking-tight">Historique des exécutions</h1>
          </div>
        </div>

        {/* Filter bar */}
        {!loading && runs.length > 0 && (
          <div className="flex items-center gap-3 mb-4 animate-slide-up">

            {/* Left: count */}
            <span className="text-xs text-text-muted shrink-0">{filtered.length} résultat{filtered.length !== 1 ? 's' : ''}</span>

            {/* Right: reset + sort + filters */}
            <div className="ml-auto flex items-center gap-2">

              {/* Reset */}
              <button
                onClick={() => { setFilters(DEFAULT_FILTERS); saveFilters(DEFAULT_FILTERS); }}
                disabled={!hasFilters}
                className={cn(
                  'text-xs underline underline-offset-2 shrink-0 transition-colors px-1',
                  hasFilters ? 'text-text hover:text-text/70' : 'text-text-muted/30 cursor-default no-underline',
                )}
              >
                Réinitialiser
              </button>

              {/* Search */}
              <div className="relative">
                <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted/50" />
                <input
                  type="text"
                  value={filterSearch}
                  onChange={e => setFilter('search', e.target.value)}
                  placeholder="Rechercher…"
                  className={cn('input-base text-xs py-1.5 pl-7 pr-7 w-40 transition-all focus:w-52', filterSearch && 'border-accent/50')}
                />
                {filterSearch && (
                  <button type="button" onClick={() => setFilter('search', '')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted/50 hover:text-text-muted">
                    <X size={11} />
                  </button>
                )}
              </div>

              {/* Sort button */}
              <button
                onClick={() => setFilter('sort', sortDir === 'desc' ? 'asc' : 'desc')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors shrink-0',
                  sortDir !== 'desc'
                    ? 'border-accent/50 text-accent bg-accent/5'
                    : 'border-border text-text-muted hover:border-border hover:text-text bg-surface',
                )}
              >
                {sortDir === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                Date
              </button>

              {/* User filter */}
              <SelectMenu
                value={filterUserId}
                onChange={v => setFilter('userId', v)}
                placeholder="Tous les utilisateurs"
                active={!!filterUserId}
                options={[
                  { value: '', label: 'Tous les utilisateurs' },
                  ...userOptions,
                ]}
              />

              {/* Workflow filter */}
              <SelectMenu
                value={filterWorkflow}
                onChange={v => setFilter('workflowId', v)}
                placeholder="Tous les workflows"
                active={!!filterWorkflow}
                options={[
                  { value: '', label: 'Tous les workflows' },
                  ...workflowOptions.map(w => ({ value: w.id, label: w.name })),
                ]}
              />

              {/* Status filter */}
              <SelectMenu
                value={filterStatus}
                onChange={v => setFilter('status', v)}
                placeholder="Tous les statuts"
                active={!!filterStatus}
                options={[
                  { value: '', label: 'Tous les statuts' },
                  { value: 'done', label: 'Terminé' },
                  { value: 'error', label: 'Erreur' },
                  { value: 'running', label: 'En cours' },
                ]}
              />
            </div>
          </div>
        )}

        {loading ? (
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-4">
                    <Skeleton className="w-9 h-9 rounded-lg" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-7 w-7 rounded-md" />
                </div>
              ))}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-surface border border-dashed border-border rounded-lg">
            <History className="text-text-muted mb-4 opacity-20" size={48} />
            <h3 className="text-lg font-bold mb-1">{runs.length === 0 ? 'Aucune exécution' : 'Aucun résultat'}</h3>
            <p className="text-text-muted text-sm mb-6">
              {runs.length === 0 ? "Lancez un workflow pour voir l'historique ici." : 'Essayez de modifier les filtres.'}
            </p>
            {runs.length === 0 && (
              <Link href="/generate" className="btn-accent uppercase tracking-widest text-sm">Lancer un workflow</Link>
            )}
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-background/50 border-b border-border">
                    <th className="px-4 py-3 text-[10px] font-bold text-text-muted uppercase tracking-widest">Workflow</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-text-muted uppercase tracking-widest">Exécuté par</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-text-muted uppercase tracking-widest">Statut</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-text-muted uppercase tracking-widest">
                      <button
                        onClick={() => setFilter('sort', sortDir === 'desc' ? 'asc' : 'desc')}
                        className="inline-flex items-center gap-1 hover:text-text transition-colors"
                      >
                        Date
                        {sortDir === 'desc' ? <ArrowDown size={10} /> : <ArrowUp size={10} />}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-text-muted uppercase tracking-widest text-right">Détail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((run) => (
                    <tr key={run.id} className="group hover:bg-background/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-accent/10 rounded-lg shrink-0">
                            <Layers className="text-accent" size={14} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-text">
                              {run.workflows?.name ?? 'Workflow ad-hoc'}
                            </p>
                            <p className="text-[10px] text-text-muted font-mono mt-0.5">{run.id.slice(0, 8)}…</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <UserAvatar name={user?.name} email={user?.email ?? ''} />
                          <span className="text-xs text-text-muted truncate max-w-[140px]">{user?.name || user?.email}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={run.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-text-muted">
                          <Clock size={12} />
                          <span className="text-xs font-medium">
                            {new Date(run.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/runs/${run.id}`}
                          className="inline-flex items-center justify-center p-1.5 bg-background border border-border rounded-md hover:border-accent/40 hover:text-accent transition-all text-text-muted"
                          title="Voir le détail"
                        >
                          <ChevronRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export default function RunsPage() {
  return (
    <Suspense fallback={
      <AppLayout>
        <div className="max-w-7xl mx-auto py-8 px-6">
          <Skeleton className="h-9 w-72 mb-2" />
          <Skeleton className="h-5 w-96 mb-8" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </AppLayout>
    }>
      <RunsListContent />
    </Suspense>
  );
}
