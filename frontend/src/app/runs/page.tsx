'use client';

import { useState, useEffect, Suspense } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useProject } from '../contexts/ProjectContext';
import AppLayout from '../components/AppLayout';
import { History, CheckCircle2, AlertCircle, Loader2, Clock, ChevronRight, Layers } from 'lucide-react';
import Link from 'next/link';
import { Skeleton } from '../components/UI';
import { cn } from '../utils/cn';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface WorkflowRun {
  id: string;
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

function RunsListContent() {
  const { token } = useAuth();
  const { selectedSiteId } = useProject();
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto py-8 px-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
            Historique des exécutions
            <History className="text-text-muted" size={28} />
          </h1>
          <p className="text-text-muted">
            Retrouvez toutes vos exécutions de workflows et leurs résultats détaillés.
          </p>
        </div>

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
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-surface border border-dashed border-border rounded-lg">
            <History className="text-text-muted mb-4 opacity-20" size={48} />
            <h3 className="text-lg font-bold mb-1">Aucune exécution</h3>
            <p className="text-text-muted text-sm mb-6">Lancez un workflow pour voir l'historique ici.</p>
            <Link href="/generate" className="btn-accent uppercase tracking-widest text-sm">Lancer un workflow</Link>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-background/50 border-b border-border">
                    <th className="px-4 py-3 text-[10px] font-bold text-text-muted uppercase tracking-widest">Workflow</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-text-muted uppercase tracking-widest">Projet</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-text-muted uppercase tracking-widest">Statut</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-text-muted uppercase tracking-widest">Date</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-text-muted uppercase tracking-widest text-right">Détail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {runs.map((run) => (
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
                        <span className="text-sm text-text-muted">{run.sites?.name ?? '—'}</span>
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
