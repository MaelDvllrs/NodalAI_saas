'use client';

import { useEffect, useMemo, Suspense } from 'react';
import { useAuth } from '../contexts/AuthContext';
import AppLayout from '../components/AppLayout';
import Link from 'next/link';
import { GitBranch, Globe, Layers, CheckCircle2, AlertCircle, Loader2, ChevronRight, ExternalLink } from 'lucide-react';
import { Skeleton } from '../components/UI';
import { useProject } from '../contexts/ProjectContext';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip as ChartTooltip,
} from 'chart.js';
import { useState } from 'react';

ChartJS.register(CategoryScale, LinearScale, BarElement, ChartTooltip);

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface WorkflowRun {
  id: string;
  workflow_id: string | null;
  status: 'running' | 'done' | 'error';
  created_at: string;
  workflows: { name: string } | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function StatusBadge({ status }: { status: WorkflowRun['status'] }) {
  if (status === 'done') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tight bg-green-500/10 text-green-400 shrink-0">
      <CheckCircle2 size={10} /> Terminé
    </span>
  );
  if (status === 'error') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tight bg-red-500/10 text-red-400 shrink-0">
      <AlertCircle size={10} /> Erreur
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tight bg-accent/10 text-accent shrink-0">
      <Loader2 size={10} className="animate-spin" /> En cours
    </span>
  );
}

function resolveCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function withAlpha(color: string, alpha: number): string {
  // getComputedStyle returns rgb(r, g, b) format
  const rgb = color.match(/\d+/g);
  if (rgb && rgb.length >= 3) return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
  // hex fallback
  if (color.startsWith('#')) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

function RunsBarChart({ runs }: { runs: WorkflowRun[] }) {
  const DAYS = 14;
  const [chartHovered, setChartHovered] = useState(false);

  const primary    = resolveCssVar('--color-primary', '#7c3aed');
  const textColor  = resolveCssVar('--text', '#e5e7eb');
  const mutedColor = resolveCssVar('--text-muted', '#6b7280');
  const bgCard     = resolveCssVar('--surface', '#121314');
  const border     = resolveCssVar('--border', '#374151');

  const data = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (DAYS - 1 - i));
      const dateStr = d.toISOString().slice(0, 10);
      const count = runs.filter(r => r.created_at.slice(0, 10) === dateStr).length;
      const MONTHS = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'];
      const label = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
      const fullLabel = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      return { dateStr, count, label, fullLabel };
    });
  }, [runs]);

  const chartData = {
    labels: data.map(d => d.label),
    datasets: [{
      data: data.map(d => d.count),
      backgroundColor: chartHovered ? withAlpha(primary, 0.5) : primary,
      hoverBackgroundColor: primary,
      borderRadius: 4,
      borderSkipped: false,
    }],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items: { dataIndex: number }[]) => data[items[0].dataIndex].fullLabel,
          label: (item: { raw: unknown }) => ` ${item.raw} exécution${Number(item.raw) !== 1 ? 's' : ''}`,
        },
        backgroundColor: bgCard,
        borderColor: border,
        borderWidth: 1,
        titleColor: textColor,
        bodyColor: mutedColor,
        padding: 10,
        cornerRadius: 8,
        titleFont: { weight: 'bold' as const, size: 12 },
        bodyFont: { size: 11 },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: mutedColor, font: { size: 10 }, maxRotation: 0 },
        border: { display: false },
      },
      y: {
        display: false,
        beginAtZero: true,
        ticks: { stepSize: 1 },
      },
    },
  };

  return (
    <div
      className="h-full min-h-[120px]"
      onMouseEnter={() => setChartHovered(true)}
      onMouseLeave={() => setChartHovered(false)}
    >
      <Bar data={chartData} options={options} />
    </div>
  );
}

function DashboardPage() {
  const { token, user } = useAuth();
  const { selectedSite, selectedSiteId, loading: projectLoading } = useProject();
  const [workflows, setWorkflows] = useState<{ id: string }[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    const runsParams = selectedSiteId ? `?projectId=${selectedSiteId}` : '';
    Promise.all([
      fetch(`${API_URL}/workflows`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : []),
      fetch(`${API_URL}/workflow/runs${runsParams}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : []),
    ])
      .then(([wf, runsData]) => {
        setWorkflows(Array.isArray(wf) ? wf : []);
        setRuns(Array.isArray(runsData) ? runsData : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, selectedSiteId]);

  const recentRuns = useMemo(() =>
    [...runs]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 6),
    [runs]
  );

  const faviconDomain = selectedSite?.url ? (() => {
    try { return new URL(selectedSite.url).hostname; } catch { return null; }
  })() : null;

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="max-w-7xl mx-auto py-8 px-6 space-y-8">

          {/* Greeting */}
          <div className="animate-slide-up">
            <h1 className="text-2xl font-bold tracking-tight">
              {(() => { const h = new Date().getHours(); return h >= 21 ? 'Bonne nuit' : h >= 18 ? 'Bonsoir' : h >= 12 ? 'Bonne après-midi' : h >= 5 ? 'Bonjour' : 'Bonne nuit'; })()}, {user?.name || user?.email?.split('@')[0] || 'vous'} 👋
            </h1>
          </div>

          {/* No project */}
          {!projectLoading && !selectedSite && (
            <div className="flex flex-col items-center justify-center py-20 bg-card/50 border-2 border-dashed border-border rounded-lg">
              <Globe className="text-text-muted/50 mb-6" size={40} />
              <h3 className="text-2xl font-bold mb-3">Aucun projet sélectionné</h3>
              <p className="text-text-muted mb-6 max-w-sm text-center font-medium">
                Sélectionnez un projet dans le menu de gauche ou créez-en un nouveau.
              </p>
              <Link href="/projects" className="btn-primary gap-2">Voir mes projets</Link>
            </div>
          )}

          {(selectedSite || projectLoading) && (
            <>
              {/* ── Section 1 — Infos projet ── */}
              <div className="animate-slide-up">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted mb-3">Projet</p>
                <div className="bg-card/50 border border-border rounded-lg p-5 flex items-center gap-5">
                  {/* Favicon */}
                  <div className="w-12 h-12 rounded-xl bg-bg border border-border flex items-center justify-center overflow-hidden shrink-0">
                    {faviconDomain ? (
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${faviconDomain}&sz=64`}
                        alt=""
                        width={32}
                        height={32}
                        className="w-12 h-12"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <Globe size={20} className="text-text-muted/50" />
                    )}
                  </div>

                  {/* Name + URL + Workflow count */}
                  <div className="flex-1 min-w-0">
                    {projectLoading || loading ? (
                      <>
                        <Skeleton className="h-5 w-48 mb-1.5" />
                        <Skeleton className="h-3.5 w-64" />
                      </>
                    ) : (
                      <>
                        <p className="text-lg font-bold tracking-tight truncate">{selectedSite?.name}</p>
                        {selectedSite?.url && (
                          <a
                            href={selectedSite.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors"
                          >
                            {selectedSite.url}
                            <ExternalLink size={11} />
                          </a>
                        )}
                        <div className="flex items-center gap-1.5 mt-1">
                          <Layers size={12} className="text-text-muted" />
                          <p className="text-xs text-text-muted font-medium">
                            <span className="font-bold text-text">{workflows.length}</span> workflow{workflows.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Section 2 — Exécutions ── */}
              <div className="animate-slide-up" style={{ animationDelay: '80ms' }}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted mb-3">Exécutions</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                  {/* Left: count + chart */}
                  <div className="lg:col-span-1 bg-card/50 border border-border rounded-lg p-5 flex flex-col gap-4">
                    <div className="flex items-start justify-between shrink-0">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted mb-1">Total</p>
                        {loading ? <Skeleton className="h-10 w-16" /> : (
                          <p className="text-4xl font-bold tracking-tight">{runs.length}</p>
                        )}
                        <p className="text-xs text-text-muted font-medium mt-1">exécutions enregistrées</p>
                      </div>
                      <Link href="/runs" className="btn-secondary text-xs gap-1">
                        Voir tout <ChevronRight size={12} />
                      </Link>
                    </div>

                    <div className="flex flex-col flex-1 min-h-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted mb-3 shrink-0">14 derniers jours</p>
                      {loading
                        ? <Skeleton className="flex-1 w-full rounded" />
                        : <div className="flex-1 min-h-0 overflow-x-auto"><RunsBarChart runs={runs} /></div>
                      }
                    </div>
                  </div>

                  {/* Right: recent runs table */}
                  <div className="lg:col-span-1 bg-card/50 border border-border rounded-lg overflow-hidden flex flex-col">
                    <div className="px-4 py-3 border-b border-border shrink-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">Dernières exécutions</p>
                    </div>

                    {loading ? (
                      <div className="p-4 space-y-2">
                        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-9 w-full rounded" />)}
                      </div>
                    ) : recentRuns.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-text-muted flex-1">
                        <Layers size={24} className="mb-2 opacity-30" />
                        <p className="text-xs font-medium">Aucune exécution</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-border overflow-y-auto">
                        {recentRuns.map(run => (
                          <div key={run.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-bg/50 transition-colors">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold truncate">{run.workflows?.name ?? '—'}</p>
                              <p className="text-[10px] text-text-muted">{formatDate(run.created_at)}</p>
                            </div>
                            <StatusBadge status={run.status} />
                            <Link
                              href={`/runs/${run.id}`}
                              className="text-text-muted hover:text-text transition-colors shrink-0"
                            >
                              <ChevronRight size={14} />
                            </Link>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              </div>

              {/* Quick actions */}
              <div className="animate-slide-up flex gap-2" style={{ animationDelay: '120ms' }}>
                <Link href="/generate" className="btn-primary gap-2">
                  <GitBranch size={13} />
                  Lancer un workflow
                </Link>
                <Link href="/runs" className="btn-secondary gap-2">
                  <Layers size={13} />
                  Toutes les exécutions
                </Link>
              </div>
            </>
          )}

        </div>
      </div>
    </AppLayout>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={
      <AppLayout>
        <div className="max-w-7xl mx-auto py-8 px-6 space-y-8">
          <Skeleton className="h-24 w-full rounded-lg" />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <Skeleton className="lg:col-span-3 h-52 rounded-lg" />
            <Skeleton className="lg:col-span-2 h-52 rounded-lg" />
          </div>
        </div>
      </AppLayout>
    }>
      <DashboardPage />
    </Suspense>
  );
}
